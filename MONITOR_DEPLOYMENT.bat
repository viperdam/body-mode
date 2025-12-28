@echo off
setlocal enabledelayedexpansion
color 0B

:: Body Mode - Deployment Monitoring Script
:: Monitors your Netlify deployment status and API function logs

title Body Mode - Deployment Monitor

echo.
echo ========================================
echo   BODY MODE - DEPLOYMENT MONITOR
echo ========================================
echo.

:: Check if we're in the correct directory
if not exist ".netlify\state.json" (
    color 0C
    echo [ERROR] No Netlify site found in this directory!
    echo.
    echo Please run DEPLOY_BODYMODE.bat first to deploy your site.
    echo.
    pause
    exit /b 1
)

:: Get site information
echo Retrieving site information...
netlify status > status.tmp 2>&1

if exist "status.tmp" (
    for /f "tokens=2 delims= " %%i in ('findstr /C:"Site Url" status.tmp') do set SITE_URL=%%i
    for /f "tokens=2 delims=:" %%i in ('findstr /C:"Site Name" status.tmp') do (
        set SITE_NAME=%%i
        set SITE_NAME=!SITE_NAME: =!
    )
    del status.tmp
)

if defined SITE_URL (
    echo [OK] Site URL: !SITE_URL!
    set FUNCTION_URL=!SITE_URL!/.netlify/functions/gemini-proxy
    echo [OK] Function URL: !FUNCTION_URL!
) else (
    color 0E
    echo [WARNING] Could not retrieve site URL
    echo.
)

echo.
echo ========================================
echo   MONITORING OPTIONS
echo ========================================
echo.
echo [1] Check Deployment Status
echo [2] Test All Endpoints
echo [3] Monitor Function Logs (Real-time)
echo [4] Check Environment Variables
echo [5] View Recent Deployments
echo [6] Test API Function
echo [7] Run Full Health Check
echo [0] Exit
echo.
echo ========================================
echo.

:menu
choice /C 12345670 /N /M "Select option (1-7, 0 to exit): "
set OPTION=%errorlevel%

if %OPTION%==8 goto :end
if %OPTION%==1 goto :check_status
if %OPTION%==2 goto :test_endpoints
if %OPTION%==3 goto :monitor_logs
if %OPTION%==4 goto :check_env
if %OPTION%==5 goto :view_deployments
if %OPTION%==6 goto :test_api
if %OPTION%==7 goto :health_check

goto :menu

:: ============================================
:: OPTION 1: CHECK DEPLOYMENT STATUS
:: ============================================
:check_status
echo.
echo ========================================
echo   DEPLOYMENT STATUS
echo ========================================
echo.

netlify status

echo.
echo ----------------------------------------
pause
cls
goto :menu

:: ============================================
:: OPTION 2: TEST ALL ENDPOINTS
:: ============================================
:test_endpoints
echo.
echo ========================================
echo   TESTING ALL ENDPOINTS
echo ========================================
echo.

if not defined SITE_URL (
    color 0E
    echo [ERROR] Site URL not available
    echo.
    pause
    cls
    goto :menu
)

:: Test Homepage
echo [1/6] Testing Homepage...
curl -s -o nul -w "HTTP %%{http_code} - %%{time_total}s" "!SITE_URL!"
echo.

:: Test Privacy
echo [2/6] Testing Privacy Policy...
curl -s -o nul -w "HTTP %%{http_code} - %%{time_total}s" "!SITE_URL!/privacy.html"
echo.

:: Test Terms
echo [3/6] Testing Terms of Service...
curl -s -o nul -w "HTTP %%{http_code} - %%{time_total}s" "!SITE_URL!/terms.html"
echo.

:: Test Docs
echo [4/6] Testing API Documentation...
curl -s -o nul -w "HTTP %%{http_code} - %%{time_total}s" "!SITE_URL!/docs.html"
echo.

:: Test Styles
echo [5/6] Testing Stylesheet...
curl -s -o nul -w "HTTP %%{http_code} - %%{time_total}s" "!SITE_URL!/styles.css"
echo.

:: Test Script
echo [6/6] Testing JavaScript...
curl -s -o nul -w "HTTP %%{http_code} - %%{time_total}s" "!SITE_URL!/script.js"
echo.

echo.
echo All endpoints tested!
echo.
pause
cls
goto :menu

:: ============================================
:: OPTION 3: MONITOR FUNCTION LOGS
:: ============================================
:monitor_logs
echo.
echo ========================================
echo   MONITORING FUNCTION LOGS
echo ========================================
echo.
echo Connecting to live logs...
echo Press Ctrl+C to stop monitoring
echo.
echo ----------------------------------------
echo.

netlify functions:log gemini-proxy --follow

echo.
pause
cls
goto :menu

:: ============================================
:: OPTION 4: CHECK ENVIRONMENT VARIABLES
:: ============================================
:check_env
echo.
echo ========================================
echo   ENVIRONMENT VARIABLES
echo ========================================
echo.

netlify env:list

echo.
echo ----------------------------------------
echo.
echo [INFO] Environment variables are stored securely on Netlify
echo [INFO] Values are never shown in full for security
echo.
pause
cls
goto :menu

:: ============================================
:: OPTION 5: VIEW RECENT DEPLOYMENTS
:: ============================================
:view_deployments
echo.
echo ========================================
echo   RECENT DEPLOYMENTS
echo ========================================
echo.

netlify deploy:list

echo.
pause
cls
goto :menu

:: ============================================
:: OPTION 6: TEST API FUNCTION
:: ============================================
:test_api
echo.
echo ========================================
echo   TESTING API FUNCTION
echo ========================================
echo.

if not defined FUNCTION_URL (
    color 0E
    echo [ERROR] Function URL not available
    echo.
    pause
    cls
    goto :menu
)

echo Target: !FUNCTION_URL!
echo.
echo Creating test request...

:: Create test JSON
echo {"model":"gemini-1.5-flash","contents":{"parts":[{"text":"Say hello in 10 words or less"}]}} > test_request.json

echo Sending POST request...
echo.

curl -X POST -H "Content-Type: application/json" -d @test_request.json "!FUNCTION_URL!" > test_response.json 2>&1

if errorlevel 1 (
    color 0C
    echo [ERROR] Request failed!
    type test_response.json
) else (
    echo [SUCCESS] Response received:
    echo ----------------------------------------
    type test_response.json
    echo.
    echo ----------------------------------------

    :: Check if response is valid
    findstr /C:"candidates" test_response.json >nul 2>&1
    if not errorlevel 1 (
        echo.
        echo [OK] API function is working correctly!
    ) else (
        color 0E
        echo.
        echo [WARNING] Unexpected response format
    )
)

del test_request.json
del test_response.json

echo.
pause
cls
goto :menu

:: ============================================
:: OPTION 7: RUN FULL HEALTH CHECK
:: ============================================
:health_check
echo.
echo ========================================
echo   FULL HEALTH CHECK
echo ========================================
echo.

set PASS_COUNT=0
set FAIL_COUNT=0

:: Check 1: Site Status
echo [CHECK 1/8] Netlify Site Status...
netlify status >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Cannot connect to Netlify
    set /a FAIL_COUNT+=1
) else (
    echo [PASS] Connected to Netlify
    set /a PASS_COUNT+=1
)

:: Check 2: Homepage
echo [CHECK 2/8] Homepage Accessibility...
if defined SITE_URL (
    curl -s -o nul -w "%%{http_code}" "!SITE_URL!" > http_code.tmp
    set /p CODE=<http_code.tmp
    del http_code.tmp
    if "!CODE!"=="200" (
        echo [PASS] Homepage is accessible (HTTP 200)
        set /a PASS_COUNT+=1
    ) else (
        echo [FAIL] Homepage returned HTTP !CODE!
        set /a FAIL_COUNT+=1
    )
) else (
    echo [SKIP] Site URL not available
)

:: Check 3: Privacy Policy
echo [CHECK 3/8] Privacy Policy...
if defined SITE_URL (
    curl -s -o nul -w "%%{http_code}" "!SITE_URL!/privacy.html" > http_code.tmp
    set /p CODE=<http_code.tmp
    del http_code.tmp
    if "!CODE!"=="200" (
        echo [PASS] Privacy policy is accessible
        set /a PASS_COUNT+=1
    ) else (
        echo [FAIL] Privacy policy returned HTTP !CODE!
        set /a FAIL_COUNT+=1
    )
)

:: Check 4: Terms of Service
echo [CHECK 4/8] Terms of Service...
if defined SITE_URL (
    curl -s -o nul -w "%%{http_code}" "!SITE_URL!/terms.html" > http_code.tmp
    set /p CODE=<http_code.tmp
    del http_code.tmp
    if "!CODE!"=="200" (
        echo [PASS] Terms of service is accessible
        set /a PASS_COUNT+=1
    ) else (
        echo [FAIL] Terms returned HTTP !CODE!
        set /a FAIL_COUNT+=1
    )
)

:: Check 5: API Documentation
echo [CHECK 5/8] API Documentation...
if defined SITE_URL (
    curl -s -o nul -w "%%{http_code}" "!SITE_URL!/docs.html" > http_code.tmp
    set /p CODE=<http_code.tmp
    del http_code.tmp
    if "!CODE!"=="200" (
        echo [PASS] API docs are accessible
        set /a PASS_COUNT+=1
    ) else (
        echo [FAIL] API docs returned HTTP !CODE!
        set /a FAIL_COUNT+=1
    )
)

:: Check 6: Environment Variables
echo [CHECK 6/8] Environment Variables...
netlify env:list > env_check.tmp 2>&1
findstr /C:"GEMINI_API_KEY" env_check.tmp >nul
if errorlevel 1 (
    echo [FAIL] GEMINI_API_KEY not set
    set /a FAIL_COUNT+=1
) else (
    echo [PASS] GEMINI_API_KEY is configured
    set /a PASS_COUNT+=1
)
del env_check.tmp

:: Check 7: Function Deployment
echo [CHECK 7/8] Function Deployment...
netlify functions:list > func_list.tmp 2>&1
findstr /C:"gemini-proxy" func_list.tmp >nul
if errorlevel 1 (
    echo [FAIL] gemini-proxy function not found
    set /a FAIL_COUNT+=1
) else (
    echo [PASS] gemini-proxy function is deployed
    set /a PASS_COUNT+=1
)
del func_list.tmp

:: Check 8: API Function Test
echo [CHECK 8/8] API Function Response...
if defined FUNCTION_URL (
    echo {"model":"gemini-1.5-flash","contents":{"parts":[{"text":"Test"}]}} > health_test.json
    curl -s -X POST -H "Content-Type: application/json" -d @health_test.json "!FUNCTION_URL!" > health_response.tmp 2>&1

    findstr /C:"candidates" health_response.tmp >nul
    if errorlevel 1 (
        echo [FAIL] API function not responding correctly
        set /a FAIL_COUNT+=1
    ) else (
        echo [PASS] API function is working
        set /a PASS_COUNT+=1
    )

    del health_test.json
    del health_response.tmp
)

:: Health Check Summary
echo.
echo ========================================
echo   HEALTH CHECK SUMMARY
echo ========================================
echo.
echo Passed: !PASS_COUNT! checks
echo Failed: !FAIL_COUNT! checks
echo.

if !FAIL_COUNT! EQU 0 (
    color 0A
    echo [SUCCESS] All systems operational!
) else (
    color 0E
    echo [WARNING] Some checks failed
    echo.
    echo Please review the failed checks above
)

echo.
pause
color 0B
cls
goto :menu

:: ============================================
:: END
:: ============================================
:end
echo.
echo Exiting monitor...
echo.
endlocal
exit /b 0
