' OpenClaw Telegram Bridge -- watchdog launcher.
' Runs scripts\watchdog.ps1 with NO console window flash.
' powershell.exe -WindowStyle Hidden still briefly shows a console window
' on Windows; wscript.exe + a VBS shim hides it completely.
' Invoked by the Scheduled Task OpenClaw-TelegramBridge-Watchdog.

Option Explicit
Dim sh, fso, scriptDir, watchdog, cmd
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
watchdog  = scriptDir & "\watchdog.ps1"
' SW_HIDE (0) hides the window; True = wait for completion so we don't
' overlap with the next scheduled tick (5 min apart, watchdog finishes in
' a few seconds).
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & watchdog & """"
sh.Run cmd, 0, True
