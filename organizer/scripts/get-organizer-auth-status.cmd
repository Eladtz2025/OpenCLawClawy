@echo off
powershell -ExecutionPolicy Bypass -File "C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\get-organizer-auth-status.ps1"
exit /b %errorlevel%
