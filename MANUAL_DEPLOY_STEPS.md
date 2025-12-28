# 🚀 Manual Deployment Steps (If Script Fails)

Follow these steps in your terminal to deploy manually.

---

## Prerequisites

✅ You have Netlify CLI installed
✅ You're in the project directory: `c:\Users\AMors\Desktop\body mode`

---

## Step 1: Login to Netlify

```bash
netlify login
```

- This will open your browser
- Click "Authorize" to login
- Return to terminal when done

---

## Step 2: Initialize New Site

```bash
netlify init
```

**When prompted:**

1. **"What would you like to do?"**
   - Select: **"Create & configure a new project"**

2. **"Team:"**
   - Select: **"Viperdam"**

3. **"Site name:"**
   - Enter: **`bodymode`** (short, professional, memorable)
   - If taken, try: `getbodymode`, `mybodymode`, or `bodymode-app`

4. **"Your build command:"**
   - Leave empty (press Enter)

5. **"Directory to deploy:"**
   - Enter: **`public`**

6. **"Netlify functions folder:"**
   - Enter: **`netlify/functions`**

7. **Confirm:**
   - Press Enter to confirm

✅ Site created! You should see a success message with your site URL.

---

## Step 3: Set Environment Variable (API Key)

### ⚠️ CRITICAL: Get New API Key First

1. Go to: https://aistudio.google.com/app/apikey
2. **DELETE** the old key: `AIzaSyD2QnjMptHnvGAFS_yYq2KKbDYoB0L_Ztc`
3. Click **"Create API Key"**
4. Copy the new key to clipboard

### Set the Key in Netlify:

```bash
netlify env:set GEMINI_API_KEY "your_new_api_key_here"
```

**Replace** `your_new_api_key_here` with your actual key.

Example:
```bash
netlify env:set GEMINI_API_KEY "AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXX"
```

✅ Verify it was set:
```bash
netlify env:list
```

You should see `GEMINI_API_KEY` listed.

---

## Step 4: Deploy to Production

```bash
netlify deploy --prod --dir=public --functions=netlify/functions
```

**What happens:**
- Netlify uploads your files
- Deploys serverless functions
- Gives you production URL

**Expected output:**
```
✔ Deploy is live!

Logs:        https://app.netlify.com/sites/...
Website URL: https://bodymode.netlify.app
Function URLs:
  https://bodymode.netlify.app/.netlify/functions/gemini-proxy
```

**Copy your Function URL** - you'll need it in the next step!

---

## Step 5: Test the Deployment

Test your function with curl:

```bash
curl -X POST https://YOUR-SITE-NAME.netlify.app/.netlify/functions/gemini-proxy -H "Content-Type: application/json" -d "{\"model\": \"gemini-1.5-flash\", \"contents\": {\"parts\": [{\"text\": \"Say hello!\"}]}}"
```

**Replace** `YOUR-SITE-NAME` with your actual site name.

**Expected response:**
```json
{
  "candidates": [...],
  "text": "Hello! ..."
}
```

✅ If you see this, your backend is working!

---

## Step 6: Update Mobile App

### 6a. Update Netlify Function URL

Open: `mobile\src\services\netlifyGeminiService.ts`

**Find line 15:**
```typescript
: 'https://YOUR_NETLIFY_SITE_NAME.netlify.app/.netlify/functions/gemini-proxy';
```

**Replace with your actual URL:**
```typescript
: 'https://bodymode.netlify.app/.netlify/functions/gemini-proxy';
```

**Save the file.**

### 6b. Remove API Key from Mobile App

Open: `mobile\.env`

**Find:**
```
EXPO_PUBLIC_GEMINI_API_KEY=AIzaSyD2QnjMptHnvGAFS_yYq2KKbDYoB0L_Ztc
```

**Comment it out:**
```
# EXPO_PUBLIC_GEMINI_API_KEY=AIzaSyD2QnjMptHnvGAFS_yYq2KKbDYoB0L_Ztc
```

**Save the file.**

---

## Step 7: Rebuild Mobile App

```bash
cd mobile
npm run android
```

(Or `npm run ios` if on Mac)

---

## Step 8: Test Everything

Open your mobile app and test:

- ✅ Take a photo of food (AI should analyze it)
- ✅ Generate a daily plan (AI should create plan)
- ✅ Use the chat feature
- ✅ Generate recipes

**All these should work WITHOUT an API key in your mobile app!**

---

## 🎉 Success Checklist

- [x] Logged into Netlify
- [x] Created new site
- [x] Set environment variable (new API key)
- [x] Deployed to production
- [x] Tested function with curl
- [x] Updated mobile app URL
- [x] Removed API key from mobile/.env
- [x] Rebuilt mobile app
- [x] Tested all AI features

---

## 🐛 Troubleshooting

### "Site name already taken"

Try a different name:
- `getbodymode`
- `mybodymode`
- `bodymode-app`
- `your-name-bodymode`

### "Environment variable not set"

Check:
```bash
netlify env:list
```

If missing, set again:
```bash
netlify env:set GEMINI_API_KEY "your_key"
```

Then redeploy:
```bash
netlify deploy --prod --dir=public --functions=netlify/functions
```

### "Function returns 'API key not configured'"

1. Check environment variable is set: `netlify env:list`
2. Redeploy: `netlify deploy --prod`
3. Wait 30 seconds for env vars to propagate

### "Mobile app can't connect"

1. Test function with `curl` first
2. Check URL in `netlifyGeminiService.ts` is correct (no typos)
3. Rebuild app completely:
   ```bash
   cd mobile
   rm -rf node_modules
   npm install
   npm run android
   ```

### "Rate limited" error

This is normal! Gemini free tier has limits.
- Wait 60 seconds
- Try again
- If persistent, you may need to upgrade Gemini API tier

---

## 📊 Monitor Your Deployment

View logs:
```bash
netlify functions:log gemini-proxy --follow
```

View usage:
- Go to: https://app.netlify.com
- Select your site
- Click "Functions" tab

---

## 🔒 Security Verification

Your API key is now:
- ✅ Stored on Netlify servers (not in mobile app)
- ✅ Never committed to Git
- ✅ Impossible to extract from APK
- ✅ Completely secure for Play Store release

---

**Need help?** See the full guide: `NETLIFY_SETUP_GUIDE.md`

**Questions?** Check: `IMPLEMENTATION_SUMMARY.md`
