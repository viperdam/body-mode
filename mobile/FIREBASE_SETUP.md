# Firebase Setup (Auth + Firestore + Analytics + Crashlytics)

This is the end-to-end checklist to finish Firebase for iOS and Android.

## 1) Console setup
1. Open Firebase Console and select your project.
2. Enable products:
   - Analytics
   - Crashlytics
   - Authentication (Anonymous + Email/Password)
   - Firestore
3. Optional: Enable **Google** provider in Firebase Auth if you want Google sign-in.

## 2) Firestore rules
Deploy rules from this repo:
```
cd mobile
firebase deploy --only firestore:rules
```

Rules file: `mobile/firestore.rules`

## 3) Verify config files
These must exist (already wired):
- `mobile/google-services.json`
- `mobile/GoogleService-Info.plist`
- `mobile/android/app/google-services.json`

## 4) Build native apps
Expo Go does not load native Firebase modules. Use the native projects:
```
cd mobile
npx expo run:android
npx expo run:ios
```
Note: Do not run `npx expo prebuild --clean` in this repo. It will overwrite custom native code in `android/` (and `ios/` if present). iOS builds require macOS.

## 5) Validate in Firebase Console
1. Analytics: confirm `app_open` within 24 hours.
2. Crashlytics: trigger a test crash (dev only) from Settings -> Developer -> Crashlytics test crash.
3. Firestore: confirm `users/{uid}` document exists after onboarding.

## 6) Optional: Auth UI
Auth UI is available in Settings -> Account -> Sign-in. Ensure Email/Password is enabled in Firebase Auth.
For Google sign-in, add the Web Client ID to `.env`:
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_google_web_client_id_here
```
Use the **OAuth 2.0 Web Client ID** from your Firebase project (see `google-services.json`, `client_type: 3`).
For Android, ensure your app SHA-1/SHA-256 fingerprints are registered in Firebase project settings.
For iOS Google sign-in, ensure `GoogleService-Info.plist` includes `REVERSED_CLIENT_ID` and add it to your URL types.

## 7) Cloud backup data model
Firestore collections written by the app:
- `users/{uid}` (profile metadata)
- `users/{uid}.settings.preferences` (synced app preferences)
- `users/{uid}/plans/{YYYY-MM-DD}` (daily plans)
- `users/{uid}/wrapups/{YYYY-MM-DD}` (daily wrap ups)
- `users/{uid}/logs/{type}/months/{YYYY-MM}` (logs grouped by month)

## 8) Cloud restore flow
Restore is available in **Settings -> Data -> Restore Backup**.
- Default behavior: merge cloud data into local storage.
- Requires network access and an authenticated Firebase user.
- Recommended flow on new device: sign in, then Restore Backup.
On account switch, the app will prompt you to merge or replace local data with cloud data.
