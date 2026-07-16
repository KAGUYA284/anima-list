@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
    echo [Anime Tracker] Node.js or npm was not found.
    echo Install Node.js, then run npm install in this directory.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
    echo [Anime Tracker] Dependencies are not installed.
    echo Run npm install in this directory first.
    echo.
    pause
    exit /b 1
)

set "APP_URL=http://127.0.0.1:5173/"
start "Anime Tracker Server" /min cmd /c "npm run dev -- --host 127.0.0.1"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$url='%APP_URL%'; $ready=$false; " ^
    "for($i=0; $i -lt 40; $i++){ " ^
    "  try { $null=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; $ready=$true; break } " ^
    "  catch { Start-Sleep -Milliseconds 250 } " ^
    "}; " ^
    "if($ready){ Start-Process $url; exit 0 } else { exit 1 }"

if errorlevel 1 (
    echo [Anime Tracker] The local web server did not start.
    echo Check whether port 5173 is occupied, then try again.
    echo.
    pause
    exit /b 1
)

exit /b 0
