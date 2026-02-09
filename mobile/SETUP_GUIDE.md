# BioSync AI - Setup Guide

Complete step-by-step guide to get BioSync AI running on your development machine.

---

## 📋 Prerequisites Checklist

### Required for All Platforms
- [ ] **Node.js** 18+ installed ([Download](https://nodejs.org/))
- [ ] **npm** 8+ (comes with Node.js)
- [ ] **Git** installed
- [ ] **Code editor** (VS Code recommended)
- [ ] **Expo Go** app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))

### For iOS Development
- [ ] **macOS** computer (required for iOS)
- [ ] **Xcode** 14+ from Mac App Store
- [ ] **iOS Simulator** (installed with Xcode)
- [ ] **CocoaPods** (`sudo gem install cocoapods`)

### For Android Development
- [ ] **Android Studio** ([Download](https://developer.android.com/studio))
- [ ] **Android SDK** (installed via Android Studio)
- [ ] **Android Emulator** configured in Android Studio
- [ ] **Java JDK** 11+ ([Download](https://adoptium.net/))

---

## 🚀 Step 1: Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd body-mode/mobile

# Install dependencies
npm install

# Verify installation
npm list --depth=0
```

**Expected output:** List of all dependencies without errors.

---

## 🔑 Step 2: Get Google Gemini API Key

1. **Visit Google AI Studio**
   - Go to [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)

2. **Create API Key**
   - Click "Create API Key"
   - Select "Create API key in new project" or choose existing project
   - Copy the generated key (starts with `AIza...`)

3. **Create .env file**
   ```bash
   # In mobile/ directory
   touch .env
   ```

4. **Add API key to .env**
   ```env
   EXPO_PUBLIC_GEMINI_API_KEY=AIzaSy...your_actual_key_here
   ```

Optional (Google sign-in):
```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_google_web_client_id_here
```

**⚠️ Important:** Never commit `.env` to Git. It's already in `.gitignore`.

---

## 📱 Step 3: Run on Development Device

### Option A: Expo Go (Easiest - Recommended for Testing)

```bash
# Start Expo development server
npm start
```

**On Terminal:**
- Press `i` for iOS Simulator (macOS only)
- Press `a` for Android Emulator
- Scan QR code with phone camera (iOS) or Expo Go app (Android)

**Expected Behavior:**
- Metro bundler starts
- QR code appears in terminal
- App loads on device/simulator

### Option B: iOS Simulator (macOS Only)

```bash
# Ensure Xcode is installed
xcode-select --install

# Start iOS simulator directly
npm run ios
```

**First-time setup:**
- May take 5-10 minutes to build
- Simulator opens automatically
- App installs and launches

### Option C: Android Emulator

```bash
# Ensure emulator is running (start from Android Studio)
# or start via command line:
emulator -avd <your_avd_name>

# Then run:
npm run android
```

**Troubleshooting Android:**
- If emulator doesn't start: Open Android Studio → AVD Manager → Start emulator
- If build fails: `cd android && ./gradlew clean && cd ..`

---

## ✅ Step 4: Verify App Functionality

### Test Checklist

**Onboarding (First Launch):**
- [ ] Welcome screen appears with features list
- [ ] Tap "Get Started"
- [ ] Complete all 8 onboarding steps:
  1. Name input
  2. Age slider
  3. Gender selection
  4. Height/weight input
  5. Goal selection (lose/maintain/gain)
  6. Activity level
  7. Medical conditions (optional)
  8. Dietary preferences

**Dashboard:**
- [ ] Dashboard loads with user greeting
- [ ] Calorie progress shows 0/target
- [ ] Weather widget displays (requires location permission)
- [ ] Quick actions visible (Scan Food, Generate Plan, Sleep, Smart Fridge)

**Food Scanner:**
- [ ] Tap "Scan Food" from dashboard
- [ ] Camera permission requested
- [ ] Camera view loads
- [ ] Take photo of food (or use gallery)
- [ ] AI analyzes and shows macros
- [ ] Can log food to diary

**AI Coach:**
- [ ] Navigate to "AI Coach" tab
- [ ] Send a test message: "What should I eat for breakfast?"
- [ ] AI responds with personalized advice

**Settings:**
- [ ] Navigate to "Settings" tab
- [ ] Change language (test a few languages)
- [ ] Export data → JSON appears
- [ ] Copy to clipboard works

---

## 🔧 Step 5: Configure Optional Features

### AdMob Setup (Optional - For Testing Ads)

**Current Status:** App uses test AdMob IDs (ads work automatically).

**To use real ads:**
1. Create AdMob account at [admob.google.com](https://admob.google.com)
2. Create app in AdMob console
3. Create Rewarded Ad unit
4. Update `app.json`:
   ```json
   [
     "react-native-google-mobile-ads",
     {
       "androidAppId": "ca-app-pub-YOUR_ID~YOUR_APP_ID",
       "iosAppId": "ca-app-pub-YOUR_ID~YOUR_APP_ID"
     }
   ]
   ```
5. Rebuild app: `eas build` or restart Expo

### Push Notifications Setup (Optional)

**For local testing:**
- Notifications work automatically with Expo
- Test with sleep reminders or daily plan notifications

**For production:**
1. iOS: Configure APNs in Apple Developer Portal
2. Android: Firebase Cloud Messaging auto-configured by Expo
3. No additional setup needed for Expo-managed builds

### Firebase Setup (Recommended)

Use the Firebase checklist in this repo: [FIREBASE_SETUP.md](FIREBASE_SETUP.md)

```
cd mobile
cat FIREBASE_SETUP.md
```

---

## 🏗️ Step 6: Build Standalone App (Production)

### Install EAS CLI

```bash
npm install -g eas-cli
eas login
```

### Configure EAS

```bash
cd mobile
eas build:configure
```

**Choose:**
- iOS bundle ID: `com.viperdam.bodymode` (or custom)
- Android package: `com.viperdam.bodymode` (or custom)

### Build for iOS

```bash
eas build --platform ios --profile production
```

**Requirements:**
- Apple Developer account ($99/year)
- Bundle ID registered in Apple Developer Portal
- App Store Connect app created

**Build takes ~15-20 minutes**

### Build for Android

```bash
eas build --platform android --profile production
```

**Output:** `.aab` file ready for Google Play upload

**Build takes ~10-15 minutes**

---

## 🐛 Troubleshooting

### "Module not found" errors

```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
npm start -- --reset-cache
```

### Gemini API "Invalid API Key"

```bash
# Verify .env file exists
ls -la .env

# Check key format (should start with AIza)
cat .env

# Ensure EXPO_PUBLIC_ prefix
# ❌ GEMINI_API_KEY=xyz
# ✅ EXPO_PUBLIC_GEMINI_API_KEY=xyz

# Restart Expo
npm start
```

### Camera Not Working

**iOS:**
- Settings → Privacy & Security → Camera → Expo Go → Enable
- If in simulator: Camera not supported, use gallery upload

**Android:**
- Settings → Apps → Expo Go → Permissions → Camera → Allow
- Ensure emulator has camera enabled (check AVD settings)

### "Network request failed" on API calls

- Check internet connection
- Verify API key is active in Google AI Studio
- Check API quotas (free tier: 60 requests/minute)
- Disable VPN if active

### Build Fails on EAS

```bash
# Check EAS account status
eas whoami

# Review build logs
eas build:list

# Common fixes:
# 1. Update bundle ID in app.json to unique value
# 2. Ensure package.json has no syntax errors
# 3. Check that all dependencies are compatible
# 4. Clear EAS cache: eas build --clear-cache
```

---

## 📚 Next Steps

1. **Explore the Code**
   - Read `/src` directory structure
   - Review `src/types.ts` for data models
   - Check `src/services/geminiService.ts` for AI logic

2. **Customize the App**
   - Update app name in `app.json`
   - Change colors in component StyleSheets
   - Add new features in `src/screens/`

3. **Add Features**
   - Create new screen in `src/screens/`
   - Add route to `src/navigation/AppNavigator.tsx`
   - Update tab navigator if needed

4. **Deploy**
   - Follow deployment section in main README.md
   - Test on physical devices before submission
   - Review Apple/Google store guidelines

---

## 📞 Need Help?

**Common Resources:**
- Expo Documentation: [docs.expo.dev](https://docs.expo.dev/)
- React Native Docs: [reactnative.dev](https://reactnative.dev/)
- Gemini API Docs: [ai.google.dev](https://ai.google.dev/)
- AdMob Setup: [admob.google.com/support](https://support.google.com/admob/)

**Still stuck?**
- Check GitHub Issues
- Review error logs in terminal
- Search Stack Overflow
- Contact support (update with real contact)

---

**🎉 Congratulations!** You now have BioSync AI running locally. Happy coding!
