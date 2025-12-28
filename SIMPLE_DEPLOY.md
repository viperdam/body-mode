# 🚀 SIMPLE 3-STEP DEPLOYMENT

## Step 1: Open Terminal

Open Command Prompt or PowerShell and run:

```bash
cd "c:\Users\AMors\Desktop\body mode"
```

---

## Step 2: Run This Command

Copy and paste this ENTIRE command:

```bash
netlify init
```

**When prompted, select:**

1. **"What would you like to do?"**
   → `Create & configure a new project`

2. **"Team:"**
   → `Viperdam`

3. **"Site name:"**
   → Type: `bodymode` (press ENTER)
   → If taken, try: `getbodymode` or `mybodymode`

4. **"Your build command:"**
   → Press ENTER (leave empty)

5. **"Directory to deploy:"**
   → Type: `public` (press ENTER)

6. **"Netlify functions folder:"**
   → Type: `netlify/functions` (press ENTER)

✅ **Site created!**

---

## Step 3: Set API Key and Deploy

Now run these commands ONE BY ONE:

```bash
netlify env:set GEMINI_API_KEY "AIzaSyD2QnjMptHnvGAFS_yYq2KKbDYoB0L_Ztc"
```

```bash
netlify deploy --prod --dir=public --functions=netlify/functions
```

✅ **Deployed!**

---

## Step 4: Get Your URL

```bash
netlify status
```

**Copy the "Website URL"** - it will look like:
```
https://bodymode.netlify.app
```

---

## Step 5: Test It

Replace `YOUR-SITE-NAME` with your actual site name:

```bash
curl -X POST https://YOUR-SITE-NAME.netlify.app/.netlify/functions/gemini-proxy -H "Content-Type: application/json" -d "{\"model\":\"gemini-1.5-flash\",\"contents\":{\"parts\":[{\"text\":\"Hello\"}]}}"
```

You should see JSON response with AI text!

---

## Step 6: Update Mobile App

Open: `mobile\src\services\netlifyGeminiService.ts`

**Line 15**, change:
```typescript
: 'https://YOUR_NETLIFY_SITE_NAME.netlify.app/.netlify/functions/gemini-proxy';
```

To your actual URL:
```typescript
: 'https://bodymode.netlify.app/.netlify/functions/gemini-proxy';
```

Save the file.

---

## Step 7: Rebuild App

```bash
cd mobile
npm run android
```

---

## ✅ DONE!

Your app now uses the secure Netlify backend!

Test:
- Take a food photo → AI should analyze it
- Generate a plan → AI should create it
- Use chat → AI should respond

All working? You're deployed! 🎉
