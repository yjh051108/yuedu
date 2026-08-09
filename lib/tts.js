// TTS 引擎封装：edge-tts（主）+ Windows SAPI（离线兜底）
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const PYTHON = process.env.YUEDU_PYTHON || "python";

/**
 * 用 edge-tts 合成语音到 mp3 文件。
 * 文本通过 --text 参数直传（spawn 数组参数不经过 shell，中文安全）。
 */
export function edgeTts(text, voice, rate, outPath) {
  return new Promise((resolve, reject) => {
    const args = ["-m", "edge_tts", "--voice", voice, "--text", text, "--write-media", outPath];
    if (rate && rate !== "+0%") args.push("--rate", rate);
    const child = spawn(PYTHON, args, { stdio: ["ignore", "ignore", "pipe"] });
    let errBuf = "";
    child.stderr?.on("data", (d) => { errBuf += d.toString(); });
    child.on("error", (e) => reject(new Error(`python 启动失败：${e.message}，请确认已安装 edge-tts（pip install edge-tts）`)));
    child.on("close", (code) => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`edge-tts 退出码 ${code}：${errBuf.slice(0, 300)}`));
    });
  });
}

/** 长文本分段（edge-tts 单次不宜过长） */
export function splitText(text, max = 900) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("。", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf("，", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Windows SAPI 本地语音兜底（离线可用）。
 */
export function sapiSpeak(text) {
  return new Promise((resolve, reject) => {
    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "$s.Rate = 0",
      `$s.Speak(${JSON.stringify(String(text).slice(0, 1200))})`,
      "$s.Dispose()",
    ].join("; ");
    const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["ignore", "ignore", "pipe"] });
    let errBuf = "";
    child.stderr?.on("data", (d) => { errBuf += d.toString(); });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`SAPI 退出码 ${code}`))));
  });
}

// 供手动测试：node lib/tts.js "文本"
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("tts.js")) {
  const text = process.argv[2] || "你好，这是月读插件的语音引擎测试。";
  const out = process.argv[3] || "./tts-test.mp3";
  edgeTts(text, "zh-CN-XiaoxiaoNeural", "+0%", out)
    .then((p) => console.log("OK", p))
    .catch((e) => { console.error("FAIL", e.message); process.exit(1); });
}
