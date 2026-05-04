' OpenClaw Control Dashboard - hidden launcher.
' Runs `node server.js` with NO console window and NO PowerShell parent.
' Stdout/stderr are redirected to logs\dashboard.log / dashboard.err.log.
' This file is invoked by the Windows Scheduled Task created by
' scripts\dashboard-service.ps1 (see install command).

Option Explicit

Dim sh, fso, scriptDir, dashDir, logDir, serverJs, logFile, errFile, nodeExe, cmd

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\control-dashboard\scripts
dashDir   = fso.GetParentFolderName(scriptDir)                ' ...\control-dashboard
logDir    = dashDir & "\logs"
serverJs  = dashDir & "\server.js"
logFile   = logDir & "\dashboard.log"
errFile   = logDir & "\dashboard.err.log"

If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)

' Resolve node.exe via PATH (node must be installed system-wide).
nodeExe = "node"

' cmd /c gives us shell redirection. SW_HIDE (0) hides the window; False = fire and forget.
' Note on quoting: we deliberately omit outer quotes around the cmd command. The redirection
' operators (>>, 2>>) work fine unquoted, and only the path arguments need quoting.
cmd = "cmd /c " & nodeExe & " """ & serverJs & """ >> """ & logFile & """ 2>> """ & errFile & """"

sh.Run cmd, 0, False
