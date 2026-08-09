// 月读 YueDu — 把我的回复读给你听
// 监听 Hanako 会话事件流，识别助手回复完成，用 edge-tts 合成中文语音并本机播放。
//
// 原理：
//   1. bus.subscribe 订阅会话事件流（message_end / turn_end / agent_end）
//   2. 只处理月见栖（hanako）自己会话的事件
//   3. 用 session:history 拉取消息，按"消息计数基线"只朗读新增部分
//   4. cleanText 清洗 markdown，edge-tts 合成 mp3，MCI (winmm) 播放
//
// 依赖：Python3 + edge-tts（pip install edge-tts），Windows 系统。

import { appendFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { edgeTts, sapiSpeak } from "./lib/tts.js";
import { playMp3 } from "./lib/player.js";
import { cleanText } from "./lib/cleaner.js";

function debugLog(dataDir, line) {
  try {
    mkdirSync(dataDir, { recursive: true });
    appendFileSync(join(dataDir, "debug.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

function hashText(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

// 消息完成类事件：这些事件出现时才检查历史
const DONE_EVENTS = new Set(["message_end", "turn_end", "agent_end"]);

export default class YueDuPlugin {
  async onload() {
    const { bus, config, log, dataDir } = this.ctx;
    this.ctxRef = { dataDir };

    // 状态
    this.counts = new Map(); // sessionPath -> 已处理消息数（基线）
    this.spokenContent = new Set(); // 内容哈希去重（双保险）
    this.booted = new Set(); // 已建立基线的 session
    this.seenTypes = new Set(); // 调试：只记录新事件类型
    this._queue = Promise.resolve();
    this._lastCheckAt = 0;

    // 清理旧的调试日志与语音临时文件
    try {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(join(dataDir, "debug.log"), "");
      for (const f of readdirSync(dataDir)) {
        if (/^speak-.*\.mp3$/.test(f)) {
          try { rmSync(join(dataDir, f), { force: true }); } catch {}
        }
      }
    } catch {}

    // ---- 开关与状态（bus 能力，供工具/命令调用）----
    this.register(bus.handle("yuedu:toggle", async ({ on } = {}) => {
      const next = typeof on === "boolean" ? on : !((config.get() || {}).enabled === true);
      config.set("enabled", next);
      return { ok: true, enabled: next };
    }));
    this.register(bus.handle("yuedu:state", async () => ({
      ok: true,
      enabled: (config.get() || {}).enabled === true,
      cfg: config.get() || {},
    })));
    this.register(bus.handle("yuedu:speak", async ({ text } = {}) => {
      const clean = cleanText(text, 4000);
      if (!clean) return { ok: false, reason: "empty" };
      this.enqueueSpeak(clean, config, dataDir, "manual");
      return { ok: true, text: clean.slice(0, 60) };
    }));

    // ---- 订阅会话事件流 ----
    this.register(bus.subscribe(async (event, scopedSessionPath) => {
      try {
        await this.onSessionEvent(event, scopedSessionPath, { bus, config, dataDir });
      } catch (err) {
        debugLog(dataDir, `onSessionEvent error: ${err?.message || err}`);
      }
    }));

    debugLog(dataDir, `onload done. enabled=${(config.get() || {}).enabled === true}`);
    log.info("月读 loaded. enabled =", (config.get() || {}).enabled === true);
  }

  async onSessionEvent(event, scopedSessionPath, ctx) {
    const { config, dataDir, bus } = ctx;
    const type = event?.type || event?.event || "?";

    // 只关心消息完成类事件，避免流式更新期间的噪音
    if (!DONE_EVENTS.has(type)) return;

    const sessionPath = String(scopedSessionPath || "") || event?.sessionPath || event?.path || "";
    if (!sessionPath) return;

    // 调试：记录新事件类型
    if (!this.seenTypes.has(type)) {
      this.seenTypes.add(type);
      debugLog(dataDir, `[event] ${type} path=${sessionPath}`);
    }

    const cfg = config.get() || {};
    if (cfg.enabled !== true) return;

    // 只处理月见栖（hanako）自己会话的消息
    if (!/agents[\\/]hanako[\\/]/.test(sessionPath)) return;

    // 防抖：同 1.5 秒内不重复检查
    const now = Date.now();
    if (now - this._lastCheckAt < 1500) return;
    this._lastCheckAt = now;

    const sessionId = sessionIdOf(event) || sessionRefIdOf(event);
    const target = sessionId ? { sessionId } : { sessionPath };

    const hist = await bus.request("session:history", { ...target, limit: 20 }).catch((e) => {
      debugLog(dataDir, `history error: ${e?.message || e}`);
      return null;
    });
    if (!hist) return;

    const messages = extractMessages(hist);
    if (!messages.length) return;

    // 基线机制：第一次见到该会话时只记录消息数，不朗读历史
    if (!this.booted.has(sessionPath)) {
      this.booted.add(sessionPath);
      this.counts.set(sessionPath, messages.length);
      debugLog(dataDir, `baseline ${sessionPath.split(/[\\/]/).pop()}: ${messages.length} msgs`);
      return;
    }

    const base = this.counts.get(sessionPath) || 0;
    if (messages.length <= base) return; // 没有新增消息

    // 只处理新增部分，从最新往旧找第一条需要朗读的消息
    for (let i = messages.length - 1; i >= base; i--) {
      const m = messages[i];
      const role = String(m.role || m.type || "").toLowerCase();
      const text = textOf(m);
      if (!text || !text.trim()) continue;

      const isAssistant = role.includes("assistant") || role.includes("model") || role.includes("bot") || role === "ai";
      const isUser = role.includes("user") || role.includes("human");
      if (!isAssistant && !(isUser && cfg.readUser === true)) continue;

      const clean = cleanText(text, cfg.maxLength || 600);
      if (!clean) continue;

      // 内容去重（消息无稳定 id 时的兜底）
      const key = `${isAssistant ? "a" : "u"}:${hashText(clean)}`;
      if (this.spokenContent.has(key)) continue;
      this.spokenContent.add(key);
      if (this.spokenContent.size > 300) this.spokenContent.clear();

      const voice = isAssistant ? (cfg.voice || "zh-CN-XiaoxiaoNeural") : (cfg.voiceOfUser || "zh-CN-XiaoyiNeural");
      debugLog(dataDir, `speak ${role} len=${clean.length}`);
      this.enqueueSpeak(clean, config, dataDir, role, voice);
      break; // 一次只朗读一条
    }

    // 无论是否朗读，都推进计数，避免下次重复扫描
    this.counts.set(sessionPath, messages.length);
  }

  // 串行朗读队列：避免并发合成/播放冲突
  enqueueSpeak(clean, config, dataDir, kind, voice) {
    this._queue = this._queue
      .then(async () => {
        const cfg = config.get() || {};
        const engine = cfg.engine === "sapi" ? "sapi" : "edge-tts";
        if (engine === "sapi") {
          await sapiSpeak(clean);
          return;
        }
        const v = voice || cfg.voice || "zh-CN-XiaoxiaoNeural";
        const rate = cfg.rate || "+0%";
        const outPath = join(dataDir, `speak-${Date.now()}.mp3`);
        await edgeTts(clean, v, rate, outPath);
        await playMp3(outPath);
      })
      .catch((e) => debugLog(this.ctxRef?.dataDir || "", `speak error: ${e?.message || e}`));
  }
}

// ---------- 事件/历史解析（多结构兼容）----------
function sessionIdOf(event) {
  if (!event || typeof event !== "object") return null;
  return firstText(event.sessionId, event.sessionRef?.sessionId, event.sid);
}
function sessionRefIdOf(event) {
  if (!event || typeof event !== "object") return null;
  const r = event.sessionRef || event.ref || event.target;
  return r && typeof r === "object" ? firstText(r.sessionId) : null;
}
function firstText(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && String(v).trim()) return String(v);
  return null;
}
function extractMessages(hist) {
  if (Array.isArray(hist)) return hist;
  if (hist && typeof hist === "object") {
    for (const k of ["messages", "items", "history", "turns", "rows"]) {
      if (Array.isArray(hist[k])) return hist[k];
    }
    if (hist.role || hist.content) return [hist];
  }
  return [];
}
function textOf(m) {
  if (!m || typeof m !== "object") return "";
  const c = m.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((x) => (typeof x === "string" ? x : x?.text || x?.content || ""))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof m.text === "string") return m.text;
  return "";
}
