// 月读开关工具：对话内随时开/关语音朗读
export const name = "toggle";
export const description =
  "打开或关闭月读语音朗读。开启后，月见栖的回复会自动用语音读出来；关闭后静默。";
export const parameters = {
  type: "object",
  properties: {
    on: {
      type: "boolean",
      description: "true 表示开启朗读，false 表示关闭。省略则切换当前状态。",
    },
  },
};
export async function execute(input, ctx) {
  const cfg = ctx.config.get() || {};
  const next = typeof input?.on === "boolean" ? input.on : !(cfg.enabled === true);
  ctx.config.set("enabled", next);
  return {
    ok: true,
    enabled: next,
    message: next
      ? "语音朗读已开启。接下来我的回复会读给你听，随时说“关闭语音”即可。"
      : "语音朗读已关闭。",
  };
}
