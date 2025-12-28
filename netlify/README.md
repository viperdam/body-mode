# Netlify Serverless Functions

This directory contains serverless functions that run on Netlify's infrastructure.

## Functions

### gemini-proxy.js

**Purpose:** Securely proxy requests to Google Gemini AI API

**Why:**
- Keeps API key on server (never exposed to mobile app)
- Prevents API key extraction from APK
- Adds request validation and error handling
- Enables usage monitoring and rate limiting

**Endpoint:** `/.netlify/functions/gemini-proxy`

**Method:** `POST`

**Request:**
```json
{
  "model": "gemini-1.5-flash",
  "contents": {
    "parts": [{ "text": "Your prompt here" }]
  },
  "config": {
    "systemInstruction": "You are a helpful AI...",
    "responseMimeType": "application/json",
    "responseSchema": { ... }
  }
}
```

**Response:**
```json
{
  "candidates": [...],
  "text": "AI generated response",
  "usageMetadata": { ... }
}
```

**Environment Variables Required:**
- `GEMINI_API_KEY` - Google Gemini API key (set in Netlify dashboard)

**Local Testing:**
```bash
# Start Netlify dev server
netlify dev

# Test function
curl -X POST http://localhost:8888/.netlify/functions/gemini-proxy \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-1.5-flash", "contents": {"parts": [{"text": "Hello!"}]}}'
```

**Production:**
```bash
# Deploy
netlify deploy --prod

# View logs
netlify functions:log gemini-proxy --follow
```

## Adding New Functions

1. Create new file in `netlify/functions/`:
   ```javascript
   // netlify/functions/my-function.js
   exports.handler = async (event) => {
     return {
       statusCode: 200,
       body: JSON.stringify({ message: 'Hello!' })
     };
   };
   ```

2. Deploy:
   ```bash
   netlify deploy --prod
   ```

3. Access at:
   ```
   https://your-site.netlify.app/.netlify/functions/my-function
   ```

## Function Limits (Free Tier)

- **Invocations:** 125,000/month
- **Timeout:** 10 seconds max
- **Memory:** 1024 MB
- **Concurrent executions:** 1,000

## Documentation

- Netlify Functions: https://docs.netlify.com/functions/overview/
- Environment Variables: https://docs.netlify.com/environment-variables/overview/
- Build & Deploy: https://docs.netlify.com/configure-builds/overview/
