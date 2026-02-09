
import { UserProfile, FoodLogEntry, MoodLog, ActivityLogEntry, SleepSession, BioLoadAnalysis, BioSnapshot } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';
import { getDailyTargets } from './nutritionService';

// This engine performs the "Deep Math" before sending data to Gemini.
// It translates raw logs into "Physiological States".

export const calculateBioLoad = (
    user: UserProfile,
    foodHistory: FoodLogEntry[],
    activityHistory: ActivityLogEntry[],
    moodHistory: MoodLog[],
    sleepHistory: {date: string, hours: number}[],
    context: { weatherCode: number; currentTime: string },
    bioSnapshot?: BioSnapshot
): BioLoadAnalysis => {
    
    // 1. Calculate Neural Battery (Mental Energy)
    // Factors: Sleep debt (exponential decay), recent mood, vitamin B/Magnesium intake
    let neuralBattery = 100;
    
    // Sleep Impact (Last 3 days matter most)
    const recentSleep = sleepHistory.slice(-3);
    const avgSleep = recentSleep.reduce((acc, s) => acc + s.hours, 0) / (recentSleep.length || 1);
    const sleepTarget = user.sleepRoutine.targetDurationHours || 8;
    const sleepDeficit = sleepTarget - avgSleep;
    
    if (sleepDeficit > 0) {
        // Heavy penalty for chronic sleep deprivation
        neuralBattery -= (sleepDeficit * 12); 
    }

    // Social Drain
    let socialDrain = 0;
    if (user.childrenCount > 0) socialDrain += (user.childrenCount * 5); // Kids are draining!
    if (user.workProfile.intensity === 'heavy_labor' || user.workProfile.type === 'night_shift') {
        socialDrain += 15;
    }
    if (user.maritalStatus === 'partner' || user.maritalStatus === 'married') {
        // Marriage can be support or drain, generally we assume slight load for coordination
        socialDrain += 5;
    }
    neuralBattery -= socialDrain;

    // 2. Hormonal Load (Cortisol Proxy)
    // Factors: Fasting too long, High intensity late at night, Work stress
    let hormonalLoad = 20; // Base baseline
    
    if (user.medicalProfile.conditions.includes('Diabetes Type 2')) hormonalLoad += 20;
    if (user.workProfile.type === 'night_shift') hormonalLoad += 30; // Circadian disruption
    
    // Check Mood History (High stress logs)
    const recentMoods = moodHistory.slice(-5);
    const stressCount = recentMoods.filter(m => m.mood === 'stressed' || m.mood === 'sad').length;
    hormonalLoad += (stressCount * 10);

    // 3. Vitamin Analysis (Micronutrient-driven when available)
    const vitaminWarnings: string[] = [];

    const recentFood = foodHistory.slice(-15);
    const uniqueDates = Array.from(new Set(recentFood.map(f => getLocalDateKey(new Date(f.timestamp)))));
    const daysTracked = Math.max(1, Math.min(3, uniqueDates.length));

    let hasMicros = false;
    const microTotals: Record<string, number> = {
        vitaminC: 0,
        vitaminD: 0,
        vitaminB12: 0,
        magnesium: 0,
        iron: 0,
        omega3: 0,
        zinc: 0,
        vitaminB9: 0,
    };

    for (const entry of recentFood) {
        const micros = entry.food?.micronutrients;
        if (!micros) continue;
        hasMicros = true;
        for (const key of Object.keys(microTotals)) {
            const value = (micros as any)[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                microTotals[key] += value;
            }
        }
    }

    if (hasMicros) {
        const targets = getDailyTargets(user);
        const threshold = 0.6;
        const need = (key: keyof typeof microTotals) => (targets as any)[key] * daysTracked;

        if (microTotals.vitaminC < need('vitaminC') * threshold) {
            vitaminWarnings.push('Low Vitamin C intake');
        }
        if (microTotals.vitaminD < need('vitaminD') * threshold) {
            vitaminWarnings.push('Low Vitamin D intake');
        }
        if (microTotals.vitaminB12 < need('vitaminB12') * threshold) {
            vitaminWarnings.push('Low Vitamin B12 intake');
        }
        if (microTotals.magnesium < need('magnesium') * threshold) {
            vitaminWarnings.push('Low Magnesium intake');
        }
        if (microTotals.iron < need('iron') * threshold) {
            vitaminWarnings.push('Low Iron intake');
        }
        if (microTotals.omega3 < need('omega3') * threshold) {
            vitaminWarnings.push('Low Omega-3 intake');
        }
        if (microTotals.zinc < need('zinc') * threshold) {
            vitaminWarnings.push('Low Zinc intake');
        }
        if (microTotals.vitaminB9 < need('vitaminB9') * threshold) {
            vitaminWarnings.push('Low Folate intake');
        }
    } else {
        // Fallback heuristic when micronutrients are missing
        const hasGreens = recentFood.some(f => f.food.description.toLowerCase().includes('salad') || f.food.description.toLowerCase().includes('spinach') || f.food.foodName.toLowerCase().includes('green'));
        const hasFruit = recentFood.some(f => f.food.healthGrade === 'A');

        if (!hasGreens) vitaminWarnings.push("Low Magnesium/Folate Risk (No Greens)");
        if (!hasFruit) vitaminWarnings.push("Low Vitamin C Risk");
    }

    if (sleepDeficit > 2) vitaminWarnings.push("High Cortisol likely depleting Magnesium");

    // 4. Physical Fatigue
    // Based on recent Activity Logs vs Recovery (Sleep/Protein)
    let physicalFatigue = 0;
    const recentActivity = activityHistory.slice(-5);
    const totalBurn = recentActivity.reduce((acc, a) => acc + a.caloriesBurned, 0);
    
    physicalFatigue += (totalBurn / 500) * 10; // Scale burn to fatigue
    if (avgSleep < 6) physicalFatigue *= 1.5; // Lack of sleep multiplies physical fatigue

    // Bio-informed blending: when real sensor data is available, blend with heuristics
    if (bioSnapshot && bioSnapshot.source !== 'fallback') {
        const sensorWeight = bioSnapshot.freshness === 'live' ? 0.6
            : bioSnapshot.freshness === 'cached' ? 0.4 : 0.2;

        if (bioSnapshot.readinessScore !== undefined) {
            // Blend heuristic neural battery with sensor-based readiness
            neuralBattery = neuralBattery * (1 - sensorWeight) + bioSnapshot.readinessScore * sensorWeight;
        }

        if (bioSnapshot.stressIndex !== undefined) {
            // Blend heuristic hormonal load with sensor-based stress
            hormonalLoad = hormonalLoad * (1 - sensorWeight) + bioSnapshot.stressIndex * sensorWeight;
        }

        if (bioSnapshot.hrv !== undefined) {
            // Low HRV amplifies physical fatigue
            const hrvFactor = bioSnapshot.hrv < 30 ? 1.3 : bioSnapshot.hrv > 60 ? 0.8 : 1.0;
            physicalFatigue *= hrvFactor;
        }
    }

    // Clamping
    neuralBattery = Math.max(0, Math.min(100, neuralBattery));
    hormonalLoad = Math.max(0, Math.min(100, hormonalLoad));
    physicalFatigue = Math.max(0, Math.min(100, physicalFatigue));

    return {
        neuralBattery,
        hormonalLoad,
        physicalFatigue,
        vitaminStatus: vitaminWarnings,
        socialDrain
    };
};
