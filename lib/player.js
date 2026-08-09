// mp3 播放：调用 lib/play.ps1（MCI winmm API，Windows 系统自带，无需额外依赖）
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PS1_PATH = fileURLToPath(new URL("./play.ps1", import.meta.url));

/**
 * 播放一个音频文件（mp3/wav），阻塞至播放结束。
 */
export function playMp3(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PS1_PATH, "-Path", String(filePath)],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let errBuf = "";
    child.stderr?.on("data", (d) => { errBuf += d.toString(); });
    child.on("error", (e) => reject(new Error(`播放器启动失败：${e.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`播放退出码 ${code}：${errBuf.slice(0, 300)}`));
    });
  });
}
