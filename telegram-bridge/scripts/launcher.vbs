' OpenClaw Telegram Bridge - hidden launcher.
' Runs `node bridge.js` with NO console window and NO PowerShell parent.
' Stdout/stderr are redirected to logs\bridge.log / bridge.err.log.
' This file is invoked by the Windows Scheduled Task created by
' scripts\bridge-service.ps1 (install command).

Option Explicit

Dim sh, fso, scriptDir, bridgeDir, logDir, bridgeJs, logFile, errFile, nodeExe, cmd

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\telegram-bridge\scripts
bridgeDir = fso.GetParentFolderName(scriptDir)                ' ...\telegram-bridge
logDir    = bridgeDir & "\logs"
bridgeJs  = bridgeDir & "\bridge.js"
logFile   = logDir & "\bridge.log"
errFile   = logDir & "\bridge.err.log"

If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)

' Resolve node.exe via PATH (node must be installed system-wide).
nodeExe = "node"

' cmd /c gives us shell redirection. SW_HIDE (0) hides the window; False = fire and forget.
cmd = "cmd /c " & nodeExe & " """ & bridgeJs & """ >> """ & logFile & """ 2>> """ & errFile & """"

sh.Run cmd, 0, False
