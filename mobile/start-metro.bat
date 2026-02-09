@echo off
echo.
echo ========================================
echo   Starting Metro Bundler
echo ========================================
echo.
echo This terminal must stay open while developing
echo Press Ctrl+C to stop Metro
echo.
echo Starting in 3 seconds...
timeout /t 3 /nobreak > nul
echo.

cd /d "%~dp0"
call npx expo start --dev-client

pause
