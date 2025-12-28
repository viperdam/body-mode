# 🚀 Quick Deployment Commands

## One-Time Setup

```bash
# 1. Login to Netlify
netlify login

# 2. Initialize site (run from project root)
cd "c:\Users\AMors\Desktop\body mode"
netlify init

# Follow prompts:
# - Create & configure a new site
# - Team: Your team
# - Site name: body-mode-backend (or custom name)
# - Build command: (leave empty)
# - Directory to deploy: public
# - Functions directory: netlify/functions

# 3. Set API key (REPLACE with your new key)
netlify env:set GEMINI_API_KEY "your_new_api_key_here"

# 4. Deploy to production
netlify deploy --prod

# 5. Copy the function URL from output:
# https://YOUR-SITE-NAME.netlify.app/.netlify/functions/gemini-proxy
```

## Update Mobile App

After deploying, update this file:

**File:** `mobile/src/services/netlifyGeminiService.ts`

Replace line 15:
```typescript
: 'https://YOUR_NETLIFY_SITE_NAME.netlify.app/.netlify/functions/gemini-proxy';
```

With your actual Netlify URL.

## Test Deployment

```bash
# Test the function
curl -X POST https://YOUR-SITE-NAME.netlify.app/.netlify/functions/gemini-proxy \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-1.5-flash", "contents": {"parts": [{"text": "Hello!"}]}}'

# Expected: JSON response with AI-generated text
```

## Local Development

```bash
# Start local Netlify dev server
netlify dev

# Server runs at: http://localhost:8888
# Functions at: http://localhost:8888/.netlify/functions/gemini-proxy

# Your mobile app will automatically use localhost when __DEV__ is true
```

## Redeploy After Changes

```bash
# After modifying serverless functions
netlify deploy --prod

# View live logs
netlify functions:log gemini-proxy --follow
```

## Check Status

```bash
# List environment variables
netlify env:list

# View function logs
netlify functions:log gemini-proxy

# Open site in browser
netlify open:site

# Open admin dashboard
netlify open:admin
```

---

## ⚠️ CRITICAL: Before First Deploy

1. **Revoke old API key** at https://aistudio.google.com/app/apikey
2. **Generate new API key**
3. **Set new key in Netlify:** `netlify env:set GEMINI_API_KEY "new_key"`
4. **Remove key from mobile/.env** (comment it out or delete)

---

## Troubleshooting

### Function returns "API key not configured"
```bash
netlify env:set GEMINI_API_KEY "your_key"
netlify deploy --prod
```

### Function not found (404)
```bash
# Check functions are deployed
netlify functions:list

# Redeploy
netlify deploy --prod
```

### Mobile app can't connect
1. Check URL in `netlifyGeminiService.ts` is correct
2. Test function with `curl` first
3. Rebuild mobile app: `npm run android`

---

**Need help?** See full guide: `NETLIFY_SETUP_GUIDE.md`
