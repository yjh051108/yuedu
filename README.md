# 月读 YueDu

把我的回复读给你听。

A Hanako (HanaAgent) plugin that speaks your assistant's replies aloud. It watches the session event stream, waits for a reply to finish, then synthesizes natural Chinese speech with **edge-tts** and plays it on your machine via the Windows MCI (winmm) API.

> 月读：月光下栖身的存在，把文字变成声音，读给主人听。
> Named after "reading under the moonlight" — turning text into a voice.

## ✨ Features

- 🔔 **Auto read-aloud** — listens for the moment a reply finishes, then speaks it automatically
- 🎙️ **Natural voice** — edge-tts (Microsoft neural voices, free), e.g. Xiaoxiao 晓晓 / Yunxi 云希 / Xiaoyi 晓伊
- ⏯️ **Easy toggle** — turn it on/off right in the conversation: say "打开语音" / "关闭语音", use the `/语音` slash command, or flip the switch in plugin settings
- 🧹 **Clean reading** — strips mood blocks, code fences, links and markdown noise before speaking
- 📦 **No heavy deps** — Python 3 + edge-tts + built-in Windows audio APIs. No npm installs, no ffmpeg

## 🧠 How it works

```
Hanako session events (message_end / turn_end / agent_end)
        │  bus.subscribe
        ▼
YueDu plugin (index.js)
        │  session:history → only NEW messages (count-baseline)
        ▼
cleanText() strips markdown / mood / code
        │
        ▼
edge-tts (python) → speak-*.mp3
        │
        ▼
play.ps1 → MCI (winmm.dll) → your speakers 🔊
```

- Only replies from the **hanako** agent are read (per-session baseline avoids replaying history after restarts)
- A serial queue prevents concurrent synthesis/playback conflicts
- `engine: sapi` fallback uses Windows built-in SAPI when offline

## 📦 Install

1. **Dependencies**
   - Windows 10/11 (uses built-in `WMPlayer`/`winmm` capabilities — actually MCI, nothing to install)
   - Python 3.9+: `pip install edge-tts` (needs internet for synthesis)

2. **Install the plugin**
   - Copy the `yuedu` folder into your Hanako plugins directory (Settings → Plugins shows the real path, typically `~/.hanako/plugins/`)
   - Or zip the folder and drag it into the plugins install area
   - Enable it, and make sure "Allow full-access plugins" is on (this plugin needs `full-access`)
   - Restart Hanako once so the plugin lifecycle loads

3. **Turn it on**
   - Say: **"打开语音朗读"** (a tool call to `yuedu_toggle`)
   - Or type: `/语音`
   - Or: Settings → Plugins → 月读 → enable "朗读开关"

## ⚙️ Configuration

| Key | Default | Description |
| --- | --- | --- |
| `enabled` | `false` | Master read-aloud switch |
| `engine` | `edge-tts` | `edge-tts` (neural, online) or `sapi` (Windows local, offline) |
| `voice` | `zh-CN-XiaoxiaoNeural` | Assistant voice. Try `zh-CN-YunxiNeural` (male), `zh-CN-XiaoyiNeural` |
| `rate` | `+0%` | Speaking rate, e.g. `+10%`, `-10%` |
| `maxLength` | `600` | Max chars read per reply (truncated) |
| `readUser` | `false` | Also read the user's own messages |
| `voiceOfUser` | `zh-CN-XiaoyiNeural` | Voice used for user messages |

## 🛠️ Troubleshooting

**No sound at all**
1. Test the pipeline standalone: `python -m edge_tts --voice zh-CN-XiaoxiaoNeural --text "测试" --write-media test.mp3`
2. Test playback: open the generated `test.mp3` — if the system player works, MCI should too
3. Check `~/.hanako/plugin-data/yuedu/debug.log` — new `speak` lines mean the event chain works; nothing means events aren't reaching the plugin (check the hanako-agent path filter)
4. Make sure `enabled` is `true` and the plugin isn't disabled

**Replays old messages after restart**
Per-session baseline (`counts` map) is initialized on first sight of a session — it only reads messages *newer* than the baseline. If you still hear history, delete `debug.log` and check the `[event]` lines to confirm `turn_end` events arrive.

## 📁 Structure

```
yuedu/
├── manifest.json        # plugin manifest (full-access, configuration schema)
├── index.js             # lifecycle: event subscription + read-aloud logic
├── lib/
│   ├── tts.js           # edge-tts + SAPI engines
│   ├── player.js        # spawns play.ps1
│   ├── play.ps1         # MCI (winmm.dll) player
│   └── cleaner.js       # markdown/mood text cleaning
├── tools/
│   └── toggle.js        # yuedu_toggle tool (in-chat switch)
├── commands/
│   └── yuyin.js         # /语音 slash command
└── README.md
```

## 📄 License

MIT

---

Built for 风禾渡 with 🌙 by 月见栖.
