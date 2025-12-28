# 🚀 Automated Deployment Scripts - User Guide

## Quick Start - Deploy in 1 Click!

**Just double-click:** `DEPLOY_BODYMODE.bat`

That's it! The script handles everything automatically with monitoring and error detection.

---

## 📁 Available Scripts

### 1. DEPLOY_BODYMODE.bat (Main Deployment Script)

**Purpose:** Complete automated deployment with monitoring

**What it does:**
- ✅ Checks all prerequisites (Netlify CLI, files, etc.)
- ✅ Logs you into Netlify (opens browser if needed)
- ✅ Creates and configures your Netlify site
- ✅ Sets environment variables (API key)
- ✅ Deploys to production
- ✅ Tests all endpoints (homepage, privacy, terms, API docs)
- ✅ Tests API function with real request
- ✅ Provides detailed error messages
- ✅ Shows deployment summary
- ✅ Offers live log monitoring
- ✅ Creates deployment log file

**How to use:**
1. Double-click `DEPLOY_BODYMODE.bat`
2. Follow the on-screen prompts
3. When asked for site configuration, use:
   - Site name: **bodymode**
   - Team: **Viperdam**
   - Deploy directory: **public**
   - Functions folder: **netlify/functions**

**Duration:** 2-5 minutes (including browser login)

---

### 2. MONITOR_DEPLOYMENT.bat (Monitoring Script)

**Purpose:** Monitor and test your deployed site

**What it does:**

**[1] Check Deployment Status**
- Shows current Netlify site status
- Displays site URL, functions, and configuration

**[2] Test All Endpoints**
- Tests homepage, privacy, terms, docs
- Tests CSS and JavaScript files
- Shows HTTP status codes and response times

**[3] Monitor Function Logs (Real-time)**
- Streams live logs from your API function
- See requests as they happen
- Perfect for debugging

**[4] Check Environment Variables**
- Lists all environment variables
- Verifies GEMINI_API_KEY is set

**[5] View Recent Deployments**
- Shows deployment history
- Timestamps and status

**[6] Test API Function**
- Sends test request to Gemini proxy
- Verifies AI response
- Shows response time

**[7] Run Full Health Check**
- Runs 8 comprehensive checks
- Tests all critical components
- Provides pass/fail summary

**How to use:**
1. Double-click `MONITOR_DEPLOYMENT.bat`
2. Select option 1-7 from menu
3. Press 0 to exit

**Best for:**
- After deployment verification
- Troubleshooting issues
- Monitoring production performance
- Testing API function

---

## 📋 Step-by-Step Deployment Guide

### Before You Start

**Prerequisites:**
- ✅ Netlify CLI installed (`npm install -g netlify-cli`)
- ✅ Netlify account (free tier)
- ✅ Internet connection
- ✅ All project files in place

**Check prerequisites:**
```bash
netlify --version
```
If you see a version number, you're ready!

---

### Deployment Steps

#### Step 1: Run Deployment Script

Double-click `DEPLOY_BODYMODE.bat`

Or from command prompt:
```bash
cd "c:\Users\AMors\Desktop\body mode"
DEPLOY_BODYMODE.bat
```

#### Step 2: Prerequisite Check

The script will automatically check:
- ✅ Correct directory
- ✅ Netlify CLI installed
- ✅ All website files present (8 files)
- ✅ Backend function exists

**What you'll see:**
```
[STEP 1/6] Checking prerequisites...

[OK] Correct directory: c:\Users\AMors\Desktop\body mode
[OK] Netlify CLI is installed
     Version: netlify-cli/17.x.x
[OK] Public directory exists
[OK] Website files found

Verifying all website files...
[OK] index.html
[OK] styles.css
[OK] script.js
[OK] privacy.html
[OK] terms.html
[OK] docs.html
[OK] gemini-proxy.js (API function)
[OK] netlify.toml (configuration)

[SUMMARY] Found 8/8 required files
```

Press any key to continue.

---

#### Step 3: Netlify Login

The script checks if you're logged in.

**If not logged in:**
- Browser will open automatically
- Click "Authorize" in Netlify
- Return to terminal when done

**What you'll see:**
```
[STEP 2/6] Logging into Netlify...

Opening browser for Netlify login...
[Browser opens]

[OK] Successfully logged in!
```

---

#### Step 4: Site Configuration

**IMPORTANT:** You'll be asked for site settings.

**The script shows you exactly what to enter:**

```
========================================
  IMPORTANT: SITE CONFIGURATION
========================================

When prompted, use these settings:

  [1] What would you like to do?
      > Create and configure a new project

  [2] Team:
      > Viperdam

  [3] Site name:
      > bodymode
      (If taken, try: getbodymode, mybodymode, or bodymode-app)

  [4] Build command:
      > Just press ENTER (leave empty)

  [5] Directory to deploy:
      > public

  [6] Functions folder:
      > netlify/functions

========================================
```

**What to do:**
1. Select **"Create and configure a new project"**
2. Choose team **"Viperdam"**
3. Enter site name: **bodymode**
4. Press ENTER for build command (leave empty)
5. Type **public** for deploy directory
6. Type **netlify/functions** for functions folder

**Result:**
```
[OK] Site initialized!

Site Name: bodymode
Site URL: https://bodymode.netlify.app
```

---

#### Step 5: Environment Variables

The script automatically sets your API key.

**What happens:**
```
[STEP 4/6] Setting environment variables...

Setting GEMINI_API_KEY...
[OK] Environment variable set

Verifying environment variables...
[OK] GEMINI_API_KEY is set
```

**No action needed** - fully automatic!

---

#### Step 6: Production Deployment

The script deploys your site to production.

**What happens:**
```
[STEP 5/6] Deploying to production...

Starting deployment...
This may take 30-60 seconds...

----------------------------------------
  DEPLOYMENT OUTPUT
----------------------------------------
✔ Deploy is live!

Website URL:       https://bodymode.netlify.app
Function URLs:
  https://bodymode.netlify.app/.netlify/functions/gemini-proxy
----------------------------------------

[OK] Deployment successful!
```

**Wait time:** 30-60 seconds

---

#### Step 7: Automated Testing

The script automatically tests your deployment.

**Tests performed:**
```
[STEP 6/6] Testing deployment...

[TEST 1/4] Testing homepage...
[OK] Homepage is accessible (HTTP 200)

[TEST 2/4] Testing privacy policy page...
[OK] Privacy policy is accessible (HTTP 200)

[TEST 3/4] Testing API documentation page...
[OK] API documentation is accessible (HTTP 200)

[TEST 4/4] Testing API function...
Sending test request to API function...
[OK] API function is working correctly

Sample response:
"text": "Hello! How can I help you today?..."
```

**If all tests pass:** ✅ Your site is 100% operational!

---

#### Step 8: Deployment Summary

**What you'll see:**
```
========================================
  DEPLOYMENT SUMMARY
========================================

Website:      https://bodymode.netlify.app
Homepage:     https://bodymode.netlify.app
Privacy:      https://bodymode.netlify.app/privacy.html
Terms:        https://bodymode.netlify.app/terms.html
API Docs:     https://bodymode.netlify.app/docs.html
API Function: https://bodymode.netlify.app/.netlify/functions/gemini-proxy

Status:        DEPLOYED

========================================
```

**Copy your website URL** for the next step!

---

#### Step 9: Next Steps

The script tells you what to do next:

```
========================================
  NEXT STEPS
========================================

1. Update Mobile App URL
   File: mobile\src\services\netlifyGeminiService.ts
   Change to: https://bodymode.netlify.app/.netlify/functions/gemini-proxy

2. Rebuild Mobile App
   cd mobile
   npm run android

3. Test All Features
   - Food photo analysis
   - Daily plan generation
   - Chat with AI
   - Recipe generation

========================================
```

---

#### Step 10: Log Monitoring (Optional)

**Prompt:**
```
Do you want to monitor deployment logs? (Y/N)
```

**If you press Y:**
- Live logs stream from your API function
- See requests in real-time
- Press Ctrl+C to stop

**If you press N:**
- Script completes
- Deployment log saved to `deployment_log.txt`

---

## 🔍 Using the Monitoring Script

After deployment, use `MONITOR_DEPLOYMENT.bat` for ongoing monitoring.

### Option 1: Check Deployment Status

```
========================================
  DEPLOYMENT STATUS
========================================

Site Name:     bodymode
Site URL:      https://bodymode.netlify.app
Functions:     1 deployed
```

**Use when:** You want to verify site is online

---

### Option 2: Test All Endpoints

```
========================================
  TESTING ALL ENDPOINTS
========================================

[1/6] Testing Homepage...
HTTP 200 - 0.234s

[2/6] Testing Privacy Policy...
HTTP 200 - 0.189s

[3/6] Testing Terms of Service...
HTTP 200 - 0.201s

[4/6] Testing API Documentation...
HTTP 200 - 0.198s

[5/6] Testing Stylesheet...
HTTP 200 - 0.156s

[6/6] Testing JavaScript...
HTTP 200 - 0.143s

All endpoints tested!
```

**Use when:** You want to verify all pages load correctly

---

### Option 3: Monitor Function Logs (Real-time)

```
========================================
  MONITORING FUNCTION LOGS
========================================

Connecting to live logs...
Press Ctrl+C to stop monitoring

----------------------------------------

[2024-12-28T10:30:45.123Z] Request received: POST /gemini-proxy
[2024-12-28T10:30:45.456Z] Calling Gemini API...
[2024-12-28T10:30:47.789Z] Response sent: 200 OK (2.3s)
```

**Use when:**
- Debugging API issues
- Monitoring production traffic
- Testing mobile app integration

---

### Option 6: Test API Function

```
========================================
  TESTING API FUNCTION
========================================

Target: https://bodymode.netlify.app/.netlify/functions/gemini-proxy

Creating test request...
Sending POST request...

[SUCCESS] Response received:
----------------------------------------
{
  "candidates": [{
    "content": {
      "parts": [{
        "text": "Hello! How can I assist you?"
      }]
    }
  }],
  "text": "Hello! How can I assist you?"
}
----------------------------------------

[OK] API function is working correctly!
```

**Use when:**
- Testing API after changes
- Verifying API key is working
- Debugging mobile app issues

---

### Option 7: Run Full Health Check

```
========================================
  FULL HEALTH CHECK
========================================

[CHECK 1/8] Netlify Site Status...
[PASS] Connected to Netlify

[CHECK 2/8] Homepage Accessibility...
[PASS] Homepage is accessible (HTTP 200)

[CHECK 3/8] Privacy Policy...
[PASS] Privacy policy is accessible

[CHECK 4/8] Terms of Service...
[PASS] Terms of service is accessible

[CHECK 5/8] API Documentation...
[PASS] API docs are accessible

[CHECK 6/8] Environment Variables...
[PASS] GEMINI_API_KEY is configured

[CHECK 7/8] Function Deployment...
[PASS] gemini-proxy function is deployed

[CHECK 8/8] API Function Response...
[PASS] API function is working

========================================
  HEALTH CHECK SUMMARY
========================================

Passed: 8 checks
Failed: 0 checks

[SUCCESS] All systems operational!
```

**Use when:**
- Daily production checks
- After making changes
- Troubleshooting issues

---

## 🐛 Troubleshooting

### Issue: "Netlify CLI is not installed"

**Solution:**
```bash
npm install -g netlify-cli
```

Then run the script again.

---

### Issue: "Site name already taken"

**What happened:** Someone else is using "bodymode"

**Solution:**
- Use alternative: `getbodymode`, `mybodymode`, or `bodymode-app`
- The script shows alternatives automatically

---

### Issue: "Login failed"

**What happened:** Browser authentication didn't complete

**Solution:**
1. Close the script
2. Run: `netlify login` manually
3. Complete browser authentication
4. Run `DEPLOY_BODYMODE.bat` again

---

### Issue: "Deployment failed"

**What happened:** Network or configuration error

**Solution:**
1. Check error message in script output
2. Run `MONITOR_DEPLOYMENT.bat` → Option 1 (Check Status)
3. Check internet connection
4. Try deploying again: `netlify deploy --prod`

---

### Issue: "API function test failed"

**What happened:** Environment variable not set or API issue

**Solution:**
1. Run `MONITOR_DEPLOYMENT.bat` → Option 4 (Check Environment Variables)
2. Verify `GEMINI_API_KEY` is listed
3. If missing, set manually:
   ```bash
   netlify env:set GEMINI_API_KEY "AIzaSyD2QnjMptHnvGAFS_yYq2KKbDYoB0L_Ztc"
   ```
4. Redeploy:
   ```bash
   netlify deploy --prod --dir=public --functions=netlify/functions
   ```

---

## 📊 What the Scripts Check

### File Verification (8 files)

1. ✅ `public/index.html` - Homepage
2. ✅ `public/styles.css` - Styling
3. ✅ `public/script.js` - JavaScript
4. ✅ `public/privacy.html` - Privacy policy
5. ✅ `public/terms.html` - Terms of service
6. ✅ `public/docs.html` - API documentation
7. ✅ `netlify/functions/gemini-proxy.js` - API function
8. ✅ `netlify.toml` - Configuration

### Deployment Tests (4 tests)

1. ✅ Homepage accessibility (HTTP 200)
2. ✅ Privacy policy accessibility (HTTP 200)
3. ✅ API documentation accessibility (HTTP 200)
4. ✅ API function response (valid JSON with "candidates")

### Health Checks (8 checks)

1. ✅ Netlify connection
2. ✅ Homepage status
3. ✅ Privacy policy status
4. ✅ Terms of service status
5. ✅ API documentation status
6. ✅ Environment variables set
7. ✅ Function deployment
8. ✅ API function working

---

## 💡 Pro Tips

### Tip 1: Monitor During Development

Run `MONITOR_DEPLOYMENT.bat` → Option 3 while testing mobile app

See requests in real-time as you use the app!

### Tip 2: Daily Health Checks

Run `MONITOR_DEPLOYMENT.bat` → Option 7 once per day

Ensure everything is operational!

### Tip 3: Save Deployment Logs

After deployment, check `deployment_log.txt` for a record

### Tip 4: Test Before Mobile App Updates

Before rebuilding mobile app:
1. Run `MONITOR_DEPLOYMENT.bat` → Option 6 (Test API)
2. Verify API is working
3. Then update mobile app URL

---

## 📝 Deployment Log

After successful deployment, you'll get `deployment_log.txt`:

```
Body Mode Deployment Log
================================
Date: 12/28/2024 10:30:45
Website: https://bodymode.netlify.app
Function: https://bodymode.netlify.app/.netlify/functions/gemini-proxy
Status: SUCCESS
================================
```

**Keep this log for your records!**

---

## 🎯 Quick Reference

| Task | Script | Option |
|------|--------|--------|
| **Deploy for first time** | DEPLOY_BODYMODE.bat | - |
| **Redeploy after changes** | DEPLOY_BODYMODE.bat | - |
| **Check if site is online** | MONITOR_DEPLOYMENT.bat | 1 |
| **Test all pages** | MONITOR_DEPLOYMENT.bat | 2 |
| **Watch live requests** | MONITOR_DEPLOYMENT.bat | 3 |
| **Verify API key set** | MONITOR_DEPLOYMENT.bat | 4 |
| **Test API function** | MONITOR_DEPLOYMENT.bat | 6 |
| **Full system check** | MONITOR_DEPLOYMENT.bat | 7 |

---

## ✅ Success Checklist

After running `DEPLOY_BODYMODE.bat`:

- [ ] All 8 files verified
- [ ] Logged into Netlify
- [ ] Site created (bodymode.netlify.app)
- [ ] Environment variable set
- [ ] Deployed to production
- [ ] All 4 tests passed
- [ ] Site URL copied
- [ ] Mobile app URL updated
- [ ] Mobile app rebuilt
- [ ] All app features tested

**When all checked:** 🎉 You're live!

---

**Questions?** See the other documentation files:
- `START_HERE.md` - Quick start guide
- `SIMPLE_DEPLOY.md` - Manual deployment steps
- `NETLIFY_SETUP_GUIDE.md` - Comprehensive guide
- `PROFESSIONAL_SITE_READY.md` - Site overview
