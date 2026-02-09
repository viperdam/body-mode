import { UserProfile, WeightLogEntry } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';

type TargetMethod = 'formula' | 'ai' | 'manual';

export type DailyTargets = {
    calories: number;
    protein: number;
    waterMl: number;
    method: TargetMethod;
};

type RefreshOptions = {
    dateKey?: string;
    weightHistory?: WeightLogEntry[];
    force?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const resolveLatestWeight = (profile: UserProfile, history?: WeightLogEntry[]) => {
    if (history && history.length > 0) {
        const latest = history
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp)[0];
        if (latest?.weight && Number.isFinite(latest.weight)) return latest.weight;
    }
    return profile.weight || 70;
};

const resolveActivityFactor = (activityLevel: UserProfile['activityLevel'], workIntensity?: UserProfile['workProfile']['intensity']) => {
    const baseFactor = activityLevel === 'sedentary'
        ? 1.2
        : activityLevel === 'light'
            ? 1.375
            : activityLevel === 'active'
                ? 1.725
                : 1.55;
    const workBoost = workIntensity === 'heavy_labor' ? 0.1 : workIntensity === 'standing' ? 0.05 : 0;
    return baseFactor + workBoost;
};

const resolveGoalAdjustment = (goal: UserProfile['goal'], intensity: UserProfile['planIntensity']) => {
    if (goal === 'maintain') return 0;
    if (goal === 'lose') {
        return intensity === 'slow' ? -250 : intensity === 'aggressive' ? -500 : -400;
    }
    return intensity === 'slow' ? 200 : intensity === 'aggressive' ? 500 : 350;
};

const resolveProteinMultiplier = (goal: UserProfile['goal'], activityLevel: UserProfile['activityLevel'], workIntensity?: UserProfile['workProfile']['intensity']) => {
    let multiplier = goal === 'gain' ? 1.8 : goal === 'lose' ? 1.6 : 1.4;
    if (activityLevel === 'active' || workIntensity === 'heavy_labor') {
        multiplier += 0.1;
    }
    return clamp(multiplier, 1.2, 2.2);
};

export const computeDailyTargets = (profile: UserProfile, weightOverride?: number): DailyTargets => {
    const weight = weightOverride ?? profile.weight ?? 70;
    const height = profile.height ?? 170;
    const age = profile.age ?? 30;
    const genderOffset = profile.gender === 'male' ? 5 : -161;

    const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;
    const activityFactor = resolveActivityFactor(profile.activityLevel, profile.workProfile?.intensity);
    const goalAdjustment = resolveGoalAdjustment(profile.goal, profile.planIntensity);
    const calorieTarget = Math.round(bmr * activityFactor + goalAdjustment);

    const proteinTarget = Math.round(weight * resolveProteinMultiplier(profile.goal, profile.activityLevel, profile.workProfile?.intensity));
    const baseWater = weight * 35;
    const activityWaterBoost = profile.activityLevel === 'active' ? 400 : profile.activityLevel === 'moderate' ? 200 : 0;
    const waterTarget = Math.round(clamp(baseWater + activityWaterBoost, 1500, 4500));

    return {
        calories: clamp(calorieTarget, 1200, 4500),
        protein: clamp(proteinTarget, 60, 260),
        waterMl: waterTarget,
        method: 'formula',
    };
};

export const refreshTargetsForProfile = (
    profile: UserProfile,
    options: RefreshOptions = {}
): { profile: UserProfile; targets: DailyTargets; updated: boolean } => {
    const dateKey = options.dateKey || getLocalDateKey(new Date());
    const latestWeight = resolveLatestWeight(profile, options.weightHistory);
    const existingWeight = profile.targetsWeightKg ?? profile.weight;
    const weightDelta = existingWeight ? Math.abs(latestWeight - existingWeight) : 0;
    const needsRefresh =
        options.force ||
        profile.targetsDateKey !== dateKey ||
        weightDelta > 0.3 ||
        !profile.dailyProteinTarget ||
        !profile.dailyWaterTargetMl;

    const targets = computeDailyTargets(profile, latestWeight);

    if (!needsRefresh) {
        return { profile, targets, updated: false };
    }

    return {
        profile: {
            ...profile,
            dailyCalorieTarget: targets.calories,
            dailyProteinTarget: targets.protein,
            dailyWaterTargetMl: targets.waterMl,
            targetsUpdatedAt: Date.now(),
            targetsDateKey: dateKey,
            targetsWeightKg: latestWeight,
            targetsMethod: targets.method,
        },
        targets,
        updated: true,
    };
};

export default {
    computeDailyTargets,
    refreshTargetsForProfile,
};
