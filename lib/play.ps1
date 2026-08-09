param([string]$Path)
# 月读播放器：MCI (winmm) 播放 mp3，比 WMPlayer.OCX 可靠
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
using System.Text;
public class MciPlayer {
  [DllImport("winmm.dll")]
  public static extern int mciSendString(string command, StringBuilder returnString, int returnLength, System.IntPtr hwndCallback);
}
"@
$alias = "song" + (Get-Random -Maximum 99999)
$p = $Path
[void][MciPlayer]::mciSendString("open `"$p`" type mpegvideo alias $alias", $null, 0, [IntPtr]::Zero)
[void][MciPlayer]::mciSendString("play $alias", $null, 0, [IntPtr]::Zero)
$sb = New-Object System.Text.StringBuilder 256
$deadline = (Get-Date).AddSeconds(180)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 300
  [void][MciPlayer]::mciSendString("status $alias mode", $sb, 256, [IntPtr]::Zero)
  $mode = $sb.ToString().Trim()
  if ($mode -ne "playing") { break }
}
[void][MciPlayer]::mciSendString("close $alias", $null, 0, [IntPtr]::Zero)
exit 0
