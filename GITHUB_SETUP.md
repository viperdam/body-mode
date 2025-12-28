# GitHub Setup Guide for Body Mode

## 📁 Repository Structure

You now have **two separate Git repositories**:

| Repository | Location | Purpose |
|------------|----------|---------|
| **bodymode-backend** | `c:\Users\AMors\Desktop\body mode` | Netlify website + API proxy |
| **bodymode-mobile** | `c:\Users\AMors\Desktop\body mode\mobile` | React Native mobile app |

---

## 🚀 Step 1: Create GitHub Repository for Backend

1. Go to https://github.com/new
2. Repository name: `bodymode-backend` (or `bodymode-netlify`)
3. Set to **Private** if desired
4. **DO NOT** initialize with README (we already have one)
5. Click **Create repository**

Then run:
```bash
cd "c:\Users\AMors\Desktop\body mode"
git remote add origin https://github.com/viperdam/bodymode-backend.git
git branch -M main
git push -u origin main
```

---

## 🔐 Step 2: Add GitHub Secrets for Auto-Deploy

In your new GitHub repo, go to **Settings → Secrets → Actions** and add:

| Secret | How to Get It |
|--------|---------------|
| `NETLIFY_AUTH_TOKEN` | Netlify → User Settings → Applications → New access token |
| `NETLIFY_SITE_ID` | Netlify → Site settings → General → Site ID (looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |

---

## 📤 Step 3: Push Mobile App Changes

The mobile repo already has `origin` set up. Just push:
```bash
cd "c:\Users\AMors\Desktop\body mode\mobile"
git push
```

---

## ✅ What's Now Set Up

- [x] Root project initialized with Git
- [x] Comprehensive `.gitignore` protecting secrets
- [x] GitHub Actions workflow for Netlify auto-deploy
- [x] Mobile app changes committed (Activity Recognition, boot recovery, etc.)
- [x] README with deployment instructions

---

## 🔄 Daily Workflow

### Backend (Netlify)
```bash
cd "c:\Users\AMors\Desktop\body mode"
git add .
git commit -m "Your change description"
git push
# GitHub Actions will auto-deploy to Netlify!
```

### Mobile App
```bash
cd "c:\Users\AMors\Desktop\body mode\mobile"
git add .
git commit -m "Your change description"
git push
# GitHub Actions will auto-build APK!
```
