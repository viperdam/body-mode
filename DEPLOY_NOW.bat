@echo off
REM Body Mode - Netlify Deployment Script (Windows)
REM Run this script to deploy your backend to Netlify

echo =========================================
echo   Body Mode - Netlify Deployment
echo =========================================
echo.

cd /d "%~dp0"

REM Step 1: Login to Netlify
echo Step 1/7: Logging in to Netlify...
echo This will open your browser for authentication.
call netlify login

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Login failed
    pause
    exit /b 1
)

echo.
echo Login successful!
echo.

REM Step 2: Check status
echo Step 2/7: Checking project status...
call netlify status
echo.

REM Step 3: Initialize site
echo Step 3/7: Creating new Netlify site...
echo.
echo You'll be prompted to:
echo   - Create a new site (not link existing)
echo   - Enter site name: body-mode-backend (or any name)
echo   - Select team: Viperdam
echo.
call netlify init

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Site initialization failed
    pause
    exit /b 1
)

echo.
echo Site created and linked!
echo.

REM Step 4: Set environment variable
echo Step 4/7: Setting up environment variables...
echo.
echo CRITICAL: You need to set your Gemini API key
echo.
echo BEFORE CONTINUING:
echo 1. Go to: https://aistudio.google.com/app/apikey
echo 2. REVOKE the old key: AIzaSyD2QnjMptHnvGAFS_yYq2KKbDYoB0L_Ztc
echo 3. Generate a NEW API key
echo 4. Copy it to clipboard
echo.
pause

echo.
set /p GEMINI_KEY="Paste your new Gemini API key here: "

call netlify env:set GEMINI_API_KEY "%GEMINI_KEY%"

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to set environment variable
    pause
    exit /b 1
)

echo.
echo Environment variable set!
echo.

REM Step 5: Deploy to production
echo Step 5/7: Deploying to production...
echo This may take 30-60 seconds...
echo.

call netlify deploy --prod --dir=public --functions=netlify/functions

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Deployment failed
    pause
    exit /b 1
)

echo.
echo Deployment complete!
echo.

REM Step 6: Get site info
echo Step 6/7: Getting site information...
call netlify status > temp_status.txt
type temp_status.txt

echo.
echo =========================================
echo   Deployment Successful!
echo =========================================
echo.

REM Step 7: Show next steps
echo Next Steps:
echo.
echo 1. Copy the "Website URL" from above
echo.
echo 2. Update mobile app URL in:
echo    mobile\src\services\netlifyGeminiService.ts
echo.
echo    Change line 15 to:
echo    : 'https://YOUR-SITE-URL.netlify.app/.netlify/functions/gemini-proxy';
echo.
echo 3. Remove API key from mobile\.env:
echo    Comment out: EXPO_PUBLIC_GEMINI_API_KEY
echo.
echo 4. Rebuild your mobile app:
echo    cd mobile
echo    npm run android
echo.
echo 5. Test all features (food logging, plans, chat)
echo.
echo =========================================
echo   Deployment Complete!
echo =========================================
echo.

del temp_status.txt 2>nul

pause
