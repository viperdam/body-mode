# Body Mode — Judge's Guide
## Bio-Adaptive AI Health Companion powered by Google Gemini 3 Flash

---

## IMPORTANT: Test the Android APK

The Android app is the COMPLETE product with full Gemini 3 integration.
The web version (bodymode.netlify.app) is a UI demo only.

**APK Download:** https://bodymode.netlify.app/body-mode.apk
**GitHub Release:** https://github.com/viperdam/body-mode/releases/tag/v1.0.0
**Source Code:** https://github.com/viperdam/body-mode (278 files, 141,000+ lines)

---

## Installation Steps

1. Download the APK from the link above
2. Enable "Install from unknown sources" when prompted
3. **GRANT ALL PERMISSIONS** — the app needs every permission to function:
   - Camera (food/fridge scanning)
   - Location (context awareness)
   - Activity Recognition (movement detection)
   - Notifications (plan reminders)
   - Health Connect (smartwatch biometrics)
   - Display Over Other Apps (floating overlays)
   - Physical Activity (step counting)

4. Complete the 11-step onboarding — this builds your bio-profile
5. Gemini 3 Flash generates your personalized daily plan

---

## What to Test

### Daily Plan (Gemini 3 Generated)
Your entire day — meals, workouts, hydration, sleep — personalized to YOUR profile.

### Food Scanner (Camera Icon)
Point at any meal. Gemini 3 Flash vision returns:
- Food identification
- Calories, protein, carbs, fat
- 30+ micronutrients (vitamins, minerals)
- Health grade (A-F)
- Personalized advice

### AI Coach (Chat Icon)
Full conversational AI with long context memory.
It knows your medical profile, today's plan, and current bio-state.

### Smart Fridge
Photograph fridge contents → Gemini 3 identifies ingredients → generates recipes filling your nutritional gaps.

### Floating Overlays
Minimize the app. System-level reminders appear over any app with:
- "Yes, I did it!" — confirms plan item
- "I ate something else..." — triggers real-time plan recalculation
- "Snooze" / "Skip" options

### Plan vs Reality (Daily Wrap-Up)
End-of-day comparison: planned vs actual for tasks, calories, hydration, sleep.

---

## Screenshots Included

1. **dashboard.png** — Today's Progress with calories, protein, water, sleep tracking + Neural Battery + Physical Recovery + Stress Level
2. **overlay.png** — Floating system overlay showing "High-Protein Recovery Dinner" with culturally-aware meal suggestion (Yemeni Hawaij seasoning based on user's origin)
3. **food_analysis.png** — Gemini 3 multimodal food scan: "Deep-Fried Platter with Steamed Cauliflower" — full macro breakdown + 30+ micronutrients
4. **daily_wrapup.png** — Plan vs Reality comparison: tasks, calories, hydration, sleep
5. **day_complete.png** — Daily score (4/10) with motivational feedback

---

## Architecture: One API Key, Total Intelligence

Every intelligent feature runs on Google Gemini 3 Flash:
- Daily plan generation
- Real-time plan refinement
- Food photo analysis (multimodal)
- Video meal scanning (multimodal)
- Smart fridge recipe generation (multimodal)
- AI coaching (long context)
- Sleep analysis
- Micronutrient deficiency detection

Model fallback chain: gemini-3-flash-preview → gemini-flash-latest → gemini-flash-lite

---

## Key Innovation: Bio-Context Pipeline

Raw smartwatch data (21 biometric types via Health Connect) → BioEngine → Three scores:
- Neural Battery (mental energy)
- Hormonal Load (stress)
- Physical Fatigue (recovery)

These scores are injected as SAFETY GUARDRAILS into every Gemini 3 prompt,
ensuring the AI never recommends something inappropriate for your current state.

---

## Source Code Structure

```
mobile/src/
├── screens/          # 20 app screens
├── services/         # 80+ service files
│   ├── bioEngine.ts           # BioLoad calculation
│   ├── bioAlgorithms.ts       # 7-day trend analysis
│   ├── bioSnapshotService.ts  # Unified health data
│   ├── healthConnectService.ts # 21 biometric types
│   ├── sleepService.ts        # Auto sleep detection
│   ├── contextEngine.ts       # 5-sensor fusion
│   ├── overlayService.ts      # Android system overlays
│   ├── geminiService.ts       # Gemini 3 with fallback
│   ├── llmQueueService.ts     # 18 job types
│   ├── autoPlanService.ts     # Plan generation triggers
│   └── planRefinementService.ts # Real-time adaptation
├── i18n/translations/ # 13 languages
├── contexts/          # React contexts
└── components/        # Reusable UI components
```

---

Copyright (c) 2025 Body Mode. All Rights Reserved.
