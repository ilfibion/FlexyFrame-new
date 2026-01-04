@echo off
echo Killing all terminal and browser processes...
echo.

REM Kill all PowerShell processes
taskkill /F /IM powershell.exe /T 2>nul
taskkill /F /IM pwsh.exe /T 2>nul

REM Kill all CMD processes
taskkill /F /IM cmd.exe /T 2>nul

REM Kill all Node.js processes
taskkill /F /IM node.exe /T 2>nul

REM Kill all browser processes
taskkill /F /IM chrome.exe /T 2>nul
taskkill /F /IM firefox.exe /T 2>nul
taskkill /F /IM msedge.exe /T 2>nul
taskkill /F /IM opera.exe /T 2>nul
taskkill /F /IM browser.exe /T 2>nul

REM Kill VS Code terminals
taskkill /F /IM code.exe /T 2>nul

echo All terminal and browser processes have been terminated.
pause