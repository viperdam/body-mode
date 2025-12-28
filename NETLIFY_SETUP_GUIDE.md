# 🚀 Netlify Setup Guide - Secure Gemini API Integration

This guide will help you deploy your Body Mode backend to Netlify to securely proxy Gemini API calls.

## 📋 Prerequisites

- ✅ Netlify CLI installed (`npm install -g netlify-cli`)
- ✅ Netlify account (free tier is enough)
- ✅ Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- ✅ Git repository with latest code

---

## 🔐 STEP 1: Revoke the Exposed API Key (CRITICAL)

**⚠️ BEFORE DEPLOYING, DO THIS IMMEDIATELY:**

1. Go to [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)
2. Find the key: `AIzaSyD2QnjMptHnvGAFS_yYq2KKbDYoB0L_Ztc`
3. Click the **Delete** button
4. Confirm deletion
5. Generate a NEW API key
6. **DO NOT commit this new key to Git!**

---

## 🌐 STEP 2: Create Netlify Site

### Option A: Deploy via Netlify CLI (Recommended)

```bash
# Navigate to your project root
cd "c:\Users\AMors\Desktop\body mode"

# Login to Netlify
netlify login

# Initialize new site
netlify init

# Follow the prompts:
# - Create & configure a new site: Yes
# - Team: Select your team
# - Site name: bodymode (short, professional, memorable)
# - Build command: (leave empty - we don't need a build)
# - Directory to deploy: public (we'll create this)
# - Netlify functions folder: netlify/functions (already created)

# Create public directory (required even if empty)
mkdir public
echo "Netlify Backend for Body Mode" > public/index.html
```

### Option B: Deploy via Netlify Dashboard

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **"Add new site" → "Import an existing project"**
3. Connect your Git provider (GitHub/GitLab/Bitbucket)
4. Select your repository
5. Configure build settings:
   - **Build command:** (leave empty)
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
6. Click **"Deploy site"**

---

## 🔑 STEP 3: Set Environment Variable (API Key)

### Via Netlify CLI:

```bash
# Set the Gemini API key as an environment variable
netlify env:set GEMINI_API_KEY "your_new_gemini_api_key_here"

# Verify it was set
netlify env:list
```

### Via Netlify Dashboard:

1. Go to your site dashboard
2. Navigate to **Site configuration → Environment variables**
3. Click **"Add a variable"**
4. Set:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** `your_new_gemini_api_key_here`
   - **Scopes:** Production, Deploy previews, Branch deploys (all)
5. Click **"Create variable"**

---

## 🎯 STEP 4: Deploy to Production

```bash
# Deploy the site
netlify deploy --prod

# Netlify will:
# 1. Upload your files
# 2. Deploy the serverless functions
# 3. Give you a production URL

# Example output:
# ✔ Deploy is live!
#
# Logs:              https://app.netlify.com/sites/bodymode/deploys/...
# Website URL:       https://bodymode.netlify.app
# Function URLs:
#   https://bodymode.netlify.app/.netlify/functions/gemini-proxy
```

**Important:** Copy your function URL (it will look like `https://YOUR_SITE_NAME.netlify.app/.netlify/functions/gemini-proxy`)

---

## 📱 STEP 5: Update Mobile App Configuration

### Update the Netlify function URL in your app:

1. Open `mobile/src/services/netlifyGeminiService.ts`
2. Replace `YOUR_NETLIFY_SITE_NAME` with your actual site name:

```typescript
const NETLIFY_FUNCTION_URL = __DEV__
  ? 'http://localhost:8888/.netlify/functions/gemini-proxy' // Local dev
  : 'https://bodymode.netlify.app/.netlify/functions/gemini-proxy'; // ← UPDATE THIS
```

3. Save the file

---

## 🧪 STEP 6: Test the Deployment

### Test via CLI:

```bash
# Test the function endpoint
curl -X POST https://YOUR_SITE_NAME.netlify.app/.netlify/functions/gemini-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-1.5-flash",
    "contents": {
      "parts": [{ "text": "Say hello!" }]
    }
  }'

# Expected response:
# {
#   "candidates": [...],
#   "text": "Hello! ..."
# }
```

### Test via React Native App:

1. Make sure you updated the URL in Step 5
2. Rebuild your app:
   ```bash
   cd mobile
   npm run android
   # or
   npm run ios
   ```
3. Try generating a meal plan or analyzing food
4. Check the logs:
   ```bash
   # Watch Netlify function logs
   netlify functions:log gemini-proxy
   ```

---

## 🔧 STEP 7: Test Locally (Optional)

You can test the serverless functions locally before deploying:

```bash
# Start Netlify Dev server
netlify dev

# This will:
# - Start local server at http://localhost:8888
# - Run serverless functions locally
# - Use your local .env variables

# Test locally:
curl -X POST http://localhost:8888/.netlify/functions/gemini-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-1.5-flash",
    "contents": {
      "parts": [{ "text": "Hello from local!" }]
    }
  }'
```

To use local testing with your mobile app:
1. Make sure `__DEV__` is true in your React Native app
2. The app will automatically use `http://localhost:8888`

---

## ✅ STEP 8: Remove API Key from Mobile App

**Critical Security Step:**

1. Open `mobile/.env`
2. Remove or comment out the API key:
   ```bash
   # EXPO_PUBLIC_GEMINI_API_KEY=  # ← Remove or comment out
   ```
3. Commit and push this change:
   ```bash
   git add mobile/.env
   git commit -m "chore: remove exposed API key (now using Netlify)"
   git push
   ```

---

## 📊 STEP 9: Monitor Usage

### Check Function Invocations:

1. Go to [app.netlify.com](https://app.netlify.com)
2. Select your site
3. Go to **Functions** tab
4. Click on `gemini-proxy`
5. View:
   - Total invocations
   - Function logs
   - Error rates
   - Performance metrics

### Free Tier Limits:

| Resource | Free Tier | Your Usage | When to Upgrade |
|----------|-----------|------------|-----------------|
| Function invocations | 125,000/month | ~30,000/month (1K users) | At 4,000 daily users |
| Function runtime | 100 hours/month | ~5 hours/month | Unlikely to hit |
| Bandwidth | 100 GB/month | ~60 MB/month | Very safe |

---

## 🐛 Troubleshooting

### Problem: "Server configuration error. API key not configured."

**Solution:**
- Go to Netlify dashboard → Site configuration → Environment variables
- Verify `GEMINI_API_KEY` is set
- Redeploy: `netlify deploy --prod`

### Problem: "Function not found" or 404 error

**Solution:**
- Check that `netlify/functions/gemini-proxy.js` exists
- Run `netlify deploy --prod` again
- Verify the function URL is correct

### Problem: "CORS error" in mobile app

**Solution:**
- The function already has CORS headers (`Access-Control-Allow-Origin: *`)
- If still getting errors, check that you're calling the correct URL
- Try testing with `curl` first to isolate the issue

### Problem: Mobile app still tries to use old API

**Solution:**
- Make sure you updated `netlifyGeminiService.ts` with your production URL
- Rebuild the mobile app completely:
  ```bash
  cd mobile
  rm -rf node_modules
  npm install
  npx react-native start --reset-cache
  npm run android  # or ios
  ```

### Problem: "Rate limit exceeded" even though you just deployed

**Solution:**
- This means your NEW API key is being used (good!)
- Gemini free tier has rate limits
- Wait 60 seconds and try again
- Consider upgrading to Gemini Pro if you hit limits frequently

---

## 🎉 Success Checklist

- ✅ Old API key revoked
- ✅ New API key generated
- ✅ Netlify site created
- ✅ Environment variable set on Netlify
- ✅ Deployed to production
- ✅ Mobile app updated with Netlify URL
- ✅ Mobile app tested and working
- ✅ API key removed from mobile/.env
- ✅ Changes committed to Git

---

## 📈 Next Steps

1. **Monitor for 24 hours** - Check Netlify dashboard for any errors
2. **Test all features** - Food logging, plan generation, chat
3. **Performance check** - Measure response times
4. **Usage tracking** - Set up alerts if you approach limits

---

## 💰 Cost Estimate

**Current setup is 100% FREE** until you hit:
- 125,000 function calls/month (= 4,000 daily users)
- 100 GB bandwidth/month

When you exceed free tier:
- **Netlify Pro**: $19/month (1M functions, 400 GB bandwidth)

---

## 🔒 Security Benefits

✅ **Before:** API key in mobile app bundle → Anyone can extract it
✅ **After:** API key on Netlify servers → Impossible to extract

✅ **Before:** Direct API calls → No rate limiting control
✅ **After:** Proxied calls → Can add custom rate limiting

✅ **Before:** Exposed to abuse → Unlimited quota theft
✅ **After:** Server-controlled → Full control over usage

---

## 📞 Support

If you encounter any issues:

1. Check Netlify function logs: `netlify functions:log gemini-proxy`
2. Test with `curl` to isolate mobile app vs. function issues
3. Verify environment variable is set: `netlify env:list`
4. Check Netlify dashboard for deployment errors

---

**You're now running a secure, production-ready AI backend! 🎉**
