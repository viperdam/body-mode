
import { UserProfile, FoodLogEntry, MoodLog, ActivityLogEntry, SleepSession, BioLoadAnalysis } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';

// This engine performs the "Deep Math" before sending data to Gemini.
// It translates raw logs into "Physiological States".

export const calculateBioLoad = (
    user: UserProfile,
    foodHistory: FoodLogEntry[],
    activityHistory: ActivityLogEntry[],
    moodHistory: MoodLog[],
    sleepHistory: {date: string, hours: number}[],
    context: { weatherCode: number; currentTime: string }
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

    // 3. Vitamin Analysis (Simple Heuristic based on food variety)
    // In a real app, this would sum up micronutrients from the database.
    // Here we deduce based on "Diversity" and "Tags".
    const vitaminWarnings: string[] = [];
    
    // Check for leafy greens or specific nutrient dense foods in recent logs (Text analysis simulation)
    const last3DaysFood = foodHistory.slice(-10); // Approx last 3 days
    const hasGreens = last3DaysFood.some(f => f.food.description.toLowerCase().includes('salad') || f.food.description.toLowerCase().includes('spinach') || f.food.foodName.toLowerCase().includes('green'));
    const hasFruit = last3DaysFood.some(f => f.food.healthGrade === 'A');
    
    if (!hasGreens) vitaminWarnings.push("Low Magnesium/Folate Risk (No Greens)");
    if (!hasFruit) vitaminWarnings.push("Low Vitamin C Risk");
    if (sleepDeficit > 2) vitaminWarnings.push("High Cortisol likely depleting Magnesium");

    // 4. Physical Fatigue
    // Based on recent Activity Logs vs Recovery (Sleep/Protein)
    let physicalFatigue = 0;
    const recentActivity = activityHistory.slice(-5);
    const totalBurn = recentActivity.reduce((acc, a) => acc + a.caloriesBurned, 0);
    
    physicalFatigue += (totalBurn / 500) * 10; // Scale burn to fatigue
    if (avgSleep < 6) physicalFatigue *= 1.5; // Lack of sleep multiplies physical fatigue

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
