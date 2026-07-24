@echo off
setlocal
cd /d "%~dp0"
title Anima List Web

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 (
    echo.
    echo [Anima List] Failed to start the local web launcher.
    echo Keep this window open and review the error above.
    pause
)
