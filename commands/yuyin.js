// 斜杠命令：/语音
export const name = "yuyin";
export const aliases = ["voice", "朗读"];
export const description = "打开或关闭月读语音朗读";
export const usage = "/语音 [开|关]";
export const scope = "session";
export async function handler(ctx = {}) {
  const wantOn = /开|on|true|读/.test(String(ctx?.args || "").trim());
  const wantOff = /关|off|false|停/.test(String(ctx?.args || "").trim());
  try {
    const bus = ctx?.bus;
    const cfg = ctx?.config;
    const cur = (cfg?.get?.() || {}).enabled === true;
    const next = wantOn ? true : wantOff ? false : !cur;
    if (cfg?.set) {
      cfg.set("enabled", next);
    } else if (bus?.request) {
      await bus.request("yuedu:toggle", { on: next }).catch(() => null);
    } else if (bus?.emit) {
      bus.emit("yuedu:toggle", { on: next });
    }
    return { reply: next ? "语音朗读已开启 🌙" : "语音朗读已关闭" };
  } catch (e) {
    return { reply: `切换失败：${e?.message || e}` };
  }
}
