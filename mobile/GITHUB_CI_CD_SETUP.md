# 🚀 GitHub CI/CD Setup - Complete Guide

## ✅ What's Already Done

- ✅ GitHub repository created
- ✅ All secrets configured in GitHub:
  - `ANDROID_KEYSTORE_BASE64`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`
  - `ANDROID_STORE_PASSWORD`

---

## 🔄 Current Step: GitHub CLI Authentication

### You need to complete this authentication:

1. **Copy the one-time code:** `E612-4BFF`
2. **Open in browser:** https://github.com/login/device
3. **Enter the code** and authorize
4. **Grant workflow scope** permission

---

## 📦 What Happens After Authentication

Once authenticated, the following will happen automatically:

### 1. **Code Will Be Pushed to GitHub**
```bash
git push -u origin master
```

### 2. **GitHub Actions Workflow Starts**
- Workflow file: `.github/workflows/android-build.yml`
- Triggers on: Push to `master` branch
- Build time: ~10-15 minutes

### 3. **Build Steps**
The workflow will:
1. ✅ Checkout code
2. ✅ Set up Node.js 18
3. ✅ Install dependencies (`npm install`)
4. ✅ Create Android native project (`npx expo prebuild`)
5. ✅ Decode keystore from secrets
6. ✅ Build Release APK (`./gradlew assembleRelease`)
7. ✅ Upload APK as artifact

### 4. **Download Your APK**
After build completes:
1. Go to your GitHub repository
2. Click **Actions** tab
3. Click on the latest workflow run
4. Scroll to **Artifacts** section
5. Download `app-release.apk`
6. Install on your phone!

---

## 📱 APK Details

**Output APK:**
- Name: `app-release.apk`
- Size: ~30-50 MB
- Signed with: Debug keystore (for testing)
- Install: Transfer to phone and install

**For Production:**
Replace debug keystore with production keystore:
1. Generate production keystore
2. Update GitHub secrets with production values
3. Push code
4. New APK signed with production key

---

## 🔧 Workflow Configuration

The GitHub Actions workflow is located at:
```
.github/workflows/android-build.yml
```

**Triggers:**
- Push to `master` branch
- Manual dispatch (can run manually from Actions tab)

**Environment:**
- Node.js: 18
- Java: 17
- Android SDK: Configured automatically

---

## 🎯 How to Trigger Builds

### Automatic Trigger (Recommended)
```bash
# Make changes to your code
git add .
git commit -m "Your commit message"
git push origin master
```
→ Build starts automatically

### Manual Trigger
1. Go to GitHub → Actions tab
2. Select "Build Android APK" workflow
3. Click "Run workflow"
4. Select branch (master)
5. Click "Run workflow" button

---

## 📊 Build Status

**Check Build Status:**
1. GitHub repository → Actions tab
2. See all workflow runs
3. Green checkmark = Success ✅
4. Red X = Failed ❌
5. Click run for details

**Build Logs:**
- Click on workflow run
- Click on "build" job
- Expand steps to see detailed logs

---

## 🐛 Troubleshooting

### Build Fails: "Secret not found"
**Fix:** Verify all 4 secrets are set in GitHub Settings → Secrets

### Build Fails: "Gradle build failed"
**Fix:** Check build logs for specific error
Common causes:
- Missing dependencies
- Syntax errors in code
- Invalid app.json configuration

### APK Not Appearing in Artifacts
**Fix:** Check if build completed successfully (green checkmark)
Artifacts only appear if build succeeds

### Can't Install APK on Phone
**Fix:**
1. Enable "Install from unknown sources"
2. Make sure APK is downloaded completely
3. Try different file transfer method

---

## 🔐 Keystore Management

### Current Setup (Debug Keystore)
```
Location: mobile/android/app/debug.keystore
Alias: androiddebugkey
Password: android
```

**Good for:** Testing, development builds

### Production Setup (When Ready)
```bash
# Generate production keystore
keytool -genkeypair -v -storetype PKCS12 \
  -keystore production.keystore \
  -alias production-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

# Convert to base64
base64 -i production.keystore

# Update GitHub secrets with:
# - New base64 keystore
# - New alias
# - New passwords
```

---

## 📈 Build Optimization

### Speed Up Builds
1. **Enable Gradle caching** (already configured)
2. **Use dependency caching** (already configured)
3. **Optimize dependencies** (remove unused packages)

### Reduce APK Size
1. Enable ProGuard/R8 (minification)
2. Enable resource shrinking
3. Use APK splits for different architectures

**Add to `android/app/build.gradle`:**
```gradle
android {
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

---

## 🎉 Success Checklist

After first successful build:

- [ ] Build completed with green checkmark
- [ ] APK appears in Artifacts section
- [ ] APK downloads successfully
- [ ] APK transfers to phone
- [ ] APK installs on phone
- [ ] App opens and works
- [ ] All features function correctly

---

## 📝 Next Steps

### After First Build Success

1. **Test the APK thoroughly**
   - All features working?
   - No crashes?
   - Performance good?

2. **Set up branch protection**
   - Require build to pass before merge
   - Prevent direct pushes to master

3. **Add more workflows**
   - Automated testing
   - Code quality checks (ESLint)
   - Type checking

4. **Prepare for production**
   - Generate production keystore
   - Update secrets
   - Test production build

---

## 🚀 Ready for Production?

When ready to publish to Google Play:

1. **Create production keystore** (see above)
2. **Update GitHub secrets** with production values
3. **Push to trigger build**
4. **Download production APK**
5. **Test thoroughly**
6. **Upload to Google Play Console**

---

## 📞 Quick Commands

```bash
# Push code and trigger build
git push origin master

# Check build status
gh run list --limit 5

# View specific run
gh run view <run-id>

# Download artifacts
gh run download <run-id>

# Manually trigger build
gh workflow run android-build.yml
```

---

**Your CI/CD pipeline is ready! Just waiting for GitHub authentication to complete.** 🎉
