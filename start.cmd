@echo off
setlocal
cd /d "%~dp0"
title Contract Assistant Prototype - Local Preview
echo Checking Python and port 8000...
py -3 --version >nul 2>&1
if errorlevel 1 goto :NO_PYTHON
netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul
if not errorlevel 1 goto :PORT_BUSY
echo Starting local preview...
echo Your browser will open after the service is ready:
echo http://127.0.0.1:8000
echo Keep this window open. Press Ctrl+C to stop.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8000'"
py -3 -m http.server 8000
echo.
echo Preview service stopped.
pause
exit /b 0

:NO_PYTHON
echo.
echo Python 3 was not found. Please install Python 3 and try again.
pause
exit /b 1

:PORT_BUSY
echo.
echo Port 8000 is already in use. No new server was started.
echo If it is this prototype, open: http://127.0.0.1:8000
echo Otherwise, close the app using port 8000 and try again.
pause
exit /b 1
