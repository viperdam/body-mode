# 🚀 BioSync AI - Deployment Checklist

Complete this checklist before deploying to App Store or Google Play.

---

## 📋 Pre-Deployment

### Environment & Configuration

- [ ] **Update app version** in `app.json`
  - Increment version number (e.g., 1.0.0 → 1.0.1)
  - Increment iOS `buildNumber` and Android `versionCode`

- [ ] **Replace API Keys**
  - [ ] Replace test AdMob IDs with production IDs in `app.json`
  - [ ] Verify Gemini API key has sufficient quota
  - [ ] Test API keys in production environment

- [ ] **Update App Metadata**
  - [ ] App name in `app.json` is finalized
  - [ ] Bundle ID (iOS) is unique and registered
  - [ ] Package name (Android) is unique
  - [ ] App icon is high-resolution (1024x1024 for iOS)
  - [ ] Splash screen is optimized

### Code Quality

- [ ] **Run Validation Script**
  ```bash
  npm run validate
  ```

- [ ] **TypeScript Check**
  ```bash
  npm run type-check
  ```

- [ ] **Run All Tests**
  ```bash
  npm run test:coverage
  ```
  - [ ] All tests pass
  - [ ] Coverage > 70% for critical services

- [ ] **Remove Debug Code**
  - [ ] Remove all `console.log()` statements
  - [ ] Remove test data/mocks
  - [ ] Disable developer menus

### Testing

- [ ] **Test on Real Devices**
  - [ ] iOS physical device (iPhone)
  - [ ] Android physical device (phone/tablet)
  - [ ] Different screen sizes (small, medium, large)

- [ ] **Feature Testing**
  - [ ] Complete onboarding flow
  - [ ] Food scanner with real food
  - [ ] AI Coach responses
  - [ ] Sleep tracker accuracy
  - [ ] Data export/import
  - [ ] Language switching
  - [ ] AdMob rewarded ads (if using production IDs)

- [ ] **Permission Testing**
  - [ ] Camera permission request works
  - [ ] Location permission request works
  - [ ] Notification permission request works
  - [ ] Permission denial handled gracefully

- [ ] **Performance Testing**
  - [ ] App launches in < 3 seconds
  - [ ] No memory leaks
  - [ ] Smooth scrolling on all screens
  - [ ] Image loading optimized

---

## 🍎 iOS Deployment

### Apple Developer Setup

- [ ] **Apple Developer Account**
  - [ ] Paid membership active ($99/year)
  - [ ] Team ID available

- [ ] **App Store Connect**
  - [ ] App created in App Store Connect
  - [ ] Bundle ID matches app.json
  - [ ] Certificates and provisioning profiles created

### Build Configuration

- [ ] **Update iOS Settings in app.json**
  ```json
  {
    "ios": {
      "bundleIdentifier": "com.viperdam.bodymode",
      "buildNumber": "1",
      "supportsTablet": true,
      "icon": "./assets/icon.png"
    }
  }
  ```

- [ ] **Privacy Descriptions** (required for App Review)
  - [ ] NSCameraUsageDescription is clear and specific
  - [ ] NSLocationWhenInUseUsageDescription explains why
  - [ ] NSMotionUsageDescription for sleep tracking
  - [ ] NSPhotoLibraryUsageDescription for gallery access

### Build & Submit

- [ ] **Create Production Build**
  ```bash
  eas build --platform ios --profile production
  ```

- [ ] **Download .ipa file** from EAS dashboard

- [ ] **Upload to App Store Connect**
  - [ ] Use Transporter app or `eas submit`
  - [ ] Wait for processing (10-30 minutes)

- [ ] **App Store Metadata**
  - [ ] App name (max 30 characters)
  - [ ] Subtitle (max 30 characters)
  - [ ] Description (max 4000 characters)
  - [ ] Keywords (max 100 characters)
  - [ ] Screenshots (required sizes):
    - [ ] 6.7" (iPhone 15 Pro Max): 1290x2796
    - [ ] 6.5" (iPhone 11 Pro Max): 1242x2688
    - [ ] 5.5" (iPhone 8 Plus): 1242x2208
  - [ ] Privacy policy URL (required for health apps)
  - [ ] Support URL
  - [ ] Marketing URL (optional)

- [ ] **App Review Information**
  - [ ] Demo account credentials (if needed)
  - [ ] Test instructions for reviewers
  - [ ] Explanation of health data usage

- [ ] **Submit for Review**
  - Review time: 1-3 days typically

---

## 🤖 Android Deployment

### Google Play Console Setup

- [ ] **Google Play Developer Account**
  - [ ] One-time $25 fee paid
  - [ ] Account active

- [ ] **Create App in Play Console**
  - [ ] App created
  - [ ] Package name matches app.json

### Build Configuration

- [ ] **Update Android Settings in app.json**
  ```json
  {
    "android": {
      "package": "com.viperdam.bodymode",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#020617"
      }
    }
  }
  ```

### Build & Submit

- [ ] **Create Production Build**
  ```bash
  eas build --platform android --profile production
  ```

- [ ] **Download .aab file** from EAS dashboard

- [ ] **Upload to Google Play Console**
  - [ ] Create new release in Production track
  - [ ] Upload .aab file
  - [ ] Wait for processing (5-10 minutes)

- [ ] **Store Listing**
  - [ ] App name (max 50 characters)
  - [ ] Short description (max 80 characters)
  - [ ] Full description (max 4000 characters)
  - [ ] Screenshots (required):
    - [ ] Phone: 16:9 or 9:16, 320-3840px
    - [ ] Tablet (optional): 1200x1920 min
    - [ ] Feature graphic: 1024x500
  - [ ] App icon: 512x512 (32-bit PNG)
  - [ ] Privacy policy URL (required for health apps)
  - [ ] Developer contact email

- [ ] **Content Rating**
  - [ ] Complete questionnaire
  - [ ] Submit for rating

- [ ] **Pricing & Distribution**
  - [ ] Free or Paid selected
  - [ ] Countries selected
  - [ ] Compliance checkboxes completed

- [ ] **App Content**
  - [ ] Declare app category (Health & Fitness)
  - [ ] Declare target audience
  - [ ] Declare if ads are present (Yes, if using AdMob)

- [ ] **Submit for Review**
  - Review time: Few hours to 1-2 days

---

## 🔒 Security & Privacy

- [ ] **Privacy Policy**
  - [ ] Created and hosted publicly
  - [ ] Covers data collection (health data, location, camera)
  - [ ] Explains AI usage (Gemini API)
  - [ ] Covers third-party services (AdMob, weather API)
  - [ ] GDPR compliant (if targeting EU)
  - [ ] COPPA compliant (if users < 13)

- [ ] **Data Handling**
  - [ ] All sensitive data stored securely (SecureStore)
  - [ ] No health data sent to third parties without consent
  - [ ] API keys not exposed in client code
  - [ ] HTTPS for all network requests

- [ ] **App Store Privacy Labels**
  - [ ] iOS: Complete in App Store Connect
  - [ ] Android: Complete Data Safety form

---

## 💰 Monetization (If Using Ads)

- [ ] **AdMob Production Setup**
  - [ ] AdMob account approved
  - [ ] App registered in AdMob console
  - [ ] Rewarded ad unit created
  - [ ] Test on real devices with production IDs

- [ ] **App Store Compliance**
  - [ ] iOS: Declare ads in App Privacy section
  - [ ] Android: Declare in Data Safety section

---

## 📊 Analytics & Monitoring

- [ ] **Error Tracking** (Optional but Recommended)
  - [ ] Sentry or similar service integrated
  - [ ] Test error reporting

- [ ] **Analytics** (Optional)
  - [ ] Firebase Analytics or similar
  - [ ] Track key events (onboarding completion, food scans)

---

## 🎉 Post-Deployment

- [ ] **Monitor Reviews**
  - Check App Store and Google Play daily for first week

- [ ] **Track Metrics**
  - [ ] Download numbers
  - [ ] Crash rate (< 1%)
  - [ ] User retention

- [ ] **Prepare for Updates**
  - [ ] Set up CI/CD pipeline
  - [ ] Plan feature roadmap

---

## 🆘 Common Rejection Reasons

### Apple App Store
- Missing privacy policy
- Unclear permission descriptions
- App crashes during review
- Missing demo account for reviewers
- Misleading screenshots or description
- Health claims not supported by app features

### Google Play
- Low-quality screenshots
- Incomplete content rating questionnaire
- Privacy policy missing or not linked
- App crashes or doesn't function
- Deceptive ads or functionality
- Health-related claims require verification

---

## 📞 Support Resources

- **App Store Connect**: [appstoreconnect.apple.com](https://appstoreconnect.apple.com/)
- **Google Play Console**: [play.google.com/console](https://play.google.com/console/)
- **EAS Build**: [docs.expo.dev/build/introduction](https://docs.expo.dev/build/introduction/)
- **App Review Guidelines**:
  - iOS: [developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/)
  - Android: [play.google.com/about/developer-content-policy](https://play.google.com/about/developer-content-policy/)

---

**Good luck with your deployment! 🚀**
