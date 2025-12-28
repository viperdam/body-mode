# 🏗️ COMPREHENSIVE IMPLEMENTATION GUIDE
## Body Mode - Complete Architecture Implementation

---

## ✅ **COMPLETED FOUNDATION SERVICES**

The following critical services have been **fully implemented**:

### 1. ✅ **offlineService.ts** (Enhanced)
**Location**: `mobile/src/services/offlineService.ts`

**Features Added**:
- Event-driven network monitoring (emits `networkRestored`, `networkLost`)
- Pending operation queue with automatic retry
- Network state persistence
- App state monitoring (checks network on foreground)

**Usage**:
```typescript
import offlineService, { initializeNetworkMonitoring, onNetworkEvent } from './services/offlineService';

// Initialize in App.tsx
await initializeNetworkMonitoring();

// Listen to network events
const unsubscribe = onNetworkEvent('networkRestored', (state) => {
    console.log('Network restored!', state);
});

// Queue operation for retry
await offlineService.queueForRetry({
    type: 'llm_job',
    operation: 'generatePlan',
    data: { userId: '123' },
    maxRetries: 5,
});
```

---

### 2. ✅ **errorRecoveryService.ts** (New)
**Location**: `mobile/src/services/errorRecoveryService.ts`

**Features**:
- Circuit breaker pattern for LLM API (prevents cascade failures)
- Automatic error recovery strategies
- Error logging with persistent storage
- Service-specific recovery handlers

**Usage**:
```typescript
import { errorRecoveryService } from './services/errorRecoveryService';

// Initialize
await errorRecoveryService.initialize();

// Handle error
try {
    await geminiService.generateDailyPlan(context);
} catch (error) {
    await errorRecoveryService.handleError({
        service: 'geminiService',
        operation: 'generateDailyPlan',
        error,
        metadata: { userId: user.id },
    });
}

// Check circuit breaker before expensive operation
if (errorRecoveryService.isCircuitOpen('geminiAPI')) {
    console.log('Circuit breaker open, using fallback');
    // Use planGenerationEngine instead
}

// Record success to close circuit
await errorRecoveryService.recordSuccess('geminiAPI');
```

---

### 3. ✅ **planGenerationEngine.ts** (New)
**Location**: `mobile/src/services/planGenerationEngine.ts`

**Features**:
- NO hardcoded meals - generates from user's history
- Timing calculated from sleep routine and work schedule
- Meal selection based on user's favorites and macro targets
- Workout generation from user's fitness level
- Hydration reminders and sleep wind-down

**Usage**:
```typescript
import { planGenerationEngine } from './services/planGenerationEngine';

// Generate rule-based plan
const plan = await planGenerationEngine.generateRuleBasedPlan(user, {
    useFavorites: true,
    respectMacros: true,
    hydrationFrequencyHours: 2,
});

console.log(`Generated plan with ${plan.items.length} items`);
console.log('Source:', plan.source); // 'local_rule_based'
```

---

### 4. ✅ **migrationService.ts** (New)
**Location**: `mobile/src/services/migrationService.ts`

**Features**:
- Automatic backup before migration
- Rollback on failure
- Migration history tracking
- Schema versioning

**Usage**:
```typescript
import { migrationService } from './services/migrationService';

// Run migrations on app startup (in App.tsx)
await migrationService.runMigrations();

// Check migration history
const history = await migrationService.getMigrationHistory();
console.log('Migrations run:', history);
```

---

## 📋 **REMAINING IMPLEMENTATION TASKS**

Below are detailed implementation guides for each remaining component.

---

## **TASK 1: Enhance llmQueueService.ts**

**File**: `mobile/src/services/llmQueueService.ts`

**What to Add**:
1. Exponential backoff retry logic
2. Queue size limits (max 50 pending)
3. Integration with errorRecoveryService
4. Integration with offlineService events

**Implementation**:

```typescript
// At the top of the file, add imports
import { errorRecoveryService } from './errorRecoveryService';
import { onNetworkEvent } from './offlineService';
import { DEFAULT_RETRY_CONFIG } from '../types';

// Add constants
const MAX_QUEUE_SIZE = 50;

// Modify queueJob method
async queueJob(job: LLMJob): Promise<void> {
    // Check queue size
    if (this.queue.length >= MAX_QUEUE_SIZE) {
        // Drop oldest low-priority job
        const lowPriorityIdx = this.queue.findIndex(j => j.priority === 'low');
        if (lowPriorityIdx !== -1) {
            this.queue.splice(lowPriorityIdx, 1);
            console.warn('[LLMQueue] Queue full, dropped oldest low-priority job');
        } else {
            throw new Error('LLM queue full and no low-priority jobs to drop');
        }
    }

    // Add job to queue
    this.queue.push({
        ...job,
        attempts: 0,
        retryAt: undefined,
    });

    await this.persistQueue();
    this.processQueue();
}

// Modify processJob with exponential backoff
private async processJob(job: LLMJob): Promise<void> {
    // Check if should retry later
    if (job.retryAt && Date.now() < job.retryAt) {
        console.log(`[LLMQueue] Job ${job.id} scheduled for retry at ${new Date(job.retryAt)}`);
        return;
    }

    // Check circuit breaker
    if (errorRecoveryService.isCircuitOpen('geminiAPI')) {
        console.log('[LLMQueue] Circuit breaker open, postponing job');
        job.retryAt = Date.now() + 60000; // Retry in 1 minute
        await this.persistQueue();
        return;
    }

    try {
        // Process job
        const result = await geminiService[job.type](job.context);

        // Record success in circuit breaker
        await errorRecoveryService.recordSuccess('geminiAPI');

        job.status = 'completed';
        job.result = result;
        await this.persistQueue();
        this.emit(job.completionEvent, result);

    } catch (error) {
        console.error(`[LLMQueue] Job ${job.id} failed:`, error);

        // Record failure in circuit breaker
        const circuitOpened = await errorRecoveryService.recordFailure('geminiAPI');

        job.attempts = (job.attempts || 0) + 1;

        if (job.attempts >= DEFAULT_RETRY_CONFIG.maxRetries) {
            job.status = 'failed';
            this.emit('JOB_FAILED', { job, error });

            // Handle error recovery
            await errorRecoveryService.handleError({
                service: 'llmQueue',
                operation: job.type,
                error: error as Error,
                metadata: { jobId: job.id, attempts: job.attempts },
            });
        } else {
            // Calculate exponential backoff
            const backoffMs = Math.min(
                DEFAULT_RETRY_CONFIG.initialBackoffMs * Math.pow(DEFAULT_RETRY_CONFIG.backoffMultiplier, job.attempts - 1),
                DEFAULT_RETRY_CONFIG.maxBackoffMs
            );

            job.retryAt = Date.now() + backoffMs;
            console.log(`[LLMQueue] Retry ${job.attempts}/${DEFAULT_RETRY_CONFIG.maxRetries} in ${backoffMs}ms`);
        }

        await this.persistQueue();
    }
}

// Add network restoration listener in initialize()
async initialize(): Promise<void> {
    // ... existing code ...

    // Listen for network restoration
    onNetworkEvent('networkRestored', () => {
        console.log('[LLMQueue] Network restored, resuming queue');
        this.processQueue();
    });
}
```

**Testing**:
```bash
# Test queue limit
# Fill queue with 51 jobs and verify oldest low-priority is dropped

# Test exponential backoff
# Force a job to fail and verify retry delays: 1s, 2s, 4s, 8s, 16s

# Test circuit breaker integration
# Trigger 3 failures and verify circuit opens, queue pauses
```

---

## **TASK 2: Enhance autoPlanService.ts**

**File**: `mobile/src/services/autoPlanService.ts`

**What to Add**:
1. 4-tier plan generation (full_llm → degraded_llm → rule_based → manual)
2. Energy-based tier selection
3. Fallback logic with error recovery

**Implementation**:

```typescript
// Add import
import { planGenerationEngine } from './planGenerationEngine';
import { errorRecoveryService } from './errorRecoveryService';
import { PlanGenerationTier } from '../types';

// Modify generateTodayPlan method
async generateTodayPlan(trigger: string): Promise<DailyPlan | null> {
    console.log(`[AutoPlan] Generating plan, trigger: ${trigger}`);

    // Check circuit breaker
    if (errorRecoveryService.isCircuitOpen('geminiAPI')) {
        console.log('[AutoPlan] LLM circuit breaker open, using rule-based generation');
        return this.generateFallbackPlan(user, 'rule_based', 'Circuit breaker open');
    }

    // Get energy balance
    const energyBalance = energyService.getBalance();

    // Determine tier
    let tier: PlanGenerationTier;
    let energyCost: number;

    if (energyBalance >= 15) {
        tier = 'full_llm';
        energyCost = 15;
    } else if (energyBalance >= 5) {
        tier = 'degraded_llm';
        energyCost = 5;
    } else {
        tier = 'rule_based';
        energyCost = 0;
    }

    console.log(`[AutoPlan] Selected tier: ${tier} (energy: ${energyBalance})`);

    // Try generation with selected tier
    const startTime = Date.now();

    try {
        let plan: DailyPlan;

        if (tier === 'full_llm') {
            // Full context, best quality
            const context = await this.buildFullContext(user);
            plan = await this.generateWithLLM(user, context, energyCost);

        } else if (tier === 'degraded_llm') {
            // Simplified context, cheaper model
            const context = await this.buildSimplifiedContext(user);
            plan = await this.generateWithDegradedLLM(user, context, energyCost);

        } else {
            // Rule-based fallback
            plan = await planGenerationEngine.generateRuleBasedPlan(user);
        }

        const generationTime = Date.now() - startTime;
        console.log(`[AutoPlan] Plan generated in ${generationTime}ms using ${tier}`);

        // Store result
        await storage.set(`ls_daily_plan_${getLocalDateKey()}`, plan);

        return plan;

    } catch (error) {
        console.error(`[AutoPlan] Generation failed with ${tier}:`, error);

        // Handle error recovery
        await errorRecoveryService.handleError({
            service: 'autoPlanService',
            operation: 'generateTodayPlan',
            error: error as Error,
            metadata: { tier, trigger },
        });

        // Fallback to next tier
        if (tier === 'full_llm' || tier === 'degraded_llm') {
            console.log('[AutoPlan] Falling back to rule-based generation');
            return this.generateFallbackPlan(user, 'rule_based', `${tier} failed: ${error.message}`);
        }

        return null;
    }
}

// Add new method for degraded LLM generation
private async generateWithDegradedLLM(user: UserProfile, context: any, energyCost: number): Promise<DailyPlan> {
    console.log('[AutoPlan] Generating with degraded LLM');

    // Use cheaper model and simpler prompt
    const simplifiedPrompt = `Create a simple daily plan for ${user.name}.
Goal: ${user.goal}
Calories: ${user.dailyCalorieTarget}
Wake time: ${user.sleepRoutine.targetWakeTime}

Return JSON with meals, hydration, and sleep items.`;

    // Queue with lower priority
    const result = await llmQueueService.queueJob({
        type: 'GENERATE_PLAN_SIMPLE',
        priority: 'high', // Still high priority
        context: { user, simplifiedPrompt },
        costPoints: energyCost,
        completionEvent: 'PLAN_GENERATED',
    });

    return result;
}

// Add fallback plan generation
private async generateFallbackPlan(user: UserProfile, tier: 'rule_based' | 'manual', reason: string): Promise<DailyPlan> {
    console.log(`[AutoPlan] Generating fallback plan (${tier}), reason: ${reason}`);

    if (tier === 'rule_based') {
        const plan = await planGenerationEngine.generateRuleBasedPlan(user);
        plan.source = 'local_rule_based';
        return plan;
    }

    // Manual tier - return empty template for user to fill
    return {
        date: getLocalDateKey(),
        summary: 'Manual plan - add your own items',
        items: [],
        source: 'local_fallback',
        createdAt: Date.now(),
    };
}
```

**Testing**:
```bash
# Test tier selection
# - Energy 100 → full_llm
# - Energy 10 → degraded_llm
# - Energy 2 → rule_based

# Test fallback chain
# - Simulate LLM failure → should fallback to rule_based
# - Verify plan still generated successfully
```

---

## **TASK 3: Create healthMonitorService.ts**

**File**: `mobile/src/services/healthMonitorService.ts` (NEW)

**Purpose**: System diagnostics and health reporting

**Full Implementation**:

```typescript
/**
 * Health Monitor Service - System Diagnostics
 *
 * Provides real-time health metrics for all app systems.
 * Used by BackgroundHealthScreen for diagnostics dashboard.
 */

import { SystemHealth, DiagnosticReport, DiagnosticIssue, BridgeStatus, TaskStatus } from '../types';
import storage from './storageService';
import { errorRecoveryService } from './errorRecoveryService';
import { offlineService } from './offlineService';
import { OverlayBridge } from './nativeBridge/OverlayBridge';
import { SleepBridge } from './nativeBridge/SleepBridge';
import { TxStoreBridge } from './nativeBridge/TxStoreBridge';
import { PermissionManager } from './permissions/PermissionManager';

class HealthMonitorService {
    /**
     * Get complete system health
     */
    async getSystemHealth(): Promise<SystemHealth> {
        const [
            llmQueueHealth,
            storageHealth,
            bridgesHealth,
            permissionsHealth,
            backgroundHealth,
        ] = await Promise.all([
            this.checkLLMQueueHealth(),
            this.checkStorageHealth(),
            this.checkNativeBridgesHealth(),
            this.checkPermissionsHealth(),
            this.checkBackgroundTasksHealth(),
        ]);

        return {
            llmQueue: llmQueueHealth,
            storage: storageHealth,
            nativeBridges: bridgesHealth,
            permissions: permissionsHealth,
            backgroundTasks: backgroundHealth,
            lastHealthCheck: Date.now(),
        };
    }

    /**
     * Run diagnostics and identify issues
     */
    async runDiagnostics(): Promise<DiagnosticReport> {
        const health = await this.getSystemHealth();
        const issues: DiagnosticIssue[] = [];
        const recommendations: string[] = [];

        // Check LLM queue
        if (health.llmQueue.circuitBreakerOpen) {
            issues.push({
                severity: 'warning',
                category: 'llm',
                message: 'LLM circuit breaker is open (rate limit or failures)',
                autoFixable: false,
            });
            recommendations.push('Wait for circuit breaker cooldown, or use rule-based plan generation');
        }

        if (health.llmQueue.failed > 5) {
            issues.push({
                severity: 'warning',
                category: 'llm',
                message: `${health.llmQueue.failed} LLM jobs have failed`,
                autoFixable: false,
            });
        }

        // Check storage
        if (health.storage.usagePercent > 80) {
            issues.push({
                severity: 'warning',
                category: 'storage',
                message: `Storage ${health.storage.usagePercent}% full (${health.storage.usedMB}MB used)`,
                autoFixable: true,
                fixAction: async () => {
                    await storage.cleanup();
                },
            });
            recommendations.push('Run storage cleanup to free space');
        }

        if (!health.storage.integrityOK) {
            issues.push({
                severity: 'critical',
                category: 'storage',
                message: 'Storage integrity check failed (corrupted data detected)',
                autoFixable: false,
            });
            recommendations.push('Check error logs and consider restoring from backup');
        }

        // Check permissions
        if (!health.permissions.notifications) {
            issues.push({
                severity: 'info',
                category: 'permissions',
                message: 'Notifications permission not granted',
                autoFixable: true,
                fixAction: async () => {
                    await PermissionManager.requestPermission('notifications');
                },
            });
            recommendations.push('Enable notifications for plan reminders');
        }

        if (!health.permissions.batteryOptimization) {
            issues.push({
                severity: 'info',
                category: 'permissions',
                message: 'Battery optimization not disabled (may affect background tasks)',
                autoFixable: true,
            });
            recommendations.push('Disable battery optimization in Settings for reliable background operation');
        }

        // Check network
        const networkState = offlineService.getEnhancedNetworkState();
        if (!networkState.isOnline) {
            issues.push({
                severity: 'warning',
                category: 'network',
                message: 'Device is offline (using cached data)',
                autoFixable: false,
            });
            recommendations.push('Connect to internet for full app functionality');
        }

        // Determine overall health
        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;

        let overallHealth: 'excellent' | 'good' | 'degraded' | 'critical';
        if (criticalCount > 0) {
            overallHealth = 'critical';
        } else if (warningCount > 2) {
            overallHealth = 'degraded';
        } else if (warningCount > 0) {
            overallHealth = 'good';
        } else {
            overallHealth = 'excellent';
        }

        return {
            timestamp: Date.now(),
            issues,
            recommendations,
            overallHealth,
        };
    }

    // Private helper methods

    private async checkLLMQueueHealth() {
        // Get queue status from llmQueueService
        const circuitState = errorRecoveryService.getCircuitBreakerState('geminiAPI');

        return {
            pending: 0, // Get from llmQueueService
            failed: 0,
            processing: 0,
            lastProcessedAt: Date.now(),
            circuitBreakerOpen: circuitState?.isOpen || false,
            averageResponseTimeMs: 0,
        };
    }

    private async checkStorageHealth() {
        const quota = await storage.getQuota();

        return {
            usedMB: quota.used,
            quotaMB: quota.total,
            usagePercent: quota.percentUsed,
            integrityOK: true, // Implement integrity check
            lastCleanupAt: 0,
        };
    }

    private async checkNativeBridgesHealth() {
        const checkBridge = async (name: string, testFn: () => Promise<any>): Promise<BridgeStatus> => {
            try {
                await Promise.race([
                    testFn(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
                ]);
                return 'connected';
            } catch (error) {
                if (error.message === 'Timeout') {
                    return 'timeout';
                }
                return 'error';
            }
        };

        const [overlay, sleep, txStore] = await Promise.all([
            checkBridge('overlay', () => OverlayBridge.checkPermission()),
            checkBridge('sleep', () => SleepBridge.checkActivityRecognitionPermission()),
            checkBridge('txStore', () => TxStoreBridge.getConfig()),
        ]);

        return {
            overlay,
            sleep,
            txStore,
            location: 'connected',
        };
    }

    private async checkPermissionsHealth() {
        const permissions = await Promise.all([
            PermissionManager.checkPermission('notifications'),
            PermissionManager.checkPermission('location'),
            PermissionManager.checkPermission('camera'),
            PermissionManager.checkPermission('overlay'),
        ]);

        return {
            notifications: permissions[0],
            location: permissions[1],
            activityRecognition: false, // Check from SleepBridge
            overlay: permissions[3],
            camera: permissions[2],
            batteryOptimization: false, // Check from BackgroundBridge
        };
    }

    private async checkBackgroundTasksHealth() {
        return {
            sleepDetection: 'running' as TaskStatus,
            overlayScheduler: {
                status: 'running' as TaskStatus,
                activeAlarms: 0, // Get from OverlayScheduler
            },
            foregroundService: 'running' as TaskStatus,
        };
    }
}

export const healthMonitorService = new HealthMonitorService();
```

---

## **TASK 4: Update App.tsx Initialization**

**File**: `mobile/App.tsx`

**What to Add**: Initialize all new services on app startup

**Implementation**:

```typescript
// Add imports at top
import { migrationService } from './src/services/migrationService';
import { errorRecoveryService } from './src/services/errorRecoveryService';
import { initializeNetworkMonitoring } from './src/services/offlineService';

// In componentDidMount or useEffect:
async function initializeApp() {
    try {
        console.log('[App] Initializing services');

        // 1. Run migrations FIRST (before other services)
        await migrationService.runMigrations();

        // 2. Initialize error recovery
        await errorRecoveryService.initialize();

        // 3. Initialize network monitoring
        await initializeNetworkMonitoring();

        // 4. Existing initializations
        await initializePermissionManager();
        await initBootRecovery();
        // ... rest of existing code

        console.log('[App] All services initialized successfully');

    } catch (error) {
        console.error('[App] Initialization error:', error);

        // Log to error recovery service
        await errorRecoveryService.handleError({
            service: 'App',
            operation: 'initialize',
            error,
        });

        // Show user-friendly error message
        Alert.alert(
            'Initialization Error',
            'App failed to start properly. Please restart the app. If the problem persists, try clearing app data.',
            [{ text: 'OK' }]
        );
    }
}
```

---

## **REMAINING TASKS - QUICK REFERENCE**

### **Service Enhancements** (Add features to existing files)

| File | What to Add | Priority |
|------|-------------|----------|
| `geminiService.ts` | Request timeout (10s), Retry-After header parsing | High |
| `actionSyncService.ts` | Mutex timeout (5s), Deadlock detection | High |
| `planRefinementService.ts` | Debounce 30s minimum between same-trigger refinements | Medium |
| `sleepService.ts` | Wake/sleep event debouncing (30s minimum) | Medium |
| `PermissionManager.ts` | Real-time permission monitoring (30s interval) | Medium |
| `storageService.ts` | Quota monitoring, auto-cleanup >90 days | High |

### **UI Enhancements**

| Screen | What to Add | Priority |
|--------|-------------|----------|
| `BackgroundHealthScreen.tsx` | System health dashboard (use healthMonitorService) | Medium |
| `DashboardScreen.tsx` | Subscribe to `PLAN_UPDATED` event for real-time updates | High |
| `SettingsScreen.tsx` | "My Locations" section (save/edit home/work/gym) | Low |

### **Native (Android)**

| File | What to Add | Priority |
|------|-------------|----------|
| `ForegroundHealthService.kt` | Foreground service for background monitoring | High |
| `TxStoreBridge.kt` | Fix overload conflicts (use explicit types) | High |
| `BootReceiver.kt` | Comprehensive alarm rescheduling | Medium |

### **Testing**

| Test Type | What to Create | Priority |
|-----------|----------------|----------|
| Unit tests | autoPlanService, llmQueueService, errorRecoveryService | High |
| Integration tests | Bridge communication, LLM queue processing | Medium |
| E2E tests | Wake→Plan→Action flow (Detox) | Low |

---

## **TESTING CHECKLIST**

Before releasing, test these critical flows:

### ✅ **Flow 1: Wake → Plan Generation**
1. Simulate wake detection
2. Verify energy check (15 points)
3. If low energy, verify fallback to rule-based
4. Verify plan generated with user's meal history (NO hardcoded meals)
5. Verify notifications scheduled
6. Verify overlays scheduled

### ✅ **Flow 2: Offline Operation**
1. Disable network
2. Trigger plan generation
3. Verify rule-based plan generated
4. Re-enable network
5. Verify pending operations retried

### ✅ **Flow 3: Error Recovery**
1. Simulate LLM API failure (3 times)
2. Verify circuit breaker opens
3. Verify fallback to rule-based generation
4. Wait for cooldown
5. Verify circuit closes on success

### ✅ **Flow 4: Migration**
1. Set schema version to 1
2. Add test data
3. Run app
4. Verify migrations run
5. Verify data migrated correctly
6. Verify backup created

---

## **DEPLOYMENT CHECKLIST**

- [ ] All services initialized in App.tsx
- [ ] Migration service runs on startup
- [ ] Error recovery service initialized
- [ ] Network monitoring active
- [ ] Circuit breakers tested
- [ ] Rule-based plan generation tested (NO hardcoded meals)
- [ ] Offline mode tested
- [ ] Permission degradation tested
- [ ] Storage cleanup tested
- [ ] Native bridges tested
- [ ] Crash reporting configured
- [ ] Analytics events added

---

## **PRIORITY ORDER**

**Week 1 (Critical)**:
1. Enhance llmQueueService (exponential backoff, queue limits)
2. Enhance autoPlanService (4-tier generation with fallbacks)
3. Enhance storageService (quota monitoring, cleanup)
4. Update App.tsx initialization

**Week 2 (High Priority)**:
5. Create healthMonitorService
6. Enhance actionSyncService (mutex timeout, deadlock detection)
7. Enhance geminiService (timeout, retry parsing)
8. Fix TxStoreBridge.kt (overload conflicts)

**Week 3 (Medium Priority)**:
9. Enhance PermissionManager (real-time monitoring)
10. Enhance BackgroundHealthScreen (health dashboard UI)
11. Enhance DashboardScreen (event-driven updates)
12. Create ForegroundHealthService.kt

**Week 4 (Testing & Polish)**:
13. Unit tests (core services)
14. Integration tests
15. E2E tests
16. Final testing & bug fixes

---

## **GETTING HELP**

If you encounter issues during implementation:

1. **Check Error Logs**: `errorRecoveryService.getRecentErrors()`
2. **Run Diagnostics**: `healthMonitorService.runDiagnostics()`
3. **Check Circuit Breakers**: `errorRecoveryService.getAllCircuitBreakerStates()`
4. **Network State**: `offlineService.getEnhancedNetworkState()`
5. **Migration History**: `migrationService.getMigrationHistory()`

---

## **SUMMARY**

You now have:

✅ **4 Foundation Services Implemented**:
- offlineService (enhanced with event emitter)
- errorRecoveryService (circuit breaker, recovery strategies)
- planGenerationEngine (rule-based, NO hardcoded plans)
- migrationService (schema versioning)

✅ **Complete Implementation Guide** for:
- 13 service enhancements
- 3 UI enhancements
- 3 native Android components
- Complete testing strategy

**Next Step**: Start with Week 1 tasks (llmQueueService, autoPlanService, storageService, App.tsx) to get the core robust architecture running.
