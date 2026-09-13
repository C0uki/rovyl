@echo off
title Rovyl Launcher
cd /d "%~dp0"
set NODE_ENV=production
if not exist "dist\index.html" (
    echo [Rovyl] Building app files for the first time...
    call npm run build
)
start "" "node_modules\electron\dist\electron.exe" .
exit
