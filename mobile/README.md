# BioSync AI - Mobile App

**AI-Powered Health & Metabolism Tracker for iOS and Android**

BioSync AI is a comprehensive health tracking application that uses Google Gemini AI to provide personalized nutrition analysis, sleep tracking, activity monitoring, and intelligent health recommendations.

---

## 📱 Features

### Core Functionality
- 🍔 **AI-Powered Food Analysis** - Camera-based food scanning with macro calculation
- 💬 **AI Health Coach** - Conversational AI for health guidance
- 😴 **Sleep Tracker** - Accelerometer-based sleep quality monitoring
- 📊 **Dashboard** - Centralized view of calories, activities, and daily plans
- 👤 **Profile Management** - Track weight, mood, and health metrics
- 🥗 **Smart Fridge** - Scan your fridge and get AI-generated recipes
- ⚙️ **Settings** - Data export/import, language selection (13 languages)

### Advanced Features
- 🎯 **Daily Plan Generation** - AI creates personalized daily health plans
- ⚡ **Neural Battery System** - Tracks mental/physical energy with AI
- 🔔 **Smart Notifications** - Context-aware reminders (suppresses during driving/sleeping)
- 🌍 **Multi-Language Support** - 13 languages including RTL support for Arabic
- 💾 **Data Export/Import** - Full backup and restore via JSON
- 🎁 **Energy & Monetization** - AdMob rewarded ads for energy recharge

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and **npm** 8+
- **Expo CLI**: `npm install -g expo-cli`
- **Expo Go** app (for testing) or **EAS CLI** for building
- **macOS** with **Xcode** (for iOS development)
- **Android Studio** (for Android development)

### Installation

```bash
# Navigate to mobile directory
cd mobile

# Install dependencies
npm install

# Start development server
npm start

# Run on iOS Simulator (macOS only)
npm run ios

# Run on Android Emulator
npm run android

# Run in web browser (for testing)
npm run web
```

### Environment Setup

Create a `.env` file in the `mobile/` directory:

```env
# Google Gemini AI API Key (required)
EXPO_PUBLIC_GEMINI_API_KEY=your_api_key_here

# Optional: Replace test AdMob IDs with real ones
# EXPO_PUBLIC_ADMOB_IOS_REWARDED=ca-app-pub-xxxxx/yyyyy
# EXPO_PUBLIC_ADMOB_ANDROID_REWARDED=ca-app-pub-xxxxx/yyyyy
```

**Get Gemini API Key:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add to `.env` file

---

## 📂 Project Structure

```
mobile/
├── App.tsx                      # App entry point
├── app.json                     # Expo configuration
├── package.json                 # Dependencies
├── jest.config.js               # Test configuration
├── tsconfig.json                # TypeScript configuration
│
├── src/
│   ├── components/              # Reusable UI components
│   │   ├── ActionModal.tsx      # Multi-purpose modal (reminders, logging)
│   │   ├── AdOverlay.tsx        # AdMob rewarded video integration
│   │   ├── BatteryWidget.tsx    # Neural energy display
│   │   ├── ContextStatus.tsx    # User context indicator
│   │   ├── DailyWrapUpModal.tsx # End-of-day summary
│   │   └── PermissionModal.tsx  # Permission request UI
│   │
│   ├── screens/                 # Main app screens
│   │   ├── WelcomeScreen.tsx        # Splash screen
│   │   ├── OnboardingScreen.tsx     # 8-step user registration
│   │   ├── DashboardScreen.tsx      # Main hub
│   │   ├── FoodAnalyzerScreen.tsx   # Camera food scanner
│   │   ├── AICoachScreen.tsx        # Chat with AI
│   │   ├── ProfileScreen.tsx        # User profile & stats
│   │   ├── SettingsScreen.tsx       # App settings
│   │   ├── SleepTrackerScreen.tsx   # Sleep monitoring
│   │   └── SmartFridgeScreen.tsx    # Fridge scanner & recipes
│   │
│   ├── navigation/              # React Navigation setup
│   │   ├── AppNavigator.tsx     # Main stack navigator
│   │   └── TabNavigator.tsx     # Bottom tab navigator
│   │
│   ├── services/                # Business logic services
│   │   ├── geminiService.ts     # Google Gemini AI integration
│   │   ├── bioEngine.ts         # Health calculations (battery, deficiencies)
│   │   ├── contextService.ts    # GPS + motion context detection
│   │   ├── notificationService.ts # Push notifications (Expo)
│   │   ├── weatherService.ts    # Weather API integration
│   │   ├── storageService.ts    # AsyncStorage wrapper
│   │   ├── secureStorageService.ts # Secure storage for sensitive data
│   │   ├── offlineService.ts    # Offline data queueing
│   │   └── speechRecognitionService.ts # Voice input (mock)
│   │
│   ├── contexts/                # React Context providers
│   │   ├── EnergyContext.tsx    # Energy/monetization state
│   │   └── LanguageContext.tsx  # i18n & translation (13 languages)
│   │
│   ├── utils/                   # Helper functions
│   │   └── dateUtils.ts         # Date formatting
│   │
│   ├── prompts/                 # AI prompt templates
│   │   └── aiPrompts.ts         # Gemini prompt configurations
│   │
│   └── types.ts                 # TypeScript type definitions
│
├── assets/                      # Images, icons, fonts
└── __tests__/                   # Test files
```

---

## 🛠️ Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Code Quality

```bash
# TypeScript type checking
npx tsc --noEmit

# Linting (if configured)
npx eslint src/
```

### Debugging

- **Metro Bundler**: Logs appear in terminal where `npm start` is running
- **React Native Debugger**: Use Chrome DevTools or standalone app
- **Expo DevTools**: Press `m` in terminal to open menu
- **Console Logs**: Check terminal or `console.log()` output in Expo Go

---

## 📦 Building for Production

### Using EAS Build (Recommended)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Configure project
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Build for both
eas build --platform all
```

### Build Profiles

Create `eas.json` in mobile root:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "ios": {
        "bundleIdentifier": "com.viperdam.bodymode"
      },
      "android": {
        "package": "com.viperdam.bodymode"
      }
    }
  }
}
```

---

## 🔐 Permissions Required

### iOS (Info.plist)
- **Camera**: Food scanning and fridge analysis
- **Microphone**: Voice input (future feature)
- **Motion & Fitness**: Sleep tracking with accelerometer
- **Location (When In Use)**: Weather and context detection
- **Photo Library**: Upload food photos from gallery

### Android (AndroidManifest.xml)
- `CAMERA`
- `RECORD_AUDIO`
- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`
- `VIBRATE`
- `POST_NOTIFICATIONS`
- `READ_EXTERNAL_STORAGE`
- `WRITE_EXTERNAL_STORAGE`

All permissions are requested at runtime with clear explanations.

---

## 🌍 Internationalization (i18n)

Supported languages:
1. **English** (en)
2. **Arabic** (ar) - RTL support
3. **French** (fr)
4. **Spanish** (es)
5. **Hindi** (hi)
6. **German** (de)
7. **Dutch** (nl)
8. **Chinese** (zh)
9. **Japanese** (ja)
10. **Korean** (ko)
11. **Turkish** (tr)
12. **Swahili** (sw)
13. **Portuguese** (pt)

Language can be changed in **Settings → Language**.

---

## 💰 Monetization (AdMob Integration)

The app uses **Google AdMob** rewarded video ads to recharge the "neural battery" (energy system).

### Test Mode (Current)
- **iOS Test Ad ID**: `ca-app-pub-3940256099942544~1458002511`
- **Android Test Ad ID**: `ca-app-pub-3940256099942544~3347511713`

### Production Setup
1. Create AdMob account at [admob.google.com](https://admob.google.com)
2. Create an app in AdMob console
3. Create a Rewarded Ad unit
4. Replace test IDs in `app.json` plugins section:

```json
[
  "react-native-google-mobile-ads",
  {
    "androidAppId": "ca-app-pub-YOUR_ID~YOUR_APP_ID",
    "iosAppId": "ca-app-pub-YOUR_ID~YOUR_APP_ID"
  }
]
```

---

## 🧪 Testing Strategy

### Unit Tests
- **Storage Service**: AsyncStorage CRUD operations
- **BioEngine**: Neural battery, vitamin deficiency detection
- **Energy Context**: Energy consumption, recharge logic

### Integration Tests
- Component rendering
- Navigation flows
- API integrations

### E2E Testing (Manual)
1. **Onboarding Flow**: Complete all 8 steps
2. **Food Analysis**: Scan food with camera, verify macros
3. **Sleep Tracker**: Start session, simulate motion, verify results
4. **AI Coach**: Send messages, verify responses
5. **Data Export/Import**: Export JSON, clear data, import, verify restoration

---

## 🐛 Troubleshooting

### Common Issues

**"Invariant Violation: requireNativeComponent: TabNavigator" was not found**
- Solution: Clear cache `npm start -- --reset-cache`

**AdMob ads not showing**
- Check internet connection
- Verify AdMob account is active
- Test IDs should work immediately; real IDs need approval (~1 hour)

**Gemini API errors**
- Verify API key in `.env` file
- Check API quota at [Google AI Studio](https://makersuite.google.com/)
- Ensure EXPO_PUBLIC_ prefix for environment variables

**Camera not working**
- Check camera permissions in device settings
- Ensure `expo-camera` is installed
- Try restarting Expo Go app

**Build errors on EAS**
- Check `eas.json` configuration
- Verify bundle IDs match Apple/Google Play accounts
- Review build logs in Expo dashboard

---

## 📝 API Keys & Credentials

### Required
- **Google Gemini API**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)

### Optional
- **AdMob**: For production ads (test IDs work for development)
- **Expo Push Notifications**: Automatic with Expo account

---

## 🔄 Data Management

### Export Data
1. Open **Settings**
2. Tap **Export Data**
3. Share JSON file or copy to clipboard

### Import Data
1. Copy JSON export to clipboard
2. Open **Settings**
3. Tap **Import Data**
4. Confirm import

### Storage Structure
All data stored in AsyncStorage with keys:
- `@biosync_user` - User profile
- `@biosync_food` - Food logs
- `@biosync_mood` - Mood logs
- `@biosync_weight` - Weight history
- `@biosync_activity` - Activity logs
- `@biosync_daily_plan` - AI-generated plans
- `@biosync_sleep_history` - Sleep sessions
- `@biosync_water` - Water intake
- `@biosync_saved_meals` - Favorite meals

---

## 🚢 Deployment

### App Store (iOS)
1. Build with EAS: `eas build --platform ios`
2. Download `.ipa` file
3. Upload to App Store Connect via Transporter
4. Configure app metadata, screenshots, privacy policy
5. Submit for review

### Google Play (Android)
1. Build with EAS: `eas build --platform android`
2. Download `.aab` file
3. Upload to Google Play Console
4. Configure store listing, screenshots, content rating
5. Submit for review

### Pre-Submission Checklist
- [ ] Update version in `app.json`
- [ ] Test on real devices (iOS & Android)
- [ ] Verify all permissions have usage descriptions
- [ ] Replace test AdMob IDs with production IDs
- [ ] Add privacy policy URL
- [ ] Create app store screenshots (required sizes)
- [ ] Write app description and keywords

---

## 🤝 Contributing

### Development Workflow
1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and test thoroughly
3. Write tests for new functionality
4. Run `npm test` to ensure all tests pass
5. Commit with clear message: `git commit -m "Add feature X"`
6. Push and create pull request

### Code Style
- Use TypeScript for type safety
- Follow React Native best practices
- Use functional components with hooks
- Write clear, descriptive variable names
- Add comments for complex logic

---

## 📄 License

Proprietary - All rights reserved

---

## 📞 Support

For issues, questions, or feature requests:
- **GitHub Issues**: [Create an issue](https://github.com/your-repo/issues)
- **Email**: support@biosyncai.com (update with real email)

---

## 🙏 Acknowledgments

- **Google Gemini AI** for food analysis and health coaching
- **Expo** for React Native development tools
- **React Navigation** for navigation architecture
- **Open-Meteo** for weather data
- **BigDataCloud** for geocoding services

---

**Built with ❤️ using React Native and Expo**
