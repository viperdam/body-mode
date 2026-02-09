# i18n 100% Coverage Implementation Plan

## Executive Summary

This document outlines the complete implementation plan to achieve **100% translation coverage** across all **13 languages** in the BioSync mobile app.

### Current Status (UPDATED)
- **Languages Supported**: 13 (ar, de, en, es, fr, hi, ja, ko, nl, pt, sw, tr, zh)
- **Total Translation Keys**: 1,488 per language file (18 new keys added)
- **Key Sync Status**: All 13 files synchronized (same key count)
- **Alert.alert() Compliance**: 94% using t() keys
- **Service Hardcoded Strings**: FIXED (overlay, gemini, llmQueue, cloudSync)

### Completed Work (ALL PHASES DONE)
- [x] Phase 0: Full inventory completed
- [x] Phase 1: Validation script created (`scripts/validate-i18n.js`)
- [x] Phase 2: Sleep quality keys added (`sleep.quality.*`)
- [x] Phase 3: Overlay description keys added (`overlay.description.*`)
- [x] Phase 4: Service error keys added (`errors.llm.*`, `errors.video.*`, `errors.cloud.*`)
- [x] Phase 5: Native overlays & notifications verified (already compliant)
- [x] Phase 6: Language instructions added to all AI prompts
- [x] Phase 7: All 18 new keys translated in all 12 non-English languages
- [x] Phase 8: CI validation script and unit tests created
- [x] Phase 9: npm scripts, documentation, and glossary added
- [x] All 13 language files synced with 1,488 keys each

---

## Phase 0: Full Inventory (COMPLETED)

### Findings Summary

#### A. Hardcoded UI Strings (21 items)

| Location | String | Suggested Key | Priority |
|----------|--------|---------------|----------|
| `sleepSessionService.ts:445-448` | 'fair', 'good', 'excellent', 'poor' | `sleep.quality.*` | HIGH |
| `SleepTrackerScreen.tsx:387-390` | 'excellent', 'good', 'fair', 'poor' | `sleep.quality.*` | HIGH |
| `DashboardScreen.tsx:838` | 'excellent', 'good', 'okay', 'low' | `dashboard.wrapup.tier.*` | HIGH |
| `backgroundHealthService.ts:153` | 'UNKNOWN' | `common.unknown` | MEDIUM |
| `OnboardingScreen.tsx:193` | 'healthy' | `onboarding.medical.status.healthy` | LOW |
| `SettingsScreen.tsx:2119` | 'DEV' | `settings.debug.dev_mode` | LOW |

#### B. Service-Level Hardcoded Strings (52 items)

**Overlay Descriptions** (6 strings) - `overlayService.ts:352-357`:
- 'Time for your scheduled meal. Staying on track!'
- 'Remember to drink water and stay hydrated.'
- 'Time to move! Your workout is scheduled now.'
- 'Wind down time. Get ready for quality sleep.'
- 'Take a short break. Stretch and refresh.'
- 'You have a scheduled reminder.'

**AI/Network Errors** (4 strings):
- 'Request timed out. The AI is taking too long to respond.'
- 'Network error. Check your internet connection and try again.'

**Video/Media Errors** (9 strings):
- 'Video file not found for upload.'
- 'Video is too large to upload. Please record a shorter clip and try again.'
- Various upload and processing error messages

**Cloud Sync Errors** (2 strings):
- 'Account deletion pending. Cloud sync is disabled.'
- 'Offline. Please connect to the internet and try again.'

#### C. Mixed Alert.alert() (5 instances)
- `DashboardScreen.tsx:1274` - `error.message` hardcoded
- `DashboardScreen.tsx:2252` - `detail` hardcoded (AI-generated)
- `FoodAnalyzerScreen.tsx:317` - `errorMessage` hardcoded

---

## Phase 1: Translation Source of Truth

### Tasks

1. **Enforce en.json as canonical** - Already done
2. **Add dev validation script** - Create `scripts/validate-i18n.js`
3. **Add missing keys** to en.json:

```json
{
  "sleep.quality.excellent": "Excellent",
  "sleep.quality.good": "Good",
  "sleep.quality.fair": "Fair",
  "sleep.quality.poor": "Poor",
  "dashboard.wrapup.tier.excellent": "Excellent",
  "dashboard.wrapup.tier.good": "Good",
  "dashboard.wrapup.tier.okay": "Okay",
  "dashboard.wrapup.tier.low": "Low",
  "overlay.description.meal": "Time for your scheduled meal. Staying on track!",
  "overlay.description.hydration": "Remember to drink water and stay hydrated.",
  "overlay.description.workout": "Time to move! Your workout is scheduled now.",
  "overlay.description.sleep": "Wind down time. Get ready for quality sleep.",
  "overlay.description.work_break": "Take a short break. Stretch and refresh.",
  "overlay.description.default": "You have a scheduled reminder.",
  "errors.ai.timeout": "Request timed out. The AI is taking too long to respond.",
  "errors.ai.network": "Network error. Check your internet connection and try again.",
  "errors.video.not_found": "Video file not found for upload.",
  "errors.video.too_large": "Video is too large to upload. Please record a shorter clip and try again.",
  "errors.video.too_large_processing": "Video is too large for processing. Please record a shorter clip (under 15 seconds) or ensure API key is configured.",
  "errors.cloud.deletion_pending": "Account deletion pending. Cloud sync is disabled.",
  "errors.cloud.offline": "Offline. Please connect to the internet and try again."
}
```

### Deliverables
- [ ] `scripts/validate-i18n.js` - Validation script
- [ ] Updated en.json with all missing keys
- [ ] All 13 language files synced

---

## Phase 2: UI Hardcoded Text Removal

### Tier 1: Critical Screens
- [ ] `DashboardScreen.tsx` - Fix wrap-up tier strings
- [ ] `SettingsScreen.tsx` - Fix DEV badge
- [ ] `OnboardingScreen.tsx` - Fix 'healthy' default

### Tier 2: Feature Screens
- [ ] `SleepTrackerScreen.tsx` - Fix quality labels
- [ ] `FoodAnalyzerScreen.tsx` - Fix error message display
- [ ] `SmartFridgeScreen.tsx` - Already compliant
- [ ] `RecipeScreen.tsx` - Already compliant
- [ ] `AICoachScreen.tsx` - Verify compliance

### Implementation Pattern
```typescript
// Before
const quality = score >= 80 ? 'excellent' : score >= 60 ? 'good' : 'fair';

// After
const qualityKey = score >= 80 ? 'excellent' : score >= 60 ? 'good' : 'fair';
const quality = t(`sleep.quality.${qualityKey}`);
```

---

## Phase 3: Alerts and UX Popups

### Tasks
1. Convert raw `error.message` to localized error mapping
2. Create error code → translation key mapping

### Implementation
```typescript
// services/errorService.ts
const ERROR_KEYS: Record<string, string> = {
  'NETWORK_ERROR': 'errors.ai.network',
  'TIMEOUT': 'errors.ai.timeout',
  'VIDEO_TOO_LARGE': 'errors.video.too_large',
  // ... etc
};

export function getLocalizedError(error: Error, t: TFunction): string {
  const key = ERROR_KEYS[error.name] || 'errors.generic';
  return t(key);
}
```

---

## Phase 4: Service-Level Errors

### Files to Update

1. **overlayService.ts** - Replace description strings with i18n.t()
2. **geminiService.ts** - Map errors to translation keys
3. **netlifyGeminiService.ts** - Map errors to translation keys
4. **llmQueueService.ts** - Map errors to translation keys
5. **geminiUploadService.ts** - Map errors to translation keys
6. **cloudSyncService.ts** - Map errors to translation keys

### Already Compliant (No Changes Needed)
- OverlayBridge.ts
- BackgroundBridge.ts
- NotificationBridge.ts
- PermissionManager.ts

---

## Phase 5: Native Overlays & Notifications

### Current Status: COMPLIANT
- Native bridges already use `i18n.t()` for all user-facing strings
- Language sync to native layer via `sleepService.syncCurrentLanguage()`

### Remaining Tasks
- [ ] Verify overlay descriptions in `overlayService.ts` use translation keys
- [ ] Test language switch updates overlays in real-time

---

## Phase 6: Dynamic Content / AI Prompts

### Tasks
1. Update AI prompts to request responses in current language
2. Format units, dates, numbers with locale

### Implementation
```typescript
// In geminiService.ts
const prompt = `
  Language: ${i18n.locale}
  Respond in ${i18n.locale}. Use appropriate cultural context.
  Format numbers using ${i18n.locale} conventions.
`;
```

---

## Phase 7: Translation Content Completion

### Status per Language

| Language | Code | Keys | Status |
|----------|------|------|--------|
| English | en | 1469 | Baseline |
| Arabic | ar | 1469 | Needs RTL QA |
| German | de | 1469 | Review critical flows |
| Spanish | es | 1469 | Review critical flows |
| French | fr | 1469 | Review critical flows |
| Hindi | hi | 1469 | Review |
| Japanese | ja | 1469 | Review |
| Korean | ko | 1469 | Review |
| Dutch | nl | 1469 | Review |
| Portuguese | pt | 1469 | Review |
| Swahili | sw | 1469 | Review |
| Turkish | tr | 1469 | Review |
| Chinese | zh | 1469 | Review |

### Critical Flows to Review
- Auth flow (sign in, sign up, password reset)
- Paywall (premium, subscriptions, legal)
- Permissions (camera, location, notifications)
- Legal (terms, privacy)

---

## Phase 8: QA & Validation

### Automated Checks
```bash
# Build-time check
npm run validate:i18n

# CI integration
- Fail build on missing keys
- Warn on unused keys
```

### Manual QA Flows
- [ ] Switch language → verify all screens update
- [ ] Test alerts in each language
- [ ] Test overlays and notifications
- [ ] RTL layout check (Arabic)

---

## Phase 9: Maintenance

### Guidelines
1. **New strings**: Always add to en.json first, then sync to all languages
2. **Lint rule**: Block commits with hardcoded strings in UI components
3. **Translation checklist**: Required for every PR with UI changes

### Glossary (Consistent Terms)
- "Energy" → Same translation across all contexts
- "Plan" → Daily plan, not generic plan
- "Coach" → AI Coach persona
- Sleep quality terms: excellent, good, fair, poor

---

## Implementation Priority

### Week 1: Foundation
1. Create validation script
2. Add missing keys to en.json
3. Sync all language files

### Week 2: UI Fixes
1. Fix screen hardcoded strings
2. Fix service hardcoded strings
3. Add error mapping

### Week 3: QA
1. Language switch testing
2. RTL testing (Arabic)
3. Critical flow review

---

## Files Reference

### Translation Files
```
mobile/src/i18n/translations/
├── ar.json (Arabic)
├── de.json (German)
├── en.json (English - BASELINE)
├── es.json (Spanish)
├── fr.json (French)
├── hi.json (Hindi)
├── ja.json (Japanese)
├── ko.json (Korean)
├── nl.json (Dutch)
├── pt.json (Portuguese)
├── sw.json (Swahili)
├── tr.json (Turkish)
└── zh.json (Chinese)
```

### Key Files to Modify
```
mobile/src/screens/
├── DashboardScreen.tsx
├── SleepTrackerScreen.tsx
├── OnboardingScreen.tsx
├── SettingsScreen.tsx
└── FoodAnalyzerScreen.tsx

mobile/src/services/
├── overlayService.ts
├── geminiService.ts
├── netlifyGeminiService.ts
├── llmQueueService.ts
├── geminiUploadService.ts
└── cloudSyncService.ts
```
