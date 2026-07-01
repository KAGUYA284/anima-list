@echo off
cd /d "%~dp0"
echo Starting anime tracker server...
start "" http://localhost:3000
npx serve . -p 3000
