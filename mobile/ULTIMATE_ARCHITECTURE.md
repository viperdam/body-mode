# Body Mode - Ultimate System Architecture
**Complete End-to-End Architecture for Adaptive Sleep Detection, Pattern Learning, and Intelligent Daily Planning**

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Core Philosophy: Data-Driven Pattern Learning](#core-philosophy-data-driven-pattern-learning)
3. [5-Layer Architecture Overview](#5-layer-architecture-overview)
4. [Complete Data Flow Pipeline](#complete-data-flow-pipeline)
5. [Layer 1: Sensor & Input Layer (Data Collection)](#layer-1-sensor--input-layer-data-collection)
6. [Layer 2: Intelligence Layer (Pattern Extraction from Logs)](#layer-2-intelligence-layer-pattern-extraction-from-logs)
7. [Layer 3: Planning Layer (Decision Making)](#layer-3-planning-layer-decision-making)
8. [Layer 4: Execution Layer (Action & Feedback)](#layer-4-execution-layer-action--feedback)
9. [Layer 5: Presentation Layer (UI)](#layer-5-presentation-layer-ui)
10. [Service Architecture Details](#service-architecture-details)
11. [State Machines](#state-machines)
12. [Data Models](#data-models)
13. [LLM Integration Strategy](#llm-integration-strategy)
14. [Pattern Learning Deep Dive](#pattern-learning-deep-dive)
15. [Performance & Optimization](#performance--optimization)
16. [User Experience Journey](#user-experience-journey)
17. [Implementation Roadmap](#implementation-roadmap)
18. [Success Metrics](#success-metrics)

---

## Executive Summary

### Core Philosophy
**Zero Hard-Coded Assumptions. 100% Data-Driven Pattern Learning.**

The Body Mode system learns when YOUR day starts, not when a calendar says it starts. It adapts to shift workers, travelers, irregular schedules, and evolving life patterns through continuous LLM-powered analysis of YOUR logged data—nothing else.

### Key Innovations

1. **Adaptive Day Boundary**: System learns primary sleep period from 90 days of YOUR sleep logs, defines day as "sleep midpoint + 12 hours"
2. **Continuous Learning from Your Data**: Perpetual 90-day rolling window analysis of sleep sessions, food logs, activity logs, and detection events
3. **LLM-Powered Intelligence**: Gemini analyzes YOUR patterns from YOUR logs—no external data, no templates
4. **Multi-Modal Input Collection**: Sleep detection + cavisionmera  + manual logs + context sensors → ALL stored to AsyncStorage/Database
5. **Offline-First Architecture**: All data stored locally first, LLM analyzes locally stored data, works without network
6. **Closed-Loop Learning**: Your actions → Logged to database → LLM extracts patterns → Plans adapt → Loop repeats

### System Capabilities

- **Automatic Sleep/Wake Detection** via sensor fusion → Stored as sleep sessions in database
- **Pattern Learning from Logs** - LLM analyzes sleep_sessions, food_logs, activity_logs from AsyncStorage
- **Intelligent Plan Generation** based on patterns extracted from YOUR historical logs
- **Camera Vision (Gemini Only)** for automatic food logging → Stored to food_logs database
- **Real-Time Plan Refinement** based on new logs as they're created
- **Carry-Over Intelligence** for incomplete items based on completion patterns learned from logs
- **Shift Worker Support** with automatic schedule change detection from sleep log analysis

---

## Core Philosophy: Data-Driven Pattern Learning

### The Closed-Loop Learning System

```
┌─────────────────────────────────────────────────────────────────┐
│  CLOSED-LOOP PATTERN LEARNING SYSTEM                            │
│                                                                 │
│  USER BEHAVIOR                                                  │
│       ↓                                                         │
│  DATA COLLECTION (Layer 1)                                      │
│   - Sleep detection sensors → sleep_sessions database           │
│   - Camera capture → food_logs database                         │
│   - Manual logs → activity_logs database                        │
│   - Context sensors → context_logs                              │
│       ↓                                                         │
│  STORAGE (AsyncStorage / Local Database)                        │
│   - sleep_sessions_v2: 90 days of sleep data                    │
│   - food_logs_v2: 30 days of meals with macros                  │
│   - activity_logs_v2: exercise, meditation, custom              │
│   - ALL stored locally, NO external APIs                        │
│       ↓                                                         │
│  PATTERN EXTRACTION (Layer 2 - LLM Analysis)                    │
│   - Load YOUR logs from AsyncStorage                            │
│   - Send to Gemini with prompt: "analyze THIS user's patterns"  │
│   - Extract: sleep window, meal times, exercise habits          │
│   - NO external data, NO templates, ONLY your logs              │
│       ↓                                                         │
│  ADAPTIVE CONFIG (Learned Patterns Storage)                     │
│   - adaptive_config_v2 stores extracted patterns                │
│   - Confidence scores based on log consistency                  │
│   - Derived values: day boundary, rollover threshold            │
│       ↓                                                         │
│  PLAN GENERATION (Layer 3)                                      │
│   - Use learned patterns from adaptive_config                   │
│   - Generate plan matching YOUR patterns                        │
│       ↓                                                         │
│  PLAN EXECUTION (Layer 4)                                       │
│   - User follows plan, logs activities                          │
│       ↓                                                         │
│  NEW LOGS CREATED                                               │
│   - Food logged → food_logs_v2                                  │
│   - Sleep detected → sleep_sessions_v2                          │
│   - Activity completed → activity_logs_v2                       │
│       ↓                                                         │
│  LOOP REPEATS (Continuous Learning)                             │
│   - More logs = better patterns                                 │
│   - Patterns evolve as behavior changes                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Pattern Sources (100% From Your Data)

| Pattern Type | Data Source | LLM Extracts From |
|-------------|-------------|-------------------|
| **Sleep Window** | sleep_sessions_v2 (90 days) | Bedtime/wake time timestamps, duration, consistency |
| **Work Schedule** | sleep_sessions_v2 + activity_logs_v2 | Wake time patterns, activity timing, weekday vs weekend |
| **Meal Windows** | food_logs_v2 (30 days) | Meal timestamps, mealType classification |
| **Exercise Habits** | activity_logs_v2 | Exercise start time, duration, frequency |
| **Productivity Peaks** | activity_logs_v2 | Task completion times, success rates by hour |
| **Schedule Type** | sleep_sessions_v2 variance | Standard/night shift/rotating detected from log patterns |

**CRITICAL**: Zero external data. Zero templates. Only YOUR logged behavior analyzed by LLM.

---

## 5-Layer Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 5: PRESENTATION                        │
│  React Native UI, Widgets, Notifications, Overlays              │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Events & State
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 4: EXECUTION                           │
│  Plan Refinement, Overlay Service, Notification Service         │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Decisions & Actions
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 3: PLANNING                            │
│  Plan Generation using Learned Patterns, LLM Orchestration      │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Patterns from Logs
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 2: INTELLIGENCE                        │
│  LLM Pattern Analyzer (analyzes logs), Adaptive Config Manager  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Raw Logs from Database
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 1: SENSOR & INPUT                      │
│  Sleep Detection → Logs, Camera → Logs, Manual Input → Logs     │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Direction

**Bottom-Up (Data Collection → Intelligence)**:
- Sensors collect → Store to AsyncStorage → LLM analyzes logs → Extract patterns

**Top-Down (Decisions → Actions)**:
- Patterns inform planning → Planning creates daily plan → Execution delivers plan

**Feedback Loop (Continuous)**:
- User actions create new logs → Logs update database → Re-analyze patterns → Plans evolve

---

## Complete Data Flow Pipeline

### The Grand Unified Loop

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER EXISTS                                 │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  CONTINUOUS DATA COLLECTION (Layer 1)                  │        │
│  │  → Sleep sensors detect → Store to sleep_sessions_v2  │        │
│  │  → Camera captures food → Gemini analyzes → Store to  │        │
│  │    food_logs_v2                                        │        │
│  │  → Manual activity → Store to activity_logs_v2        │        │
│  │  → Context sensors → Store context metadata            │        │
│  │                                                        │        │
│  │  ALL DATA STORED IN AsyncStorage (LOCAL DATABASE)     │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  PATTERN ANALYSIS TRIGGER (Layer 2)                    │        │
│  │  - Every wake event (if BOOTSTRAPPING/LEARNING)       │        │
│  │  - Every 24 hours (if MATURE)                          │        │
│  │  - On drift detection                                  │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  LOAD LOGS FROM DATABASE (Layer 2)                     │        │
│  │  - Load sleep_sessions_v2 (last 90 days)              │        │
│  │  - Load food_logs_v2 (last 30 days)                   │        │
│  │  - Load activity_logs_v2 (last 90 days)               │        │
│  │  - Apply recency weighting                             │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  LLM PATTERN ANALYZER (Layer 2)                        │        │
│  │  INPUT: JSON dump of YOUR logs                         │        │
│  │  PROCESS: Gemini analyzes for patterns                 │        │
│  │  OUTPUT: Extracted patterns with confidence            │        │
│  │                                                        │        │
│  │  Patterns Extracted:                                   │        │
│  │  - Primary sleep window (from sleep_sessions)         │        │
│  │  - Work schedule (from wake patterns + activities)    │        │
│  │  - Meal windows (from food_logs timestamps)           │        │
│  │  - Exercise habits (from activity_logs)               │        │
│  │  - Productivity peaks (from completion patterns)      │        │
│  │  - Schedule drift detection                            │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  ADAPTIVE CONFIG UPDATE (Layer 2)                      │        │
│  │  - Store learned patterns to adaptive_config_v2        │        │
│  │  - Calculate derived values:                           │        │
│  │    * Day boundary = sleep midpoint + 12h               │        │
│  │    * Rollover threshold = bedtime - 3h                 │        │
│  │  - Update learning state                               │        │
│  │  - Increment version                                   │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  PLAN GENERATION TRIGGER (Layer 3)                     │        │
│  │  Triggers:                                             │        │
│  │  - WAKE event detected                                 │        │
│  │  - Day rollover (at learned sleep midpoint)            │        │
│  │  - BOOT_COMPLETED + pending generation                 │        │
│  │  - Network restored + pending generation               │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  PLAN GENERATION ENGINE (Layer 3)                      │        │
│  │  INPUT:                                                │        │
│  │  - adaptive_config_v2 (learned patterns)              │        │
│  │  - carry_over_items (from yesterday)                  │        │
│  │  - user_profile (goals, restrictions)                 │        │
│  │  - current_context (time, energy, location)           │        │
│  │                                                        │        │
│  │  PROCESS:                                              │        │
│  │  - LLM generates plan using learned meal/exercise     │        │
│  │    windows from YOUR logs                              │        │
│  │  - Schedule items at YOUR typical times               │        │
│  │  - Respect YOUR work schedule                         │        │
│  │                                                        │        │
│  │  OUTPUT: Personalized DailyPlan                        │        │
│  │  - Saved to AsyncStorage (current_plan_v2)            │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  EXECUTION & DELIVERY (Layer 4)                        │        │
│  │  - Schedule overlays at learned times                  │        │
│  │  - Show notifications (respecting sleep window)        │        │
│  │  - Update widget                                       │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  USER INTERACTION (Layer 5)                            │        │
│  │  - User sees plan in UI                                │        │
│  │  - User logs food via camera                           │        │
│  │  - User marks items complete/incomplete                │        │
│  │  - User dismisses/snoozes overlays                     │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  NEW LOGS CREATED (back to Layer 1)                   │        │
│  │  - Food logged → food_logs_v2 updated                 │        │
│  │  - Sleep detected tonight → sleep_sessions_v2 updated │        │
│  │  - Activity completed → activity_logs_v2 updated      │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  REAL-TIME PLAN REFINEMENT (Layer 4)                   │        │
│  │  - New food log → adjust remaining calories            │        │
│  │  - Sleep event → reschedule tomorrow                   │        │
│  │  - Location change → context-aware suggestions         │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  DAY ROLLOVER (Layer 3 + 4)                            │        │
│  │  Trigger: Learned sleep midpoint reached               │        │
│  │  - Mark incomplete items                               │        │
│  │  - Store carry-over candidates                         │        │
│  │  - Trigger pattern re-analysis (if needed)             │        │
│  └────────────────────────────────────────────────────────┘        │
│                              │                                      │
│                              ▼                                      │
│                        LOOP REPEATS                                │
│              (More logs → Better patterns)                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Sensor & Input Layer (Data Collection)

**PURPOSE**: Collect raw data from user behavior and store as structured logs in AsyncStorage/Database

### 1.1 Sleep Detection Service (Native Android)

**File**: `SleepWakeDetectionService.kt`

**Multi-Signal Sensor Fusion**:

| Signal | Purpose | Confidence Weight |
|--------|---------|------------------|
| Accelerometer (flat) | Detect phone lying still | 20% |
| Activity Recognition (STILL) | Detect user not moving | 30% |
| Screen off | Detect screen turned off | 15% |
| Charging status | Often charge while sleeping | 10% |
| Time of day | Learned sleep window | 25% |

**State Machine**:
```
AWAKE → PENDING_SLEEP (show overlay) → CONFIRMED_SLEEP → WAKE
```

**Sleep Session Storage (DATABASE)**:
```typescript
interface SleepSession {
  id: string;
  sleepTime: number; // Unix timestamp
  wakeTime: number;  // Unix timestamp
  duration: number;  // milliseconds
  confidence: number; // 0-100
  signals: {
    wasCharging: boolean;
    wasFlatOnSurface: boolean;
    wasStill: boolean;
    screenWasOff: boolean;
    inLearnedWindow: boolean;
  };
  metadata: {
    timezone: string;
    deviceModel: string;
    osVersion: string;
  };
}
```

**Storage Location**: `AsyncStorage` key: `sleep_sessions_v2`

**Data Retention**: Keep last 90 days, auto-prune older

**LLM Pattern Extraction**: From this database, LLM extracts:
- Typical bedtime (median sleep start time)
- Typical wake time (median wake time)
- Sleep duration consistency (stdDev)
- Schedule type (standard/night shift/rotating based on variance)
- Weekday vs weekend patterns

---

### 1.2 Camera Food Logging (Using Existing LLM Infrastructure)

**File**: Uses existing `src/services/geminiService.ts` → `analyzeMedia()` function

**Vision Pipeline**:

```
Camera Capture
    ↓
Convert to base64
    ↓
Call geminiService.analyzeMedia() (EXISTING FUNCTION - lines 625-669)
    ↓
Food ID + Macro Estimation + Portion Size
    ↓
Store to food_logs_v2 (DATABASE)
    ↓
Trigger plan refinement
```

**Note**: The codebase already has a complete Gemini Vision implementation in `geminiService.ts`. Camera food logging reuses this existing infrastructure—no new vision service needed.

**Food Log Data Model (DATABASE)**:
```typescript
interface FoodLog {
  id: string;
  timestamp: number; // When meal was eaten
  imageUri: string; // local file path
  imageSize: number; // bytes
  detectionResults: {
    primary: string; // "grilled chicken breast"
    secondary: string[]; // ["brown rice", "steamed broccoli"]
    confidence: number; // 0-100 (Gemini's confidence)
  };
  estimatedMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    confidence: number; // Gemini's confidence in portion estimate
  };
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unknown';
  context: {
    location?: string;
    linkedPlanItemId?: string; // if logged from plan item
  };
}
```

**Storage**: `AsyncStorage` key: `food_logs_v2`

**Data Retention**: Keep last 30 days

**LLM Pattern Extraction**: From this database, LLM extracts:
- Breakfast window (when breakfast meals typically logged)
- Lunch window (when lunch meals typically logged)
- Dinner window (when dinner meals typically logged)
- Snacking patterns (frequency, timing)
- Macro preferences (typical protein/carb/fat ratios)

---

### 1.3 Manual Activity Logs (DATABASE)

**File**: `src/services/activityLogService.ts` (existing)

**Activity Log Data Model**:
```typescript
interface ActivityLog {
  id: string;
  timestamp: number; // When activity occurred
  type: 'exercise' | 'meditation' | 'water' | 'custom';
  title: string;
  duration?: number; // minutes
  completed: boolean;
  intensity?: 'low' | 'medium' | 'high';
  metadata: {
    linkedPlanItemId?: string;
    notes?: string;
  };
}
```

**Storage**: `AsyncStorage` key: `activity_logs_v2`

**LLM Pattern Extraction**: From this database, LLM extracts:
- Exercise window (when exercises typically done)
- Exercise duration preferences
- Meditation habits (frequency, time of day)
- Activity completion rates by time of day (productivity peaks)
- Habit consistency (streak detection)

---

### 1.4 Context Sensors (Metadata for Pattern Learning)

**Location Context**:
```typescript
interface LocationContext {
  isAtHome: boolean;
  isAtWork: boolean;
  isCommuting: boolean;
  confidence: number;
}
```

**Device State**:
- Battery level (energy metaphor)
- Network connectivity
- App foreground/background state

**LLM Pattern Extraction**: Enriches other patterns:
- Commute times inferred from location transitions
- Work hours inferred from "at work" periods
- Home meal vs restaurant meal patterns

---

## Layer 2: Intelligence Layer (Pattern Extraction from Logs)

**PURPOSE**: Analyze stored logs with LLM to extract behavioral patterns

### 2.1 LLM Pattern Analyzer (Core Intelligence)

**File**: `src/services/patternAnalyzer.ts` (new)

**Trigger Conditions**:
1. **On Wake Event** (if learning state = BOOTSTRAPPING or ACTIVE_LEARNING)
2. **Every 24 hours** (if learning state = MATURE)
3. **On Drift Detection** (schedule deviation >2 hours for 3+ days)
4. **Manual Request** (user initiates re-learning)

**Analysis Process**:

```typescript
async function analyzePatterns(
  sleepData: SleepSession[],      // From sleep_sessions_v2 database
  foodData: FoodLog[],             // From food_logs_v2 database
  activityData: ActivityLog[]      // From activity_logs_v2 database
): Promise<LearnedPatterns> {

  // 1. Load YOUR logs from AsyncStorage (90-day rolling window)
  const sleepLogs = await loadSleepSessions(90); // days
  const foodLogs = await loadFoodLogs(30);
  const activityLogs = await loadActivityLogs(90);

  // 2. Apply recency weighting (recent data weighted higher)
  const weightedSleep = applySlidingWindowWeights(sleepLogs);
  const weightedFood = applySlidingWindowWeights(foodLogs);
  const weightedActivity = applySlidingWindowWeights(activityLogs);

  // 3. Build LLM prompt with YOUR data
  const prompt = buildPatternAnalysisPrompt({
    sleepSessions: weightedSleep,
    foodLogs: weightedFood,
    activities: weightedActivity,
    currentPatterns: await getAdaptiveConfig(), // for comparison/drift
  });

  // 4. Call Gemini to analyze YOUR logs
  const response = await callGemini({
    model: 'gemini-2.0-flash-exp', // or gemini-3-pro-preview for complex analysis
    prompt,
    temperature: 0.1, // low creativity, high consistency
    responseFormat: 'json',
  });

  // 5. Parse extracted patterns
  const patterns = parsePatternResponse(response);
  validatePatternConfidence(patterns); // reject if confidence <50%

  // 6. Detect drift (compare to previous patterns)
  const drift = detectScheduleDrift(patterns, currentPatterns);

  return {
    ...patterns,
    drift,
    analyzedAt: Date.now(),
    dataPointCount: sleepLogs.length,
  };
}
```

**LLM Prompt Structure** (Key: Analyze ONLY user's logs):

```
ROLE: You are a behavioral pattern analyst specializing in circadian rhythms and daily routines.

TASK: Analyze THIS USER's logged data to extract consistent patterns.

CRITICAL: Analyze ONLY the provided data. Do NOT use templates or assumptions.

DATA PROVIDED (from AsyncStorage database):

SLEEP SESSIONS (90 days):
[JSON array of SleepSession objects with timestamps, durations, signals]

FOOD LOGS (30 days):
[JSON array of FoodLog objects with timestamps, mealType, macros]

ACTIVITY LOGS (90 days):
[JSON array of ActivityLog objects with timestamps, type, completion]

CURRENT PATTERNS (for comparison):
[Current adaptive_config if exists, for drift detection]

ANALYZE FOR:

1. PRIMARY SLEEP WINDOW
   - Calculate median bedtime from sleepSessions[].sleepTime
   - Calculate median wake time from sleepSessions[].wakeTime
   - Calculate stdDeviation (consistency metric)
   - Confidence = inverse of variance

2. WORK SCHEDULE
   - Infer from wake time patterns + activity timing
   - Classify: standard (9-5), night_shift (sleep during day), rotating, irregular
   - Identify work start/end from activity gaps

3. MEAL TIME WINDOWS
   - Extract breakfast window from foodLogs where mealType='breakfast'
   - Extract lunch window from foodLogs where mealType='lunch'
   - Extract dinner window from foodLogs where mealType='dinner'
   - Calculate confidence from timing consistency

4. EXERCISE WINDOW
   - Extract from activityLogs where type='exercise'
   - Determine preferredTime: morning/afternoon/evening
   - Calculate typical start time and duration

5. PRODUCTIVITY PEAKS
   - Analyze activityLogs completion times
   - Find time windows with highest completion rates

6. SCHEDULE DRIFT DETECTION
   - Compare current patterns to provided currentPatterns
   - Detect: schedule shift >2 hours sustained >3 days

OUTPUT FORMAT: JSON
{
  "primarySleep": {
    "typicalBedtime": "22:30", // HH:mm from median(sleepSessions[].sleepTime)
    "typicalWakeTime": "06:45", // HH:mm from median(sleepSessions[].wakeTime)
    "confidence": 85, // based on consistency
    "stdDeviation": 45 // minutes variance
  },
  "workSchedule": {
    "type": "standard" | "night_shift" | "rotating" | "irregular",
    "typicalWorkStart": "09:00", // inferred from wake + activity patterns
    "typicalWorkEnd": "17:30",
    "confidence": 78
  },
  "mealWindows": {
    "breakfast": {
      "start": "07:00", // from min(foodLogs[mealType='breakfast'].timestamp)
      "end": "09:00",   // from max(foodLogs[mealType='breakfast'].timestamp)
      "confidence": 82
    },
    "lunch": { "start": "12:00", "end": "13:30", "confidence": 90 },
    "dinner": { "start": "18:30", "end": "20:00", "confidence": 75 }
  },
  "exerciseWindow": {
    "preferredTime": "morning", // from activityLogs[type='exercise'] timing
    "typicalStart": "07:00",
    "duration": 45, // median duration
    "confidence": 65
  },
  "scheduleDrift": {
    "detected": false,
    "direction": null,
    "magnitude": 0
  }
}

RULES:
- ONLY use provided log data - NO external data sources
- ONLY return patterns with confidence >50%
- If insufficient data (<7 sessions), return low confidence
- Flag patterns with low consistency (stdDev >2 hours)
- Detect drift by comparing to currentPatterns
```

---

### 2.2 Adaptive Configuration Manager (Pattern Storage)

**File**: `src/services/adaptiveConfigService.ts` (new)

**Purpose**: Stores learned patterns extracted from logs

**Data Model**:
```typescript
interface AdaptiveConfig {
  version: number; // increment on each update
  lastAnalyzed: number; // timestamp of last LLM analysis
  learningState: 'BOOTSTRAPPING' | 'ACTIVE_LEARNING' | 'MATURE' | 'DRIFT_DETECTED';
  dataPointCount: number; // how many sleep sessions analyzed

  // PATTERNS EXTRACTED FROM LOGS
  patterns: {
    primarySleep: {
      bedtime: string; // "22:30" HH:mm (from sleep_sessions_v2)
      wakeTime: string; // "06:45" (from sleep_sessions_v2)
      confidence: number;
      stdDeviation: number; // minutes
      source: 'sleep_sessions_v2'; // which database table
    };

    workSchedule: {
      type: 'standard' | 'night_shift' | 'rotating' | 'irregular';
      workStart: string; // inferred from logs
      workEnd: string;
      confidence: number;
      source: 'sleep_sessions_v2 + activity_logs_v2';
    };

    mealWindows: {
      breakfast: TimeWindow; // from food_logs_v2
      lunch: TimeWindow;
      dinner: TimeWindow;
    };

    exerciseWindow: {
      preferredTime: 'morning' | 'afternoon' | 'evening';
      start: string; // from activity_logs_v2
      duration: number;
      confidence: number;
      source: 'activity_logs_v2';
    };
  };

  // DERIVED VALUES (calculated from patterns)
  derived: {
    dayBoundary: string; // "03:00" (sleep midpoint + 12h)
    rolloverThreshold: string; // "21:00" (bedtime - 3h)
  };
}
```

**Storage**: `AsyncStorage` key: `adaptive_config_v2`

**Update Logic**:
```typescript
async function updateAdaptiveConfig(newPatterns: LearnedPatterns) {
  const current = await getAdaptiveConfig();

  // Apply confidence-based blending (high confidence = more weight)
  const blended = blendConfidenceWeighted(current.patterns, newPatterns);

  // Calculate derived values FROM LEARNED PATTERNS
  const dayBoundary = calculateDayBoundary(blended.primarySleep);
  const rolloverThreshold = calculateRolloverThreshold(blended.primarySleep);

  // Update learning state
  const newState = determineLearningState({
    dataPoints: current.dataPointCount + 1,
    currentState: current.learningState,
    drift: newPatterns.drift,
  });

  const updated: AdaptiveConfig = {
    version: current.version + 1,
    lastAnalyzed: Date.now(),
    learningState: newState,
    dataPointCount: current.dataPointCount + 1,
    patterns: blended,
    derived: { dayBoundary, rolloverThreshold },
  };

  await AsyncStorage.setItem('adaptive_config_v2', JSON.stringify(updated));

  // Emit event for UI update
  planEventService.emit('ADAPTIVE_CONFIG_UPDATED', updated);
}
```

---

### 2.3 Camera Food Logging (Using Existing LLM Infrastructure)

**Service**: Uses existing `src/services/geminiService.ts` (NO new service needed)

**Implementation**: Reuse existing `analyzeMedia()` function (already in codebase)

**Step 1: Image Capture**
```typescript
async function captureFood(): Promise<string> {
  const { uri } = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.8,
  });
  return uri;
}
```

**Step 2: Convert to Base64 and Call Existing LLM**
```typescript
import { analyzeMedia } from '../services/geminiService'; // EXISTING SERVICE

async function analyzeFoodImage(imageUri: string, userProfile: UserProfile): Promise<FoodAnalysisResult> {
  // Convert image to base64
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Call EXISTING analyzeMedia function (geminiService.ts lines 625-669)
  // This function already handles:
  // - Gemini Vision API call
  // - Food identification
  // - Macro estimation
  // - Retry logic with model fallback
  // - Error handling
  const result = await analyzeMedia(
    { data: base64, mimeType: 'image/jpeg' },
    userProfile,
    targetLanguage,
    deepContext // optional: includes food history, current plan, etc.
  );

  return result; // Returns FoodAnalysisResult with all food data
}
```

**Step 3: Store to Database**
```typescript
async function logFood(imageUri: string, userProfile: UserProfile) {
  // Use EXISTING geminiService.analyzeMedia
  const analysis = await analyzeFoodImage(imageUri, userProfile);

  // Create FoodLog from analysis result
  const foodLog: FoodLog = {
    id: generateId(),
    timestamp: Date.now(),
    imageUri,
    imageSize: await getFileSize(imageUri),
    detectionResults: {
      primary: analysis.foodName,
      secondary: analysis.ingredients || [],
      confidence: analysis.confidence === 'High' ? 90 : analysis.confidence === 'Medium' ? 70 : 50,
    },
    estimatedMacros: {
      calories: analysis.macros.calories,
      protein: analysis.macros.protein,
      carbs: analysis.macros.carbs,
      fat: analysis.macros.fat,
      confidence: analysis.confidence === 'High' ? 90 : 70,
    },
    mealType: inferMealType(Date.now()), // Based on time of day
    context: {},
  };

  // Store to AsyncStorage (DATABASE)
  const logs = await getFoodLogs();
  logs.push(foodLog);
  await AsyncStorage.setItem('food_logs_v2', JSON.stringify(logs));

  // Trigger plan refinement (immediate)
  await planRefinementService.handleFoodLog(foodLog);

  // Trigger pattern re-analysis (if enough new data)
  const shouldReanalyze = await checkIfPatternReanalysisNeeded();
  if (shouldReanalyze) {
    await patternAnalyzer.analyzePatterns();
  }

  // Emit event for UI update
  planEventService.emit('FOOD_LOGGED', foodLog);
}
```

**Key Point**: The codebase **already has** a complete Gemini Vision implementation in `geminiService.ts` with:
- `analyzeMedia()` function (lines 625-669)
- Full retry logic with model fallback
- User context integration
- Deep AI context support
- Existing FOOD_SCHEMA validation

**No new camera vision service needed** - just use the existing LLM infrastructure.

---

## Layer 3: Planning Layer (Decision Making)

### 3.1 Plan Generation Service

**File**: `src/services/planGenerationService.ts` (enhanced)

**Generation Triggers**:
```typescript
enum PlanGenerationTrigger {
  WAKE = 'wake_detected',           // User just woke up
  MIDNIGHT = 'midnight_rollover',   // Reached adaptive day boundary
  BOOT = 'boot_completed',          // Device rebooted
  NETWORK = 'network_restored',     // Came back online
  MANUAL = 'user_requested',        // User tapped "regenerate"
}
```

**Generation Process (Using Learned Patterns from Logs)**:
```typescript
async function generateDailyPlan(trigger: PlanGenerationTrigger): Promise<DailyPlan> {

  // 1. Load adaptive config (PATTERNS LEARNED FROM YOUR LOGS)
  const config = await getAdaptiveConfig();

  // 2. Load carry-over items from yesterday
  const carryOver = await getCarryOverItems();

  // 3. Load user profile & goals
  const profile = await getUserProfile();

  // 4. Get current context
  const context = await getCurrentContext(); // time, location, energy

  // 5. Build LLM prompt with LEARNED patterns
  const prompt = buildPlanGenerationPrompt({
    learnedPatterns: config.patterns, // FROM YOUR LOGS
    carryOverItems: carryOver,
    userProfile: profile,
    context,
    trigger,
  });

  // 6. Call LLM (with fallback chain)
  let plan: DailyPlan;
  try {
    plan = await callGeminiForPlan(prompt);
  } catch (error) {
    // Fallback to rule-based planner (uses adaptive config if available)
    plan = await ruleBasedPlanner.generate(config, carryOver, profile);
  }

  // 7. Save and emit
  await savePlan(plan);
  planEventService.emit('PLAN_GENERATED', { plan, trigger });

  return plan;
}
```

**LLM Prompt for Plan Generation (Uses Patterns from Logs)**:
```
ROLE: You are a personalized health planning AI.

USER PROFILE:
- Age: {age}
- Goals: {goals}
- Dietary restrictions: {restrictions}
- Fitness level: {fitnessLevel}

LEARNED PATTERNS (extracted from THIS user's logged data):

From sleep_sessions_v2 (90 days of sleep logs):
- Typical wake time: {config.patterns.primarySleep.wakeTime}
- Typical bedtime: {config.patterns.primarySleep.bedtime}
- Sleep consistency: {config.patterns.primarySleep.confidence}%

From activity_logs_v2 + sleep_sessions_v2:
- Work schedule type: {config.patterns.workSchedule.type}
- Work hours: {config.patterns.workSchedule.workStart} - {config.patterns.workSchedule.workEnd}

From food_logs_v2 (30 days of meal logs):
- Breakfast window: {config.patterns.mealWindows.breakfast.start} - {end}
- Lunch window: {config.patterns.mealWindows.lunch.start} - {end}
- Dinner window: {config.patterns.mealWindows.dinner.start} - {end}

From activity_logs_v2:
- Exercise preference: {config.patterns.exerciseWindow.preferredTime}
- Typical exercise time: {config.patterns.exerciseWindow.start}
- Typical duration: {config.patterns.exerciseWindow.duration} minutes

CARRY-OVER FROM YESTERDAY:
{carryOver.map(item => `- ${item.title} (incomplete, priority: ${item.priority})`)}

CURRENT CONTEXT:
- Current time: {context.time}
- Energy level: {context.energy}/100
- Location: {context.location}

TASK: Generate a personalized daily plan matching THIS USER's learned patterns.

REQUIREMENTS:
1. Schedule breakfast at {config.patterns.mealWindows.breakfast.start} (from user's food logs)
2. Schedule lunch at {config.patterns.mealWindows.lunch.start} (from user's food logs)
3. Schedule dinner at {config.patterns.mealWindows.dinner.start} (from user's food logs)
4. Schedule exercise at {config.patterns.exerciseWindow.start} (from user's activity logs)
5. DO NOT schedule items during work hours ({workStart} - {workEnd})
6. Include carry-over items (prioritize high-priority)
7. Respect user's typical wake time and bedtime
8. Include hydration reminders
9. Match user's historical macro preferences from food logs

OUTPUT FORMAT: JSON
{
  "date": "2025-01-15",
  "items": [
    {
      "id": "uuid",
      "type": "meal" | "exercise" | "hydration" | "custom",
      "title": "Breakfast",
      "description": "High-protein breakfast (matches your typical preferences)",
      "scheduledTime": "07:30", // FROM LEARNED BREAKFAST WINDOW
      "duration": 20,
      "macros": { "calories": 450, "protein": 25, "carbs": 45, "fat": 12 },
      "priority": "high",
      "isCarryOver": false
    },
    ...
  ],
  "dailyGoals": {
    "totalCalories": 2200,
    "protein": 165,
    "carbs": 220,
    "fat": 65,
    "water": 3000
  }
}
```

---

### 3.2 Plan Refinement Service

**File**: `src/services/planRefinementService.ts` (enhanced)

**Real-Time Refinement Triggers**:

1. **Food Log Event** → Adjust remaining calories, update food_logs_v2
2. **Sleep Event** → Adjust schedule, update sleep_sessions_v2
3. **Location Change** → Context-aware suggestions
4. **Energy Level Change** → Simplify/intensify plan
5. **Time Deviation** → Reschedule remaining items

**Example: Food Log Refinement**
```typescript
async function handleFoodLog(foodLog: FoodLog) {
  const plan = await getCurrentPlan();
  if (!plan) return;

  // Find if this was a planned meal
  const plannedMeal = plan.items.find(
    item => item.type === 'meal' &&
    isWithinWindow(foodLog.timestamp, item.scheduledTime, 30) // 30 min window
  );

  if (plannedMeal) {
    // Mark as completed with actual macros
    plannedMeal.completed = true;
    plannedMeal.actualMacros = foodLog.estimatedMacros;

    // Calculate remaining daily budget
    const consumed = sumConsumedMacros(plan.items);
    const remaining = {
      calories: plan.dailyGoals.totalCalories - consumed.calories,
      protein: plan.dailyGoals.protein - consumed.protein,
      carbs: plan.dailyGoals.carbs - consumed.carbs,
      fat: plan.dailyGoals.fat - consumed.fat,
    };

    // Adjust remaining meals if significantly over/under
    if (Math.abs(remaining.calories) > 300) {
      await refineFutureMeals(plan, remaining);
    }
  } else {
    // Unplanned meal - call LLM to decide what to do
    await handleUnplannedMeal(plan, foodLog);
  }

  await savePlan(plan);
  planEventService.emit('PLAN_REFINED', { reason: 'food_log', foodLog });
}
```

---

### 3.3 Midnight Rollover Service

**File**: `src/services/planRefinementService.ts` → `handleMidnightRollover()`

**Trigger**: Adaptive day boundary reached (learned sleep midpoint + 12h FROM LOGS)

**Process**:
```typescript
async function handleMidnightRollover() {
  // Load adaptive config (patterns learned from logs)
  const config = await getAdaptiveConfig();
  const threshold = config.derived.rolloverThreshold; // Calculated from learned bedtime

  const yesterday = await getPlan(getYesterdayDate());
  if (!yesterday) return;

  // Find incomplete items created/scheduled after threshold
  const carryOverCandidates = yesterday.items.filter(item =>
    !item.completed &&
    item.createdAt > parseTime(threshold) &&
    item.priority !== 'low'
  );

  // Store for tomorrow's plan generation
  await AsyncStorage.setItem('carry_over_items', JSON.stringify(carryOverCandidates));

  // Emit event for UI update
  planEventService.emit('MIDNIGHT_ROLLOVER', {
    carryOverCount: carryOverCandidates.length,
    nextDayBoundary: config.derived.dayBoundary,
  });
}
```

**Storage**: `AsyncStorage` key: `carry_over_items`

---

## Layer 4: Execution Layer (Action & Feedback)

### 4.1 Overlay Service

**File**: `OverlayWindowService.kt` (existing, enhanced)

**Types of Overlays**:
1. **Sleep Confirmation** (PENDING_SLEEP state)
2. **Wake Greeting** (new day, show plan summary)
3. **Meal Reminder** (at learned meal windows FROM LOGS)
4. **Exercise Reminder** (at learned exercise window FROM LOGS)
5. **Hydration Reminder** (periodic)
6. **Ad Recharge** (energy <20)

**Scheduling Logic (Uses Learned Patterns)**:
```kotlin
fun scheduleOverlaysForPlan(plan: DailyPlan, config: AdaptiveConfig) {
  val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  plan.items.forEach { item ->
    when (item.type) {
      "meal" -> scheduleMealReminder(item, alarmManager)
      "exercise" -> scheduleExerciseReminder(item, alarmManager)
      "hydration" -> scheduleHydrationReminder(item, alarmManager)
    }
  }

  // Schedule adaptive midnight rollover (at learned day boundary from logs)
  scheduleMidnightRollover(config.derived.dayBoundary, alarmManager)
}
```

---

### 4.2 Notification Service

**File**: `src/services/notificationService.ts` (enhanced)

**Smart Notification Logic (Respects Learned Patterns)**:
```typescript
async function scheduleNotification(item: PlanItem) {
  const config = await getAdaptiveConfig();

  // Skip if in learned sleep window (from sleep_sessions_v2)
  if (isInSleepWindow(item.scheduledTime, config.patterns.primarySleep)) {
    return;
  }

  // Skip if in learned work hours (from activity patterns)
  if (isInWorkHours(item.scheduledTime, config.patterns.workSchedule) &&
      item.priority !== 'high') {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: item.title,
      body: item.description,
    },
    trigger: {
      date: new Date(item.scheduledTime),
    },
  });
}
```

---

### 4.3 Widget Service

**File**: `BodyModeWidgetProvider.kt` (existing, enhanced)

**Widget Update Triggers**:
- Plan generated/refined
- Item completed
- Energy level changed
- Time-based update (every 30 minutes during waking hours)

**Widget Content**:
- Next 3 upcoming items
- Daily progress (% completed)
- Energy level
- Carry-over item count
- Learning state indicator

---

## Layer 5: Presentation Layer (UI)

### 5.1 Home Screen

**File**: `src/screens/HomeScreen.tsx` (enhanced)

**Sections**:
1. **Today's Plan** (timeline view with learned pattern indicators)
2. **Quick Actions** (log food, complete item, manual log)
3. **Progress Summary** (circular progress, streak)
4. **Camera Vision Shortcut** (quick food log)
5. **Learning State Badge** ("Learning...", "Patterns locked ✓")

**Event Subscriptions**:
```typescript
useEffect(() => {
  const unsubscribe = planEventService.on('PLAN_REFINED', (event) => {
    // Reload plan
    loadPlan();
  });

  return unsubscribe;
}, []);
```

---

### 5.2 Camera Vision Screen

**File**: `src/screens/CameraVisionScreen.tsx` (new)

**Flow**:
1. User taps camera button
2. Camera opens
3. User takes photo
4. Loading state (analyzing with Gemini...)
5. Show results (food ID + macros)
6. User confirms or edits
7. Save to food_logs_v2 (DATABASE)
8. Navigate back to home (plan auto-refined)

**UI**:
```tsx
<View>
  <Image source={{ uri: capturedImage }} />
  <Text>Detected: {foodLog.detectionResults.primary}</Text>
  <Text>Also: {foodLog.detectionResults.secondary.join(', ')}</Text>
  <MacroDisplay macros={foodLog.estimatedMacros} />
  <Text>Confidence: {foodLog.estimatedMacros.confidence}%</Text>
  <Button onPress={confirmAndSave}>Log to Database</Button>
</View>
```

---

### 5.3 Settings Screen - Adaptive Config Viewer

**File**: `src/screens/SettingsScreen.tsx` (enhanced)

**New Section**: "Your Learned Patterns (from your logs)"

```tsx
<View>
  <Text style={styles.header}>Patterns Learned from Your Data</Text>

  <Section title="Sleep Pattern">
    <Text>Source: {config.patterns.primarySleep.dataPoints} sleep sessions logged</Text>
    <Text>Bedtime: {config.patterns.primarySleep.bedtime}</Text>
    <Text>Wake Time: {config.patterns.primarySleep.wakeTime}</Text>
    <Text>Confidence: {config.patterns.primarySleep.confidence}%</Text>
  </Section>

  <Section title="Work Schedule">
    <Text>Source: Sleep + activity logs</Text>
    <Text>Type: {config.patterns.workSchedule.type}</Text>
    <Text>Hours: {config.patterns.workSchedule.workStart} - {workEnd}</Text>
    <Text>Confidence: {config.patterns.workSchedule.confidence}%</Text>
  </Section>

  <Section title="Meal Windows">
    <Text>Source: {foodLogCount} meals logged</Text>
    <Text>Breakfast: {config.patterns.mealWindows.breakfast.start} - {end}</Text>
    <Text>Lunch: {config.patterns.mealWindows.lunch.start} - {end}</Text>
    <Text>Dinner: {config.patterns.mealWindows.dinner.start} - {end}</Text>
  </Section>

  <Section title="Exercise Habits">
    <Text>Source: {activityLogCount} workouts logged</Text>
    <Text>Preferred Time: {config.patterns.exerciseWindow.preferredTime}</Text>
    <Text>Typical Start: {config.patterns.exerciseWindow.start}</Text>
    <Text>Duration: {config.patterns.exerciseWindow.duration} min</Text>
  </Section>

  <Text>Learning State: {config.learningState}</Text>
  <Text>Total Data Points: {config.dataPointCount} sleep sessions</Text>

  <Button onPress={triggerRelearning}>Re-analyze My Logs</Button>
</View>
```

---

## Service Architecture Details

### Service Interaction Map

```
┌──────────────────────────────────────────────────────────────────┐
│                      React Native Layer                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ HomeScreen   │  │ CameraScreen │  │ SettingsScreen│         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│  ┌──────────────────────────────────────────────────┐          │
│  │         planEventService (Event Bus)             │          │
│  └──────────────────────────────────────────────────┘          │
│         │                  │                  │                  │
│  ┌──────▼──────┐  ┌────────▼────────┐  ┌─────▼──────┐          │
│  │ planGeneration│ │ cameraVision    │  │ adaptive   │          │
│  │ Service      │  │ Service (Gemini)│  │ ConfigService│        │
│  └──────┬───────┘  └────────┬────────┘  └─────┬──────┘          │
│         │                    │                  │                 │
│  ┌──────▼──────────┐  ┌─────▼─────────┐  ┌────▼────────┐       │
│  │ planRefinement  │  │ pattern       │  │ sleepService │       │
│  │ Service         │  │ Analyzer (LLM)│  │              │       │
│  └──────┬──────────┘  └─────┬─────────┘  └────┬────────┘       │
│         │                    │                  │                 │
│         ▼                    ▼                  ▼                 │
│  ┌─────────────────────────────────────────────────┐            │
│  │         AsyncStorage (Local Database)            │            │
│  │  - sleep_sessions_v2 (90 days)                   │            │
│  │  - food_logs_v2 (30 days)                        │            │
│  │  - activity_logs_v2 (90 days)                    │            │
│  │  - adaptive_config_v2 (learned patterns)         │            │
│  │  - current_plan_v2 (today's plan)                │            │
│  └─────────────────────────────────────────────────┘            │
└─────────┼────────────────────┼──────────────────┼─────────────────┘
          │                    │                  │
          ▼                    ▼                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Native Android Layer                        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Overlay      │  │ Sleep/Wake   │  │ Midnight     │          │
│  │ WindowService│  │ Detection    │  │ PlanReceiver │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### Sleep Intelligence Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  SLEEP INTELLIGENCE PIPELINE (Log-Based Learning)               │
│                                                                 │
│  Sensors (accelerometer, Activity Recognition, charging, screen)│
│     ↓                                                           │
│  SleepWakeDetectionService.kt (signal fusion)                  │
│     ↓                                                           │
│  State Machine (AWAKE → PENDING → CONFIRMED → WAKE)            │
│     ↓                                                           │
│  Create SleepSession object with all signals                   │
│     ↓                                                           │
│  Store to sleep_sessions_v2 in AsyncStorage (DATABASE)         │
│     ↓                                                           │
│  Trigger pattern analysis (if conditions met)                  │
│     ↓                                                           │
│  patternAnalyzer.ts loads sleep_sessions_v2 (last 90 days)     │
│     ↓                                                           │
│  Send logs to Gemini: "Analyze THIS user's sleep patterns"     │
│     ↓                                                           │
│  LLM analyzes timestamps, durations, variance                  │
│     ↓                                                           │
│  LLM extracts:                                                 │
│   - Typical bedtime (median sleepTime from logs)              │
│   - Typical wake time (median wakeTime from logs)             │
│   - Consistency (stdDev of times)                              │
│   - Schedule type (standard/night shift from pattern)          │
│     ↓                                                           │
│  Update adaptive_config_v2 with learned patterns               │
│     ↓                                                           │
│  Calculate derived values:                                     │
│   - dayBoundary = sleep midpoint + 12h                         │
│   - rolloverThreshold = bedtime - 3h                           │
│     ↓                                                           │
│  Reschedule midnight rollover alarm to new dayBoundary         │
│     ↓                                                           │
│  Emit ADAPTIVE_CONFIG_UPDATED event                            │
│     ↓                                                           │
│  UI updates to show learned patterns                           │
└─────────────────────────────────────────────────────────────────┘
```

---

### Camera Vision Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  CAMERA FOOD LOGGING PIPELINE (Using Existing LLM)              │
│                                                                 │
│  User taps camera button                                       │
│     ↓                                                           │
│  CameraVisionScreen.tsx opens camera                           │
│     ↓                                                           │
│  User captures image                                           │
│     ↓                                                           │
│  Convert to base64                                             │
│     ↓                                                           │
│  Call geminiService.analyzeMedia()                             │
│  (EXISTING FUNCTION - geminiService.ts lines 625-669)          │
│   - Already handles Gemini Vision API call                     │
│   - Already includes retry logic & model fallback              │
│   - Already validates with FOOD_SCHEMA                         │
│   - Already integrates user context                            │
│     ↓                                                           │
│  Returns FoodAnalysisResult:                                   │
│   {                                                            │
│     foodName: "grilled chicken breast",                        │
│     ingredients: ["chicken", "seasoning"],                     │
│     macros: { calories, protein, carbs, fat, vitamins },       │
│     healthGrade: "A",                                          │
│     confidence: "High",                                        │
│     advice: "..."                                              │
│   }                                                            │
│     ↓                                                           │
│  Transform FoodAnalysisResult → FoodLog format                 │
│     ↓                                                           │
│  Store to food_logs_v2 in AsyncStorage (DATABASE)              │
│     ↓                                                           │
│  Trigger planRefinementService.handleFoodLog()                 │
│     ↓                                                           │
│  Adjust remaining daily macros in current plan                 │
│     ↓                                                           │
│  Check if pattern re-analysis needed (enough new logs?)        │
│     ↓                                                           │
│  If yes: LLM re-analyzes food_logs_v2 for meal windows         │
│     ↓                                                           │
│  Emit FOOD_LOGGED event                                        │
│     ↓                                                           │
│  Navigate back to HomeScreen (shows updated plan)              │
└─────────────────────────────────────────────────────────────────┘
```

---

### Plan Generation & Refinement Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  PLAN GENERATION & REFINEMENT PIPELINE (Pattern-Driven)         │
│                                                                 │
│  TRIGGER (wake / midnight / boot / network / manual)           │
│     ↓                                                           │
│  planGenerationService.generateDailyPlan()                     │
│     ↓                                                           │
│  Load adaptive_config_v2 (PATTERNS FROM YOUR LOGS)             │
│   - Sleep window from sleep_sessions_v2                        │
│   - Meal windows from food_logs_v2                             │
│   - Exercise window from activity_logs_v2                      │
│   - Work schedule from combined logs                           │
│     ↓                                                           │
│  Load carry_over_items (from yesterday)                        │
│     ↓                                                           │
│  Load user_profile (goals, restrictions)                       │
│     ↓                                                           │
│  Get current_context (time, energy, location)                  │
│     ↓                                                           │
│  Build LLM prompt:                                             │
│   "Generate plan using THESE learned patterns:                 │
│    - Breakfast at 7:15 (from food logs)                        │
│    - Exercise at 6:00 AM (from activity logs)                  │
│    - Work hours 9-5 (from sleep+activity patterns)"            │
│     ↓                                                           │
│  Call Gemini Flash (or fallback to rule-based)                 │
│     ↓                                                           │
│  Parse generated DailyPlan JSON                                │
│     ↓                                                           │
│  Validate: items scheduled within learned windows?             │
│     ↓                                                           │
│  Save to AsyncStorage (current_plan_v2)                        │
│     ↓                                                           │
│  Schedule overlays at learned times                            │
│     ↓                                                           │
│  Update widget                                                 │
│     ↓                                                           │
│  Emit PLAN_GENERATED event                                     │
│     ↓                                                           │
│  UI updates (HomeScreen shows new plan)                        │
│                                                                 │
│  ┌─ REAL-TIME REFINEMENT LOOP ──────────────────────┐         │
│  │                                                   │         │
│  │  User logs food via camera                       │         │
│  │     ↓                                             │         │
│  │  planRefinementService.handleFoodLog()           │         │
│  │     ↓                                             │         │
│  │  Mark planned meal as completed                  │         │
│  │     ↓                                             │         │
│  │  Store actual macros                             │         │
│  │     ↓                                             │         │
│  │  Calculate remaining daily macros                │         │
│  │     ↓                                             │         │
│  │  If significantly over/under: refine via LLM     │         │
│  │     ↓                                             │         │
│  │  Save updated plan                               │         │
│  │     ↓                                             │         │
│  │  Emit PLAN_REFINED event                         │         │
│  │     ↓                                             │         │
│  │  UI updates (shows adjusted plan)                │         │
│  │                                                   │         │
│  └───────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

---

## State Machines

### Learning State Machine

```
┌──────────────────────────────────────────────────────────────────┐
│  LEARNING STATE MACHINE (Data-Driven Confidence)                │
│                                                                  │
│  BOOTSTRAPPING (0-6 sleep sessions logged)                      │
│    - Analyze on every wake event                                │
│    - Low confidence patterns (<60%)                             │
│    - Use conservative defaults                                  │
│    - Show "Learning your patterns..." UI                        │
│    - Data source: sleep_sessions_v2 (insufficient)              │
│         │                                                        │
│         ▼ (7+ sessions logged)                                  │
│  ACTIVE_LEARNING (7-30 sessions)                                │
│    - Analyze on every wake event                                │
│    - Medium confidence patterns (60-80%)                        │
│    - Start applying learned patterns (if confidence >70%)       │
│    - Show "Still learning..." UI with data count                │
│    - Data source: sleep_sessions_v2 (growing)                   │
│         │                                                        │
│         ▼ (31+ sessions logged)                                 │
│  MATURE (31+ sessions, no drift)                                │
│    - Analyze every 24 hours (not every wake)                    │
│    - High confidence patterns (>80%)                            │
│    - Fully apply learned patterns                               │
│    - Show "Patterns locked in ✓" UI                             │
│    - Data source: sleep_sessions_v2 (90-day rolling window)     │
│         │                                                        │
│         ▼ (schedule drift detected from logs)                   │
│  DRIFT_DETECTED                                                  │
│    - Recent logs show >2 hour shift for 3+ days                 │
│    - Re-enter ACTIVE_LEARNING                                   │
│    - Show "Detected schedule change, re-learning..." UI         │
│    - Analyze on every wake event again                          │
│    - Apply higher weight to recent logs                         │
│         │                                                        │
│         ▼ (new patterns stabilize in logs)                      │
│  MATURE (return to mature state with new patterns)              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### Day Lifecycle State Machine

```
┌──────────────────────────────────────────────────────────────────┐
│  DAY LIFECYCLE STATE MACHINE (Adaptive Boundaries from Logs)    │
│                                                                  │
│  SLEEPING (user in sleep state)                                 │
│    - No overlays/notifications                                  │
│    - Sleep session being recorded                               │
│    - Will store to sleep_sessions_v2 on wake                    │
│         │                                                        │
│         ▼ (wake event detected)                                 │
│  PLAN_GENERATION (morning, just woke)                           │
│    - Show "Generating your day..." overlay                      │
│    - Load adaptive_config_v2 (patterns from logs)               │
│    - Load carry_over_items (from yesterday)                     │
│    - Call LLM with learned patterns                             │
│    - Schedule overlays for the day                              │
│         │                                                        │
│         ▼ (plan ready)                                          │
│  ACTIVE_DAY (executing plan)                                    │
│    - Overlays fire at learned times                             │
│    - User logs activities → stored to databases                 │
│    - Real-time plan refinement                                  │
│    - Progress tracking                                          │
│         │                                                        │
│         ▼ (rollover threshold reached from learned bedtime)     │
│  ROLLOVER_WINDOW (late evening)                                 │
│    - Threshold = learned bedtime - 3h (from adaptive_config)    │
│    - Mark incomplete items                                      │
│    - Prepare carry-over candidates                              │
│    - Continue accepting logs                                    │
│         │                                                        │
│         ▼ (adaptive day boundary from learned sleep midpoint)   │
│  MIDNIGHT_ROLLOVER (day transition)                             │
│    - Boundary = learned sleep midpoint + 12h                    │
│    - Execute handleMidnightRollover()                           │
│    - Store carry_over_items                                     │
│    - Clear yesterday's plan                                     │
│    - Trigger pattern re-analysis if enough new logs             │
│         │                                                        │
│         ▼ (if user still awake)                                 │
│  ACTIVE_DAY (new day starts)                                    │
│                                                                  │
│  OR                                                              │
│         │                                                        │
│         ▼ (if user already sleeping)                            │
│  SLEEPING (wait for wake event to generate plan)                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Complete TypeScript Interfaces

```typescript
// ============================================================================
// SLEEP DOMAIN (Database: sleep_sessions_v2)
// ============================================================================

interface SleepSession {
  id: string;
  sleepTime: number; // Unix timestamp
  wakeTime: number;  // Unix timestamp
  duration: number;  // milliseconds
  confidence: number; // 0-100 (sensor fusion confidence)
  signals: {
    wasCharging: boolean;
    wasFlatOnSurface: boolean;
    wasStill: boolean;
    screenWasOff: boolean;
    inLearnedWindow: boolean;
  };
  metadata: {
    timezone: string;
    deviceModel: string;
    osVersion: string;
  };
}

// LLM extracts from this: bedtime, wake time, consistency, schedule type

// ============================================================================
// FOOD DOMAIN (Database: food_logs_v2)
// ============================================================================

interface FoodLog {
  id: string;
  timestamp: number; // When meal was eaten
  imageUri: string; // local file path
  imageSize: number; // bytes
  detectionResults: {
    primary: string; // from Gemini Vision
    secondary: string[]; // from Gemini Vision
    confidence: number; // Gemini's confidence
  };
  estimatedMacros: {
    calories: number; // from Gemini Vision
    protein: number;
    carbs: number;
    fat: number;
    confidence: number; // Gemini's portion confidence
  };
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unknown';
  context: {
    location?: string;
    linkedPlanItemId?: string;
  };
}

// LLM extracts from this: meal time windows, macro preferences, eating patterns

// ============================================================================
// ACTIVITY DOMAIN (Database: activity_logs_v2)
// ============================================================================

interface ActivityLog {
  id: string;
  timestamp: number;
  type: 'exercise' | 'meditation' | 'water' | 'custom';
  title: string;
  duration?: number;
  completed: boolean;
  intensity?: 'low' | 'medium' | 'high';
  metadata: {
    linkedPlanItemId?: string;
    notes?: string;
  };
}

// LLM extracts from this: exercise window, meditation habits, productivity peaks

// ============================================================================
// PATTERN LEARNING DOMAIN (Extracted from Logs)
// ============================================================================

interface TimeWindow {
  start: string; // "HH:mm"
  end: string;
  confidence: number;
  extractedFrom: 'food_logs_v2' | 'activity_logs_v2' | 'sleep_sessions_v2';
  dataPointCount: number; // how many logs contributed
}

interface LearnedPatterns {
  primarySleep: {
    bedtime: string; // extracted from sleep_sessions_v2
    wakeTime: string;
    confidence: number;
    stdDeviation: number;
    extractedFrom: 'sleep_sessions_v2';
    dataPointCount: number;
  };
  workSchedule: {
    type: 'standard' | 'night_shift' | 'rotating' | 'irregular';
    workStart: string;
    workEnd: string;
    confidence: number;
    extractedFrom: 'sleep_sessions_v2 + activity_logs_v2';
  };
  mealWindows: {
    breakfast: TimeWindow; // extracted from food_logs_v2 where mealType='breakfast'
    lunch: TimeWindow;
    dinner: TimeWindow;
  };
  exerciseWindow: {
    preferredTime: 'morning' | 'afternoon' | 'evening';
    start: string;
    duration: number;
    confidence: number;
    extractedFrom: 'activity_logs_v2';
    dataPointCount: number;
  };
}

interface AdaptiveConfig {
  version: number;
  lastAnalyzed: number;
  learningState: 'BOOTSTRAPPING' | 'ACTIVE_LEARNING' | 'MATURE' | 'DRIFT_DETECTED';
  dataPointCount: number; // total sleep sessions analyzed

  patterns: LearnedPatterns; // ALL FROM YOUR LOGS

  derived: {
    dayBoundary: string; // calculated from learned sleep midpoint
    rolloverThreshold: string; // calculated from learned bedtime
  };

  dataSources: {
    sleepSessions: number; // count in sleep_sessions_v2
    foodLogs: number; // count in food_logs_v2
    activityLogs: number; // count in activity_logs_v2
  };
}

// ============================================================================
// PLANNING DOMAIN (Generated from Patterns)
// ============================================================================

interface PlanItem {
  id: string;
  type: 'meal' | 'exercise' | 'hydration' | 'meditation' | 'custom';
  title: string;
  description: string;
  scheduledTime: string; // ISO timestamp (from learned patterns)
  duration: number;
  macros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  priority: 'high' | 'medium' | 'low';
  isCarryOver: boolean;
  completed: boolean;
  actualMacros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  createdAt: number;
  scheduledFromPattern?: {
    source: 'learned_meal_window' | 'learned_exercise_window' | 'carry_over';
    confidence: number;
  };
}

interface DailyPlan {
  id: string;
  date: string; // "YYYY-MM-DD"
  generatedAt: number;
  generatedBy: 'wake' | 'midnight' | 'boot' | 'network' | 'manual';
  items: PlanItem[];
  dailyGoals: {
    totalCalories: number;
    protein: number;
    carbs: number;
    fat: number;
    water: number;
  };
  metadata: {
    learnedPatternsVersion: number; // adaptive_config.version used
    carryOverCount: number;
    basedOnDataPoints: {
      sleepSessions: number;
      foodLogs: number;
      activityLogs: number;
    };
  };
}

// ============================================================================
// EVENT DOMAIN
// ============================================================================

type PlanEvent =
  | { type: 'PLAN_GENERATED'; plan: DailyPlan; trigger: string }
  | { type: 'PLAN_REFINED'; reason: string; [key: string]: any }
  | { type: 'ADAPTIVE_CONFIG_UPDATED'; config: AdaptiveConfig }
  | { type: 'FOOD_LOGGED'; foodLog: FoodLog }
  | { type: 'SLEEP_SESSION_RECORDED'; session: SleepSession }
  | { type: 'ACTIVITY_LOGGED'; activity: ActivityLog }
  | { type: 'MIDNIGHT_ROLLOVER'; carryOverCount: number; nextDayBoundary: string }
  | { type: 'PATTERN_REANALYSIS_TRIGGERED'; reason: string }
  | { type: 'ITEM_COMPLETED'; itemId: string }
  | { type: 'ITEM_SNOOZED'; itemId: string; snoozeUntil: number };

// ============================================================================
// CONTEXT DOMAIN
// ============================================================================

interface CurrentContext {
  time: number;
  location: 'home' | 'work' | 'commute' | 'unknown';
  energy: number; // 0-100
  networkConnected: boolean;
  batteryLevel: number;
}
```

---

## LLM Integration Strategy

### Multi-Tier Fallback Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  LLM INTEGRATION TIERS                                          │
│                                                                 │
│  TIER 1: Gemini 3 Pro (gemini-3-pro-preview)                   │
│    USE FOR:                                                     │
│    - Pattern analysis (complex reasoning)                      │
│    - Drift detection                                           │
│    - Schedule type classification                              │
│    INPUT: JSON dump of YOUR logs (90 days)                     │
│    OUTPUT: Extracted patterns with confidence                  │
│    Cost: $$$ | Speed: Medium | Quality: Highest                │
│         │                                                       │
│         ▼ (if API fails or offline)                            │
│  TIER 2: Gemini Flash (gemini-flash-latest)                    │
│    USE FOR:                                                     │
│    - Plan generation (using learned patterns)                  │
│    - Plan refinement                                           │
│    - Unplanned meal handling                                   │
│    - Camera vision (food ID + macros)                          │
│    INPUT: adaptive_config patterns + user profile              │
│    OUTPUT: Personalized daily plan                             │
│    Cost: $ | Speed: Fast | Quality: High                       │
│         │                                                       │
│         ▼ (if API fails or offline)                            │
│  TIER 3: Gemini Flash Lite (gemini-flash-lite-latest)          │
│    USE FOR:                                                     │
│    - Simple plan generation                                    │
│    - Basic refinement                                          │
│    INPUT: adaptive_config patterns (simplified)                │
│    OUTPUT: Basic daily plan                                    │
│    Cost: ¢ | Speed: Very Fast | Quality: Good                 │
│         │                                                       │
│         ▼ (if all API fails or offline)                        │
│  TIER 4: Rule-Based Fallback (local, NO LLM)                   │
│    USE WHEN: Completely offline, no network                    │
│    INPUT: adaptive_config (if exists) OR defaults              │
│    PROCESS:                                                     │
│    - Template-based plan generation                            │
│    - Use learned meal windows if available                     │
│    - Simple macro math                                         │
│    - No pattern learning                                       │
│    OUTPUT: Template plan (personalized if patterns exist)      │
│    Cost: Free | Speed: Instant | Quality: Basic               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### LLM Call Optimization

**Caching Strategy**:
- Cache pattern analysis results for 24 hours (MATURE state)
- Cache plan generation results for same input hash
- Cache Gemini Vision results by image hash

**Batching Strategy**:
- Batch multiple food logs before refining plan
- Combine pattern analysis + plan generation (single LLM call)

**Cost Optimization**:
- Use Flash for plan generation (not Pro)
- Use Flash Lite for simple refinements
- Only use Pro for pattern analysis
  - BOOTSTRAPPING/ACTIVE_LEARNING: on every wake
  - MATURE: once per week
- Compress images to max 1MB before Gemini Vision

**Estimated Monthly Costs** (per user):
- Pattern analysis: 4-8 Pro calls/month = $0.02
- Plan generation: 30 Flash calls/month = $0.03
- Food vision: 90 Flash Vision calls/month = $0.09
- **Total: ~$0.14/user/month**

---

## Pattern Learning Deep Dive

### Data Collection → Pattern Extraction Mapping

| User Action | Data Collected | Stored To | LLM Analyzes | Pattern Extracted |
|------------|----------------|-----------|--------------|-------------------|
| **User sleeps** | Sleep/wake timestamps, duration, signals | sleep_sessions_v2 | Median bedtime, wake time, variance | Primary sleep window, schedule type |
| **User logs breakfast** | Food photo → Gemini Vision | food_logs_v2 with mealType='breakfast', timestamp | All breakfast timestamps | Breakfast window (start, end, confidence) |
| **User logs lunch** | Food photo → Gemini Vision | food_logs_v2 with mealType='lunch', timestamp | All lunch timestamps | Lunch window |
| **User logs dinner** | Food photo → Gemini Vision | food_logs_v2 with mealType='dinner', timestamp | All dinner timestamps | Dinner window |
| **User exercises** | Manual log or plan completion | activity_logs_v2 with type='exercise', timestamp, duration | All exercise timestamps | Exercise window, preferred time, duration |
| **User meditates** | Manual log or plan completion | activity_logs_v2 with type='meditation' | All meditation sessions | Meditation habits |
| **User completes tasks** | Plan item completion | Plan completion logs with timestamp | Completion times by hour | Productivity peaks |
| **User travels** | Sleep sessions with timezone metadata | sleep_sessions_v2 with new timezone | Detect schedule shift >2h for 3+ days | Drift detected → Re-learn |

### Recency Weighting Algorithm

```typescript
function applySlidingWindowWeights<T extends { timestamp: number }>(
  logs: T[],
  windowDays: number = 90
): WeightedLog<T>[] {
  const now = Date.now();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  return logs.map(log => {
    // Age in days
    const age = (now - log.timestamp) / (24 * 60 * 60 * 1000);

    // Exponential decay: recent logs weighted higher
    // weight = e^(-age/30), so:
    // - Day 0: weight = 1.0
    // - Day 30: weight = 0.37
    // - Day 60: weight = 0.14
    // - Day 90: weight = 0.05
    const weight = Math.exp(-age / 30);

    return {
      ...log,
      weight,
      age,
    };
  });
}
```

### Pattern Confidence Calculation

```typescript
function calculatePatternConfidence(
  dataPoints: number,
  variance: number,
  recencyScore: number
): number {
  // More data = higher confidence (cap at 40 points)
  const dataConfidence = Math.min(dataPoints * 2, 40);

  // Lower variance = higher confidence (cap at 40 points)
  const consistencyConfidence = Math.max(0, 40 - (variance / 10));

  // Recency score (recent data analysis = higher confidence, cap at 20 points)
  const recencyConfidence = recencyScore * 20;

  return Math.min(100, dataConfidence + consistencyConfidence + recencyConfidence);
}
```

---

## Performance & Optimization

### AsyncStorage Optimization

**Data Structure**:
```
sleep_sessions_v2: Array<SleepSession> (last 90 days, ~90 items)
food_logs_v2: Array<FoodLog> (last 30 days, ~90 items)
activity_logs_v2: Array<ActivityLog> (last 90 days, ~270 items)
adaptive_config_v2: AdaptiveConfig (single object)
current_plan_v2: DailyPlan (single object)
carry_over_items: Array<PlanItem> (small, <10 items)
```

**Auto-Pruning**:
```typescript
async function pruneSleepSessions() {
  const sessions = await loadSleepSessions();
  const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days ago
  const pruned = sessions.filter(s => s.wakeTime > cutoff);
  await AsyncStorage.setItem('sleep_sessions_v2', JSON.stringify(pruned));
}
```

- Sleep sessions: Keep 90 days, delete older on each write
- Food logs: Keep 30 days, delete older on each write
- Activity logs: Keep 90 days, delete older on each write
- Plans: Keep 7 days for history, delete older

---

### Network Optimization

**Offline-First**:
- Store all data locally first (AsyncStorage)
- LLM calls use locally stored data
- Plans generated from local adaptive_config
- Sync to cloud later (if implemented)

**Image Optimization**:
- Compress images to max 1MB before Gemini Vision upload
- Cache Gemini Vision results by image hash locally
- Delete old food images (>30 days)

---

### Battery Optimization

**Sleep Detection**:
- Use `setExactAndAllowWhileIdle()` for critical alarms
- Batch sensor readings (not every second)
- Use Activity Recognition (Google Play Services, battery-optimized)

**LLM Calls**:
- BOOTSTRAPPING/ACTIVE_LEARNING: Analyze on wake (daily)
- MATURE: Analyze once per week
- Batch multiple operations in single call
- Use Flash Lite for simple tasks

---

## User Experience Journey

### Day 1: First Launch

```
User installs app
  ↓
Onboarding: "Body Mode learns YOUR schedule from YOUR logged data"
  ↓
Request permissions (sleep detection, camera, notifications)
  ↓
Initial profile setup (age, goals, dietary restrictions)
  ↓
Start sleep detection service
  ↓
Show BOOTSTRAPPING UI: "I'm collecting your sleep data.
  For the next few days, I'll use safe defaults while I learn YOUR patterns."
  ↓
Generate first plan (rule-based template, conservative)
  ↓
User sleeps tonight → First sleep session logged to database
```

---

### Days 2-7: Bootstrapping

```
Every morning:
  ↓
Sleep session recorded overnight → stored to sleep_sessions_v2
  ↓
Pattern analyzer triggered (BOOTSTRAPPING state)
  ↓
Load 3-6 sleep sessions from database
  ↓
Send to Gemini: "Analyze THESE sleep sessions"
  ↓
Low confidence patterns returned (insufficient data)
  ↓
Plan generated with partial learned patterns:
  - Breakfast time might be learned (if user logged 3+ meals)
  - Work schedule still using defaults
  ↓
UI shows: "Learning... (3/7 sleep sessions, 8 meals logged)"
  ↓
User uses camera to log breakfast → stored to food_logs_v2
  ↓
Plan refines in real-time
  ↓
User logs exercise → stored to activity_logs_v2
```

---

### Days 8-30: Active Learning

```
Confidence increasing:
  ↓
Pattern analyzer has 15 sleep sessions, 40 meals, 20 exercises
  ↓
Send all logs to Gemini for analysis
  ↓
Gemini returns:
  - Bedtime: 22:45 ±30 min (confidence: 78%)
  - Wake time: 06:30 ±20 min (confidence: 82%)
  - Breakfast window: 07:00-08:00 (confidence: 85%)
  - Lunch window: 12:15-13:00 (confidence: 90%)
  - Exercise: morning, 07:00, 45min (confidence: 70%)
  ↓
UI shows: "Patterns getting clearer! (15 sleep sessions, 40 meals logged)"
  ↓
Plans now scheduled at learned times:
  - Breakfast at 7:15 (from YOUR food logs)
  - Lunch at 12:30 (from YOUR food logs)
  - Exercise at 7:00 AM (from YOUR activity logs)
  ↓
User notices: "Wow, it knows I'm a morning person!"
  ↓
Carry-over feature activates (items from last night appear in morning plan)
```

---

### Day 31+: Mature State

```
Patterns locked in (31+ sleep sessions):
  ↓
UI shows: "Your patterns are locked in ✓ (based on 35 sleep sessions, 90 meals)"
  ↓
Plans feel natural and personalized
  ↓
Pattern analysis reduces to weekly (battery savings)
  ↓
User travels to different timezone:
  ↓
Sleep schedule shifts (bedtime now 4 hours later for 3 nights)
  ↓
Drift detection triggered:
  - Gemini compares recent logs to adaptive_config
  - Detects >2 hour shift sustained 3+ days
  ↓
State changes: MATURE → DRIFT_DETECTED
  ↓
UI shows: "I noticed your schedule changed. Re-analyzing your data..."
  ↓
Re-enter ACTIVE_LEARNING
  ↓
Pattern analyzer uses higher weight on recent logs
  ↓
Adapt to new timezone within 7 days
  ↓
Return to MATURE with new patterns
```

---

### Day 90: Continuous Learning

```
90 days of data in rolling window:
  ↓
Database contains:
  - 90 sleep sessions
  - 270 meals
  - 180 activities
  ↓
Pattern analyzer sends all logs to Gemini
  ↓
Highly accurate patterns (confidence >90%):
  - Sleep: 22:40 ±15 min (stdDev very low)
  - Breakfast: 07:10-07:25 (very consistent)
  - Exercise: 6:50 AM, 50 min, 6 days/week
  ↓
System predicts user needs before they happen:
  - "You usually eat a snack around 3 PM, here's a suggestion" (from food log patterns)
  - "You tend to skip exercise on Fridays, shall I lighten the plan?" (from completion patterns)
  ↓
User feels: "This app knows me better than I know myself"
  ↓
All patterns come from THEIR logged data, nothing else
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
**Goal**: Set up data infrastructure and logging system

**Tasks**:
1. Create `sleep_sessions_v2` AsyncStorage schema
2. Modify `SleepWakeDetectionService` to store full sleep sessions (not just events)
3. Create `food_logs_v2` AsyncStorage schema
4. Create `activity_logs_v2` AsyncStorage schema
5. Create `adaptiveConfigService.ts` with data model
6. Implement auto-pruning for old logs (>90 days for sleep, >30 days for food)

**Deliverables**:
- Sleep sessions stored with all signals to database
- Food logs schema ready
- Activity logs schema ready
- Adaptive config initialized with defaults

**Test**:
- Sleep 3 nights, verify 3 sessions in sleep_sessions_v2
- Verify auto-pruning (manually inject 91-day-old session, verify deleted)
- Manually add food/activity logs, verify storage

---

### Phase 2: Pattern Learning (Week 2)
**Goal**: Implement LLM-powered pattern analysis from logs

**Tasks**:
1. Create `patternAnalyzer.ts` service
2. Build pattern analysis LLM prompt template (emphasize: analyze ONLY provided logs)
3. Implement `analyzePatterns()` function (loads from AsyncStorage)
4. Add 90-day recency weighting algorithm
5. Implement confidence calculation (based on data points + consistency)
6. Add drift detection logic (compare to previous patterns)
7. Implement learning state machine (BOOTSTRAPPING → ACTIVE → MATURE)
8. Add pattern analysis triggers (wake event, 24h timer, drift)

**Deliverables**:
- Pattern analysis working end-to-end
- Adaptive config updates on wake (if BOOTSTRAPPING/ACTIVE)
- Learning state transitions based on data count

**Test**:
- Manually create 10 sleep sessions with consistent pattern (bedtime 22:00, wake 06:00)
- Trigger pattern analysis
- Verify learned bedtime/wake time matches (22:00, 06:00 ±tolerance)
- Verify confidence scores increase with more data
- Manually inject shifted schedule (bedtime 02:00 for 4 days), verify drift detection

---

### Phase 3: Adaptive Planning (Week 3)
**Goal**: Use learned patterns from logs in plan generation

**Tasks**:
1. Modify `planGenerationService` to load adaptive_config
2. Update plan generation LLM prompt to include learned patterns with data sources
3. Implement adaptive day boundary calculation (sleep midpoint + 12h)
4. Update `MidnightPlanBridge.kt` to schedule at adaptive boundary (not fixed midnight)
5. Modify `handleMidnightRollover()` to use adaptive threshold
6. Update overlay scheduling to respect learned sleep window
7. Add pattern data source display in UI ("based on 30 meals logged")

**Deliverables**:
- Plans generated with learned meal/exercise windows
- Midnight rollover at adaptive boundary (e.g., 3 AM for night shift workers)
- Overlays respect learned sleep time (no notifications while sleeping)

**Test**:
- Manually create night shift pattern:
  - Sleep sessions: bedtime 08:00, wake 16:00
  - Food logs: breakfast at 16:30, lunch at 21:00, dinner at 02:00
- Trigger pattern analysis
- Verify day boundary shifts to 14:00 (sleep midpoint 12:00 + 12h)
- Verify midnight alarm rescheduled to 14:00 (not 00:00)
- Generate plan, verify breakfast scheduled at 16:30 (from food logs)

---

### Phase 4: Camera Food Logging (Week 4)
**Goal**: Implement automatic food logging using existing LLM infrastructure

**Tasks**:
1. Create `CameraVisionScreen.tsx`
2. **Use existing `geminiService.analyzeMedia()`** - NO new service needed
3. Implement food logging flow:
   - Capture image
   - Convert to base64
   - Call `geminiService.analyzeMedia()` (already exists!)
   - Transform `FoodAnalysisResult` to `FoodLog` format
4. Implement `food_logs_v2` storage with all metadata
5. Modify `planRefinementService` to handle food logs
6. Add camera shortcut to HomeScreen
7. Add food log display to plan items
8. Add "logged meal" indicator with actual macros vs planned

**Deliverables**:
- Camera capture working
- Integration with existing `geminiService.analyzeMedia()` function
- Food logs stored with estimated macros to database
- Plan refines in real-time when food logged
- Pattern re-analysis triggered when enough new food logs

**Test**:
- Take photo of chicken breast + rice + broccoli
- Verify Gemini Vision returns:
  - primary: "grilled chicken breast"
  - secondary: ["brown rice", "broccoli"]
  - estimatedMacros: { calories: ~400, protein: ~45, carbs: ~35, fat: ~10 }
  - confidence: >70%
- Verify stored to food_logs_v2
- Verify plan adjusts remaining daily budget
- Log 10 breakfast meals over 10 days
- Trigger pattern re-analysis
- Verify breakfast window learned from those 10 timestamps

---

### Phase 5: Polish & UI (Week 5)
**Goal**: Complete user experience with pattern transparency

**Tasks**:
1. Create "Your Learned Patterns" section in Settings
   - Show data sources ("based on 45 sleep sessions logged")
   - Show confidence scores
   - Show extracted patterns with timestamps
2. Add learning state UI indicators
   - BOOTSTRAPPING: "Collecting data... (3/7 sessions)"
   - ACTIVE_LEARNING: "Learning patterns... (15 sessions)"
   - MATURE: "Patterns locked in ✓ (90 sessions)"
3. Add drift detection notifications
4. Improve plan timeline visualization (show which items from learned patterns)
5. Add carry-over item badges
6. Add confidence indicators for patterns in UI
7. Add manual re-learning trigger ("Re-analyze my data")
8. Performance optimization (caching, batching)
9. Error handling and fallbacks (offline mode)
10. User testing and bug fixes

**Deliverables**:
- Complete UI showing learning progress with data counts
- Pattern transparency (user sees which logs contributed to which patterns)
- Polished plan visualization
- Robust error handling
- Production-ready system

**Test**:
- Full user journey (Day 1 → Day 90 simulation)
- Offline mode testing (verify rule-based fallback uses adaptive_config)
- LLM failure fallback testing
- Battery drain testing (<3% per day)
- Pattern transparency: User can see "Breakfast window from 30 meals logged"

---

## Success Metrics

### Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pattern confidence (Day 7) | >70% | AdaptiveConfig.patterns.*.confidence |
| Pattern confidence (Day 30) | >85% | AdaptiveConfig.patterns.*.confidence |
| LLM call success rate | >95% | API success / total calls |
| Fallback usage rate | <5% | Fallback calls / total calls |
| Battery drain | <3% / day | Android battery stats |
| Plan generation time | <5 seconds | Time from trigger to plan ready |
| Gemini Vision accuracy | >80% | Manual validation vs nutrition database |
| Sleep detection accuracy | >90% | Manual validation |
| Pattern extraction accuracy | >85% | Extracted bedtime vs actual median bedtime from logs |

---

### User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| User reports "feels personalized" | >80% | Survey |
| Carry-over items perceived useful | >70% | Survey |
| Camera food logging usage | >50% of meals | Usage analytics |
| Shift worker satisfaction | >75% | Survey (night shift users) |
| Learning time satisfaction | "Within 1 week" | Survey |
| Plan accuracy (items completed) | >60% | Completion rate |
| Pattern transparency satisfaction | >80% | Survey: "I understand where patterns come from" |

---

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| LLM cost per user per month | <$0.20 | API billing |
| 7-day retention | >60% | Analytics |
| 30-day retention | >40% | Analytics |
| Daily active usage | >70% | Analytics |
| Camera feature adoption | >50% | Feature usage |
| Average logs per user per week | >20 | Database analytics |

---

## Conclusion

This architecture creates a **100% data-driven, zero-assumption health planning system** that learns exclusively from YOUR logged behavior and adapts to any schedule—standard 9-5, night shift, rotating shifts, irregular freelancer hours, or frequent travelers.

### Key Innovations

1. **Adaptive Day Boundary from Logs**: Day starts when YOUR logged sleep midpoint + 12 hours says it does
2. **Continuous Learning from Your Data**: Perpetual 90-day rolling window of YOUR sleep_sessions, food_logs, activity_logs
3. **LLM-Powered Pattern Extraction**: Gemini analyzes YOUR logs to extract patterns—no templates, no external data
4. **Reuses Existing LLM Infrastructure**: Camera food logging uses existing `geminiService.analyzeMedia()`—no new services needed
5. **Complete Pattern Transparency**: User sees exactly which logs contributed to which patterns
6. **Offline-First with Learned Fallback**: Works offline using previously learned patterns from your data

### What This Solves

- ✅ Shift workers: System learns night shift schedule from sleep logs
- ✅ Travelers: Detects timezone changes from sleep log drift
- ✅ Irregular schedules: Learns from actual behavior, not assumptions
- ✅ No manual configuration: Everything learned from logged data
- ✅ Carry-over: Learns optimal rollover time from your bedtime pattern
- ✅ Camera food logging: Uses existing `geminiService.analyzeMedia()` function
- ✅ Pattern transparency: User understands "Breakfast at 7:15 from 40 meals logged"

### Data Flow Summary

```
User Behavior
    ↓
Sensors/Camera/Manual Input
    ↓
Stored to AsyncStorage (sleep_sessions_v2, food_logs_v2, activity_logs_v2)
    ↓
LLM analyzes logs (Gemini Pro/Flash)
    ↓
Patterns extracted (bedtime, meal windows, exercise habits)
    ↓
Stored to adaptive_config_v2
    ↓
Plan generated using learned patterns (Gemini Flash)
    ↓
User follows plan, logs activities
    ↓
New logs created → Loop repeats (continuous learning)
```

### Next Steps

1. **Implement Phase 1** (Foundation) - Set up logging infrastructure
2. **Implement Phase 2** (Pattern Learning) - LLM analysis of logs
3. **Implement Phase 3** (Adaptive Planning) - Use learned patterns
4. **Implement Phase 4** (Camera Food Logging) - Use existing `geminiService.analyzeMedia()`
5. **Implement Phase 5** (Polish) - Pattern transparency UI

---

**Document Version**: 2.0
**Last Updated**: 2025-01-15
**Author**: Claude (Sonnet 4.5) + User Vision
**Status**: Architecture Complete, Ready for Implementation
**Key Features**: Uses existing `geminiService.analyzeMedia()` for food analysis, 100% log-based pattern learning, adaptive scheduling from YOUR data
