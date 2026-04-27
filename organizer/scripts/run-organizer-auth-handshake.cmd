@echo off
powershell -ExecutionPolicy Bypass -File "C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.ps1"
exit /b %errorlevel%
