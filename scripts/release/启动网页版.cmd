@echo off
setlocal
cd /d "%~dp0"
title Anima List Web

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 (
    echo.
    echo [Anima List] 网页版启动失败，请保留此窗口并查看上方错误。
    pause
)
