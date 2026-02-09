# End-to-End Verification Checklist

This checklist validates the full sleep/plan/overlay pipeline on Android and the HealthKit + notification parity on iOS.
Run on a real device. Emulator coverage is not sufficient for overlays, HealthKit, or background fetch.

## Android Verification

1. Permissions
- Enable notifications.
- Enable overlay permission (Draw over apps).
- Enable activity recognition.

2. Sleep Detection (Native)
- Start sleep detection from Settings (Auto Sleep on).
- Trigger a sleep state (screen off + stillness + low light).
- Confirm sleep overlay appears.
- Tap Done -> verify sleep plan item turns green and does not reappear.
- Tap Skip -> verify sleep plan item turns red (skipped) and does not reappear.

3. Wake Confirmation
- Simulate wake (unplug charger in the morning window).
- Confirm wake overlay appears.
- Tap "Didn't sleep" -> verify sleep plan item is uncompleted and no sleep hours are logged.

4. Plan Generation + Dashboard Refresh
- Force a new day (change device date or wait for midnight service).
- Ensure plan generates once, is saved under date key, and dashboard shows correct plan.
- Verify no stale plan carryover when sleep detection fails.

5. Overlay Resync
- Complete/skip a plan item via notification while app is closed.
- Reopen app and confirm overlays do not re-surface for that item.

## iOS Verification (Minimum Parity)

1. HealthKit Permissions
- Enable HealthKit read permissions for Sleep Analysis.
- Ensure healthService initializes without errors.

2. HealthKit Sleep Review
- Sleep data exists in Apple Health (real or manual entry).
- App foreground: background fetch or foreground sync detects new sleep.
- "Sleep review" notification appears with Confirm/Discard actions.

3. Confirm/Discard Flow
- Confirm -> draft resolves into a sleep session, sleep hours update, plan triggers for the day.
- Discard -> draft is removed and no sleep hours are logged.

4. Plan + Dashboard
- After confirm, plan updates and dashboard reflects sleep progress.
- No duplicate sleep drafts are created for the same HealthKit sample.

## Telemetry / Logs

- Check logcat for Android:
  - SleepWakeDetectionService
  - OverlayScheduler
  - OverlayWindowService
  - SleepEventService

- Check iOS logs (Xcode console):
  - HealthService
  - SleepService
  - SleepEventService

## Regression Guardrails

- Run `npm run type-check` in `mobile`.
- Run `cd mobile/android && ./gradlew assembleDebug`.
- iOS build with HealthKit entitlements enabled.

## Pass Criteria

- Overlays/notifications trigger exactly once per event.
- Sleep drafts can be confirmed or discarded without data corruption.
- Plan generation runs once per day and dashboard always shows the active day.
- No duplicate overlays after ACK (skip/done) and no stale plan carryover.
