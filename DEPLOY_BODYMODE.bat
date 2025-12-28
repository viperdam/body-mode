@echo off
setlocal enabledelayedexpansion
color 0A

:: Body Mode - Automated Netlify Deployment Script
:: This script deploys your professional Body Mode website to Netlify
:: with complete monitoring and error handling

title Body Mode - Netlify Deployment

echo.
echo ========================================
echo   BODY MODE - NETLIFY DEPLOYMENT
echo ========================================
echo.
echo This script will:
echo   1. Check prerequisites
echo   2. Initialize Netlify site
echo   3. Set environment variables
echo   4. Deploy to production
echo   5. Test deployment
echo   6. Verify all features work
echo.
pause

:: ============================================
:: STEP 1: CHECK PREREQUISITES
:: ============================================

echo.
echo [STEP 1/6] Checking prerequisites...
echo.

:: Check if we're in the correct directory
if not exist "netlify\functions\gemini-proxy.js" (
    color 0C
    echo [ERROR] Not in the correct directory!
    echo.
    echo Please run this script from: c:\Users\AMors\Desktop\body mode
    echo.
    echo Current directory: %CD%
    echo.
    pause
    exit /b 1
)
echo [OK] Correct directory: %CD%

:: Check if Netlify CLI is installed
echo.
echo Checking Netlify CLI installation...
netlify --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Netlify CLI is not installed!
    echo.
    echo Please install it with: npm install -g netlify-cli
    echo.
    pause
    exit /b 1
)
echo [OK] Netlify CLI is installed

:: Get Netlify CLI version
for /f "tokens=*" %%i in ('netlify --version 2^>^&1') do set NETLIFY_VERSION=%%i
echo     Version: %NETLIFY_VERSION%

:: Check if public directory exists
if not exist "public" (
    color 0C
    echo [ERROR] public directory not found!
    echo.
    pause
    exit /b 1
)
echo [OK] Public directory exists

:: Check if website files exist
if not exist "public\index.html" (
    color 0C
    echo [ERROR] public\index.html not found!
    echo.
    pause
    exit /b 1
)
echo [OK] Website files found

:: Check critical files
echo.
echo Verifying all website files...
set FILE_COUNT=0

if exist "public\index.html" (
    echo [OK] index.html
    set /a FILE_COUNT+=1
)
if exist "public\styles.css" (
    echo [OK] styles.css
    set /a FILE_COUNT+=1
)
if exist "public\script.js" (
    echo [OK] script.js
    set /a FILE_COUNT+=1
)
if exist "public\privacy.html" (
    echo [OK] privacy.html
    set /a FILE_COUNT+=1
)
if exist "public\terms.html" (
    echo [OK] terms.html
    set /a FILE_COUNT+=1
)
if exist "public\docs.html" (
    echo [OK] docs.html
    set /a FILE_COUNT+=1
)
if exist "netlify\functions\gemini-proxy.js" (
    echo [OK] gemini-proxy.js (API function)
    set /a FILE_COUNT+=1
)
if exist "netlify.toml" (
    echo [OK] netlify.toml (configuration)
    set /a FILE_COUNT+=1
)

echo.
echo [SUMMARY] Found %FILE_COUNT%/8 required files
if %FILE_COUNT% LSS 8 (
    color 0E
    echo [WARNING] Some files are missing!
    echo.
    choice /C YN /M "Continue anyway? (Y/N)"
    if errorlevel 2 exit /b 1
)

:: ============================================
:: STEP 2: LOGIN TO NETLIFY
:: ============================================

echo.
echo [STEP 2/6] Logging into Netlify...
echo.

:: Check if already logged in
netlify status >nul 2>&1
if errorlevel 1 (
    echo You need to login to Netlify.
    echo.
    echo This will open your browser for authentication...
    echo.
    pause

    echo.
    echo Opening browser for Netlify login...
    netlify login

    if errorlevel 1 (
        color 0C
        echo.
        echo [ERROR] Login failed!
        echo.
        pause
        exit /b 1
    )

    echo.
    echo [OK] Successfully logged in!
) else (
    echo [OK] Already logged in to Netlify
)

:: Get current login status
echo.
echo Verifying Netlify authentication...
netlify status 2>&1 | findstr /C:"You are logged in" >nul
if errorlevel 1 (
    netlify status
)
echo.

:: ============================================
:: STEP 3: INITIALIZE NETLIFY SITE
:: ============================================

echo.
echo [STEP 3/6] Creating Netlify site...
echo.

:: Check if site is already linked
if exist ".netlify\state.json" (
    color 0E
    echo [WARNING] Site appears to be already linked!
    echo.
    type .netlify\state.json
    echo.
    choice /C YN /M "Re-initialize site? (Y/N)"
    if errorlevel 2 goto :skip_init

    echo.
    echo Unlinking current site...
    netlify unlink
)

echo.
echo ========================================
echo   IMPORTANT: SITE CONFIGURATION
echo ========================================
echo.
echo When prompted, use these settings:
echo.
echo   [1] What would you like to do?
echo       ^> Create and configure a new project
echo.
echo   [2] Team:
echo       ^> Viperdam
echo.
echo   [3] Site name:
echo       ^> bodymode
echo       (If taken, try: getbodymode, mybodymode, or bodymode-app)
echo.
echo   [4] Build command:
echo       ^> Just press ENTER (leave empty)
echo.
echo   [5] Directory to deploy:
echo       ^> public
echo.
echo   [6] Functions folder:
echo       ^> netlify/functions
echo.
echo ========================================
echo.
pause

echo.
echo Initializing Netlify site...
echo.

netlify init

if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Site initialization failed!
    echo.
    pause
    exit /b 1
)

:skip_init

echo.
echo [OK] Site initialized!

:: Get site information
echo.
echo Retrieving site information...
netlify status > netlify_status.tmp 2>&1

if exist "netlify_status.tmp" (
    echo.
    echo ----------------------------------------
    type netlify_status.tmp
    echo ----------------------------------------
    echo.

    :: Extract site name from status
    for /f "tokens=2 delims=:" %%i in ('findstr /C:"Site Name" netlify_status.tmp') do (
        set SITE_NAME=%%i
        set SITE_NAME=!SITE_NAME: =!
    )

    :: Extract site URL from status
    for /f "tokens=2 delims= " %%i in ('findstr /C:"Site Url" netlify_status.tmp') do (
        set SITE_URL=%%i
    )

    del netlify_status.tmp

    if defined SITE_NAME (
        echo [OK] Site Name: !SITE_NAME!
    )
    if defined SITE_URL (
        echo [OK] Site URL: !SITE_URL!
    )
)

:: ============================================
:: STEP 4: SET ENVIRONMENT VARIABLES
:: ============================================

echo.
echo [STEP 4/6] Setting environment variables...
echo.

:: Set API key
set GEMINI_KEY=AIzaSyD2QnjMptHnvGAFS_yYq2KKbDYoB0L_Ztc

echo Setting GEMINI_API_KEY...
netlify env:set GEMINI_API_KEY "%GEMINI_KEY%" --force

if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Failed to set environment variable!
    echo.
    pause
    exit /b 1
)

echo [OK] Environment variable set

:: Verify environment variable
echo.
echo Verifying environment variables...
netlify env:list > env_list.tmp 2>&1

if exist "env_list.tmp" (
    findstr /C:"GEMINI_API_KEY" env_list.tmp >nul
    if errorlevel 1 (
        color 0C
        echo [ERROR] Environment variable not found!
        type env_list.tmp
        del env_list.tmp
        echo.
        pause
        exit /b 1
    ) else (
        echo [OK] GEMINI_API_KEY is set
        del env_list.tmp
    )
)

:: ============================================
:: STEP 5: DEPLOY TO PRODUCTION
:: ============================================

echo.
echo [STEP 5/6] Deploying to production...
echo.

echo Starting deployment...
echo This may take 30-60 seconds...
echo.

:: Deploy with detailed output
netlify deploy --prod --dir=public --functions=netlify/functions > deploy_output.tmp 2>&1

if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Deployment failed!
    echo.
    echo Error details:
    echo ----------------------------------------
    type deploy_output.tmp
    echo ----------------------------------------
    echo.
    del deploy_output.tmp
    pause
    exit /b 1
)

:: Show deployment output
echo.
echo ----------------------------------------
echo   DEPLOYMENT OUTPUT
echo ----------------------------------------
type deploy_output.tmp
echo ----------------------------------------
echo.

:: Extract URLs from deployment output
for /f "tokens=*" %%i in ('findstr /C:"Website URL" deploy_output.tmp') do (
    set DEPLOY_LINE=%%i
    for /f "tokens=2 delims= " %%j in ("!DEPLOY_LINE!") do set WEBSITE_URL=%%j
)

for /f "tokens=*" %%i in ('findstr /C:"Function" deploy_output.tmp') do (
    for /f "tokens=2 delims= " %%j in ("%%i") do (
        set TEMP_URL=%%j
        echo !TEMP_URL! | findstr /C:"gemini-proxy" >nul
        if not errorlevel 1 set FUNCTION_URL=!TEMP_URL!
    )
)

del deploy_output.tmp

echo [OK] Deployment successful!
echo.

if defined WEBSITE_URL (
    echo [SUCCESS] Website URL: !WEBSITE_URL!
)

if defined FUNCTION_URL (
    echo [SUCCESS] Function URL: !FUNCTION_URL!
) else (
    if defined WEBSITE_URL (
        set FUNCTION_URL=!WEBSITE_URL!/.netlify/functions/gemini-proxy
        echo [INFO] Function URL: !FUNCTION_URL!
    )
)

:: ============================================
:: STEP 6: TEST DEPLOYMENT
:: ============================================

echo.
echo [STEP 6/6] Testing deployment...
echo.

if not defined WEBSITE_URL (
    color 0E
    echo [WARNING] Could not extract website URL from deployment
    echo Please test manually at: https://bodymode.netlify.app
    echo.
    goto :skip_tests
)

:: Test 1: Homepage
echo [TEST 1/4] Testing homepage...
curl -s -o homepage_test.tmp -w "%%{http_code}" "!WEBSITE_URL!" > http_code.tmp 2>&1
set /p HTTP_CODE=<http_code.tmp
del http_code.tmp

if "!HTTP_CODE!"=="200" (
    echo [OK] Homepage is accessible (HTTP 200)
    del homepage_test.tmp
) else (
    color 0E
    echo [WARNING] Homepage returned HTTP !HTTP_CODE!
    if exist homepage_test.tmp del homepage_test.tmp
)

:: Test 2: Privacy Policy
echo [TEST 2/4] Testing privacy policy page...
curl -s -o privacy_test.tmp -w "%%{http_code}" "!WEBSITE_URL!/privacy.html" > http_code.tmp 2>&1
set /p HTTP_CODE=<http_code.tmp
del http_code.tmp

if "!HTTP_CODE!"=="200" (
    echo [OK] Privacy policy is accessible (HTTP 200)
    del privacy_test.tmp
) else (
    color 0E
    echo [WARNING] Privacy policy returned HTTP !HTTP_CODE!
    if exist privacy_test.tmp del privacy_test.tmp
)

:: Test 3: API Documentation
echo [TEST 3/4] Testing API documentation page...
curl -s -o docs_test.tmp -w "%%{http_code}" "!WEBSITE_URL!/docs.html" > http_code.tmp 2>&1
set /p HTTP_CODE=<http_code.tmp
del http_code.tmp

if "!HTTP_CODE!"=="200" (
    echo [OK] API documentation is accessible (HTTP 200)
    del docs_test.tmp
) else (
    color 0E
    echo [WARNING] API docs returned HTTP !HTTP_CODE!
    if exist docs_test.tmp del docs_test.tmp
)

:: Test 4: API Function
echo [TEST 4/4] Testing API function...
if defined FUNCTION_URL (
    echo Sending test request to API function...

    :: Create test JSON
    echo {"model":"gemini-1.5-flash","contents":{"parts":[{"text":"Say hello"}]}} > api_test.json

    curl -s -X POST -H "Content-Type: application/json" -d @api_test.json -w "%%{http_code}" "!FUNCTION_URL!" > api_response.tmp 2>nul

    :: Check if response contains expected data
    findstr /C:"candidates" api_response.tmp >nul 2>&1
    if not errorlevel 1 (
        echo [OK] API function is working correctly
        echo.
        echo Sample response:
        type api_response.tmp | findstr /C:"text" | more /P
        echo.
    ) else (
        findstr /C:"error" api_response.tmp >nul 2>&1
        if not errorlevel 1 (
            color 0E
            echo [WARNING] API function returned an error
            echo.
            type api_response.tmp
            echo.
        ) else (
            color 0E
            echo [WARNING] Unexpected API response
            echo.
            type api_response.tmp
            echo.
        )
    )

    del api_test.json
    del api_response.tmp
) else (
    color 0E
    echo [WARNING] Function URL not available for testing
)

:skip_tests

:: ============================================
:: DEPLOYMENT SUMMARY
:: ============================================

echo.
echo ========================================
echo   DEPLOYMENT SUMMARY
echo ========================================
echo.

if defined WEBSITE_URL (
    echo Website:      !WEBSITE_URL!
    echo Homepage:     !WEBSITE_URL!
    echo Privacy:      !WEBSITE_URL!/privacy.html
    echo Terms:        !WEBSITE_URL!/terms.html
    echo API Docs:     !WEBSITE_URL!/docs.html
    if defined FUNCTION_URL (
        echo API Function: !FUNCTION_URL!
    )
) else (
    echo Website:      https://bodymode.netlify.app (verify manually)
    echo API Function: https://bodymode.netlify.app/.netlify/functions/gemini-proxy
)

echo.
echo Status:        DEPLOYED
echo.
echo ========================================
echo.

:: ============================================
:: NEXT STEPS
:: ============================================

echo.
echo ========================================
echo   NEXT STEPS
echo ========================================
echo.
echo 1. Update Mobile App URL
echo    File: mobile\src\services\netlifyGeminiService.ts
if defined WEBSITE_URL (
    echo    Change to: !WEBSITE_URL!/.netlify/functions/gemini-proxy
) else (
    echo    Change to: https://bodymode.netlify.app/.netlify/functions/gemini-proxy
)
echo.
echo 2. Rebuild Mobile App
echo    cd mobile
echo    npm run android
echo.
echo 3. Test All Features
echo    - Food photo analysis
echo    - Daily plan generation
echo    - Chat with AI
echo    - Recipe generation
echo.
echo ========================================
echo.

:: ============================================
:: MONITORING OPTION
:: ============================================

echo.
choice /C YN /M "Do you want to monitor deployment logs? (Y/N)"
if errorlevel 2 goto :end_monitoring

echo.
echo Starting log monitoring...
echo Press Ctrl+C to stop monitoring
echo.

netlify functions:log gemini-proxy --follow

:end_monitoring

:: ============================================
:: COMPLETION
:: ============================================

color 0A
echo.
echo ========================================
echo   DEPLOYMENT COMPLETE!
echo ========================================
echo.
if defined WEBSITE_URL (
    echo Your site is live at: !WEBSITE_URL!
) else (
    echo Your site is live at: https://bodymode.netlify.app
)
echo.
echo Time: %date% %time%
echo.
pause

:: Create deployment log
echo. > deployment_log.txt
echo Body Mode Deployment Log >> deployment_log.txt
echo ================================ >> deployment_log.txt
echo Date: %date% %time% >> deployment_log.txt
if defined WEBSITE_URL echo Website: !WEBSITE_URL! >> deployment_log.txt
if defined FUNCTION_URL echo Function: !FUNCTION_URL! >> deployment_log.txt
echo Status: SUCCESS >> deployment_log.txt
echo ================================ >> deployment_log.txt

echo.
echo Deployment log saved to: deployment_log.txt
echo.

endlocal
exit /b 0
