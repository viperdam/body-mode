# 🚀 Android Studio Build Guide - READY TO GO!

## ✅ COMPLETED STEPS:

✅ **Step 1:** Navigated to mobile folder
✅ **Step 2:** Native Android project created at `C:\Users\AMors\Desktop\body mode\mobile\android`

**Notification icon created:** ✅
**Android project structure:** ✅ Complete
**Gradle files:** ✅ Ready

---

## 📱 NEXT STEPS (Manual):

### **Step 3: Open in Android Studio**

1. **Launch Android Studio**
   - Open Android Studio application

2. **Open Project**
   - Click **"Open"** or **File → Open**
   - Navigate to: `C:\Users\AMors\Desktop\body mode\mobile\android`
   - Click **OK**

3. **Wait for Gradle Sync**
   - First time takes 2-5 minutes
   - You'll see progress at bottom of Android Studio
   - Wait until it says "Gradle sync finished"

---

### **Step 4: Prepare Your Device**

**Option A: Use Your Android Phone (Recommended)**

1. **Enable Developer Options:**
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times
   - Developer Options unlocked!

2. **Enable USB Debugging:**
   - Go to Settings → Developer Options
   - Turn on **USB Debugging**

3. **Connect Phone:**
   - Connect phone to computer with USB cable
   - On phone, allow USB debugging when prompted
   - Select "File Transfer" or "PTP" mode

4. **Verify Connection:**
   - In Android Studio, you should see your device name in the device dropdown (top toolbar)

**Option B: Use Android Emulator**

1. In Android Studio, click **Device Manager** (phone icon in toolbar)
2. Click **Create Device**
3. Select a phone (e.g., Pixel 6)
4. Download a system image (e.g., API 33 - Android 13)
5. Click **Finish**
6. Click **Play** button to start emulator

---

### **Step 5: Build and Run**

1. **Select Device:**
   - Top toolbar → Device dropdown
   - Select your phone or emulator

2. **Click Run:**
   - Click the **green play button** (▶) in toolbar
   - Or press **Shift + F10**

3. **Wait for Build:**
   - First build: 3-5 minutes
   - App will install on your phone/emulator automatically
   - App opens automatically when done

---

### **Step 6: Start Metro Bundler**

**IMPORTANT:** Open a **NEW terminal window** and run:

```bash
cd "C:\Users\AMors\Desktop\body mode\mobile"
npx expo start --dev-client
```

**What this does:**
- Starts the development server
- Enables live reload
- Shows console logs

**You should see:**
```
Metro waiting on exp://192.168.x.x:8081
```

**In the app on your phone:**
- App will connect to Metro automatically
- You'll see the Welcome screen
- Changes you make to code will reload automatically

---

## 🎮 **Testing Your App**

Once the app is running:

1. ✅ Complete onboarding (8 steps)
2. ✅ Test camera (Food Scanner)
3. ✅ Test AI analysis
4. ✅ Navigate between tabs
5. ✅ Test sleep tracker
6. ✅ Chat with AI Coach
7. ✅ Change language in Settings
8. ✅ Test data export

**To reload app:** Shake your phone and tap "Reload"

---

## 🐛 **Troubleshooting**

### "Could not find Android SDK"

**Fix:** Set ANDROID_HOME environment variable:
```
ANDROID_HOME = C:\Users\AMors\AppData\Local\Android\Sdk
```

### "Gradle build failed"

**Fix:** Clean and rebuild:
```bash
cd "C:\Users\AMors\Desktop\body mode\mobile\android"
./gradlew clean
./gradlew build
```

### "Device not detected"

**Fix:**
- Make sure USB debugging is enabled
- Try different USB cable
- Try different USB port
- In Android Studio: Run → Edit Configurations → Check "Install Flags"

### "App crashes immediately"

**Fix:** Make sure Metro bundler is running:
```bash
npx expo start --dev-client
```

### "Cannot connect to Metro"

**Fix:**
- Check both devices on same WiFi
- Restart Metro: `Ctrl+C` then `npx expo start --dev-client`
- In app: Shake phone → Dev Settings → Change Bundle Location

---

## 📊 **What You'll See**

### Android Studio:
- Gradle sync progress
- Build output window
- Logcat (console logs)
- Device selector

### Your Phone:
- App installing...
- Welcome screen appears
- Onboarding starts

### Terminal (Metro):
- "Metro waiting on..."
- File changes logged
- API calls logged

---

## ✅ **Success Checklist**

- [ ] Android Studio opened successfully
- [ ] Gradle sync completed without errors
- [ ] Device/emulator detected
- [ ] App installed on device
- [ ] Metro bundler running in terminal
- [ ] App opens on phone
- [ ] Welcome screen visible
- [ ] Can navigate through app

---

## 🎯 **Current Status**

✅ Native Android project created
✅ All dependencies configured
✅ Notification icon fixed
✅ Project structure verified

**YOU ARE HERE** → Open Android Studio and click Run!

---

## 📞 **Quick Commands Reference**

```bash
# Start Metro bundler
cd "C:\Users\AMors\Desktop\body mode\mobile"
npx expo start --dev-client

# Clean and rebuild (if issues)
cd android
./gradlew clean
cd ..
npx expo prebuild --clean

# Check connected devices
adb devices

# View logs
adb logcat

# Reinstall app
cd android
./gradlew installDebug
```

---

**Ready to go! Open Android Studio now and follow Step 3!** 🚀
