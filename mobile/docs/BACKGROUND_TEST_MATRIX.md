# Background System Manual Test Matrix

## Pre-Test Setup
1. Install debug APK
2. Grant all permissions (Notifications, Overlay, Exact Alarms)
3. Complete onboarding with a plan
4. Ensure battery is not critically low

---

## Phase 2: Single Scheduler Tests

### Test 2.1: Plan Sync to TxStore
- [ ] Open app and verify plan exists
- [ ] Check Logcat for `[TxStore] Synced plan for date: YYYY-MM-DD`
- [ ] Kill app, reopen, verify plan still loads

### Test 2.2: Alarm Scheduling
- [ ] Add a plan item for 2 minutes from now
- [ ] Verify overlay appears at scheduled time
- [ ] Check Logcat for `[ReconcileWorker] Scheduled overlay: ...`

### Test 2.3: Idempotent Reconciliation
- [ ] Trigger reconcile multiple times (force stop and reopen)
- [ ] Verify no duplicate alarms are scheduled
- [ ] Check alarm count in Background Health screen

### Test 2.4: Periodic Reconciliation
- [ ] Wait 3 hours or manually trigger via adb
- [ ] Verify alarms are still scheduled correctly
- [ ] Check Logcat for periodic reconcile execution

---

## Phase 3: Action Processing Tests

### Test 3.1: Complete Action via Overlay
- [ ] Wait for overlay to appear
- [ ] Tap "Done" button
- [ ] Verify item is marked complete in Dashboard
- [ ] Verify overlay dismisses
- [ ] Check Logcat for `Inserted action to TxStore`

### Test 3.2: Skip Action via Overlay
- [ ] Wait for overlay to appear
- [ ] Tap "Skip" button
- [ ] Verify item is marked skipped in Dashboard
- [ ] Check Logcat for idempotent processing

### Test 3.3: Snooze Action via Overlay
- [ ] Wait for overlay to appear
- [ ] Tap "Snooze" button
- [ ] Verify item snooze time is updated
- [ ] Verify overlay re-appears after snooze interval

### Test 3.4: Exactly-Once Processing
- [ ] Rapidly tap header (simulate double-tap)
- [ ] Verify action is only processed once
- [ ] Check Logcat for `Action already exists (idempotent)`

### Test 3.5: Action Recovery After Kill
- [ ] When overlay appears, kill app immediately
- [ ] Reopen app
- [ ] Verify Dashboard shows correct state (action was processed)

---

## Phase 4: Resource Safety Tests

### Test 4.1: VoIP Detection
- [ ] Start a VoIP call (WhatsApp, Zoom, etc.)
- [ ] Trigger an alarm time
- [ ] Verify alarm audio does NOT interrupt call
- [ ] Check Logcat for `Cannot play alarm: VoIP/communication mode`

### Test 4.2: Phone Call Detection
- [ ] Make a regular phone call
- [ ] Trigger an alarm time during call
- [ ] Verify alarm does NOT interrupt call
- [ ] End call and verify alarm plays if still within window

### Test 4.3: Audio Focus Release
- [ ] Trigger alarm
- [ ] Let it play for a few seconds
- [ ] Dismiss overlay
- [ ] Verify audio focus is properly released
- [ ] Test music app - should resume without issues

---

## Phase 5: Background Mode Tests

### Test 5.1: FULL Mode
- [ ] Set mode to FULL in Background Health
- [ ] Verify overlays appear
- [ ] Verify sleep detection works
- [ ] Verify all notifications work

### Test 5.2: LIGHT Mode
- [ ] Set mode to LIGHT in Background Health
- [ ] Verify overlays do NOT appear
- [ ] Verify notifications still appear
- [ ] Verify sleep detection is disabled

### Test 5.3: OFF Mode
- [ ] Set mode to OFF in Background Health
- [ ] Verify no overlays appear
- [ ] Verify no notifications appear
- [ ] Verify no background activity in Logcat

### Test 5.4: Emergency Stop
- [ ] Enable FULL mode
- [ ] Tap Emergency Stop
- [ ] Verify mode changes to OFF
- [ ] Verify all background work is cancelled
- [ ] Check Logcat for `EMERGENCY STOP complete`

---

## Phase 6: Hardening Tests

### Test 6.1: Timezone Change
- [ ] Schedule alarms for future times
- [ ] Change device timezone
- [ ] Verify alarms are rescheduled correctly
- [ ] Check Logcat for `Timezone changed to: ...`

### Test 6.2: DST Transition (if applicable)
- [ ] Set device date near DST boundary
- [ ] Schedule alarms across transition
- [ ] Change to DST time
- [ ] Verify alarm times are correct

### Test 6.3: Device Reboot
- [ ] Schedule several alarms
- [ ] Reboot device
- [ ] Verify alarms are restored after boot
- [ ] Check Logcat for `Boot reconciliation initiated`

### Test 6.4: Low Battery Backpressure
- [ ] Drain battery to below 15%
- [ ] Check Background Health for backpressure level
- [ ] Verify non-critical work is delayed
- [ ] Plug in charger and verify normal operation resumes

### Test 6.5: Power Save Mode
- [ ] Enable Power Save Mode
- [ ] Check Background Health for backpressure indication
- [ ] Verify app degrades gracefully
- [ ] Disable Power Save and verify recovery

### Test 6.6: Doze Mode
- [ ] Leave device idle for 30+ minutes
- [ ] Check if alarms still fire (exact alarms should work)
- [ ] Verify reconciliation happens in maintenance windows

---

## Regression Tests

### Test R.1: Fresh Install
- [ ] Uninstall app completely
- [ ] Install debug APK
- [ ] Complete onboarding
- [ ] Verify all features work

### Test R.2: Upgrade from Previous Version
- [ ] Install previous version
- [ ] Create plan and preferences
- [ ] Upgrade to new version
- [ ] Verify data is preserved
- [ ] Verify background features still work

### Test R.3: Long-Running Stability
- [ ] Leave app installed for 24+ hours
- [ ] Interact normally
- [ ] Verify no crashes in Crashlytics
- [ ] Verify alarms continue to fire

---

## Test Sign-Off

| Phase | Tester | Date | Pass/Fail | Notes |
|-------|--------|------|-----------|-------|
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| Regression | | | | |

## Known Issues
- (Document any discovered issues here)
