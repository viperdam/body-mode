# Body Mode - Netlify Backend

This repository contains the **Netlify serverless backend** for the Body Mode mobile app.

## 🌐 Live URLs

- **Website**: https://bodymode.netlify.app
- **API Proxy**: https://bodymode.netlify.app/.netlify/functions/gemini-proxy

## 📁 Structure

```
├── netlify/
│   └── functions/
│       └── gemini-proxy.js    # Gemini API proxy function
├── public/                     # Static website files
│   ├── index.html              # Landing page
│   ├── privacy.html            # Privacy policy
│   ├── terms.html              # Terms of service
│   └── docs.html               # API documentation
├── netlify.toml                # Netlify configuration
└── DEPLOY_BODYMODE.bat         # Manual deployment script
```

## 🚀 Deployment

### Automatic (via GitHub Actions)
Push to `main` or `master` branch → auto-deploys to Netlify

### Manual
```bash
netlify deploy --prod --dir=public --functions=netlify/functions
```

## 🔐 Required Secrets for GitHub Actions

Set these in your GitHub repo → Settings → Secrets → Actions:

| Secret | Description |
|--------|-------------|
| `NETLIFY_AUTH_TOKEN` | Get from Netlify: User Settings → Applications → Personal access tokens |
| `NETLIFY_SITE_ID` | Get from Netlify: Site settings → General → Site ID |

## 🔗 Related Repositories

- **Mobile App**: [viperdam/bodymode-mobile](https://github.com/viperdam/bodymode-mobile)
