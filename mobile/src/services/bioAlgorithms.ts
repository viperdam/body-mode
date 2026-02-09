// Bio Algorithms - Trend computation and prompt formatting for bio-context pipeline

import type { BioSnapshot, BioTrend } from '../types';
import { ExerciseType } from 'react-native-health-connect';
import {
    formatBloodGlucoseMgDl,
    formatDistanceMeters,
    formatHydrationMl,
    formatTemperatureC,
    formatWeightKg,
} from '../utils/unitFormat';

type BioMetricKey = 'hrv' | 'restingHR' | 'spo2' | 'stressIndex' | 'readinessScore' | 'sleepScore' | 'vo2Max' | 'respiratoryRate';

const METRICS: BioMetricKey[] = [
    'hrv',
    'restingHR',
    'spo2',
    'stressIndex',
    'readinessScore',
    'sleepScore',
    'vo2Max',
    'respiratoryRate',
];

// Metrics where lower values indicate improvement
const LOWER_IS_BETTER: Set<BioMetricKey> = new Set(['stressIndex', 'restingHR', 'respiratoryRate']);

const humanizeExerciseKey = (key: string): string => {
    return key
        .split('_')
        .map(part => part.length <= 2
            ? part.toUpperCase()
            : part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
};

const EXERCISE_TYPE_KEYS: Record<number, string> = Object.entries(ExerciseType)
    .reduce<Record<number, string>>((acc, [key, value]) => {
        if (typeof value === 'number') {
            acc[value] = key.toLowerCase();
        }
        return acc;
    }, {});

const EXERCISE_TYPE_LABELS: Record<number, string> = Object.entries(ExerciseType)
    .reduce<Record<number, string>>((acc, [key, value]) => {
        if (typeof value === 'number') {
            acc[value] = humanizeExerciseKey(key);
        }
        return acc;
    }, {});

/**
 * Compute 7-day trends for each bio metric from snapshot history
 */
export const computeBioTrends = (history: BioSnapshot[]): BioTrend[] => {
    const trends: BioTrend[] = [];

    for (const metric of METRICS) {
        const values = history
            .map(s => s[metric])
            .filter((v): v is number => v !== undefined && v !== null && Number.isFinite(v));

        if (values.length < 3) continue;

        const recent = values.slice(-7);
        const prior = values.slice(-14, -7);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const priorAvg = prior.length >= 3
            ? prior.reduce((a, b) => a + b, 0) / prior.length
            : undefined;

        let direction: BioTrend['direction'] = 'stable';
        if (priorAvg !== undefined && priorAvg > 0) {
            const diff = avg - priorAvg;
            const threshold = priorAvg * 0.05; // 5% change threshold

            if (Math.abs(diff) > threshold) {
                const lowerIsBetter = LOWER_IS_BETTER.has(metric);
                direction = diff > 0
                    ? (lowerIsBetter ? 'declining' : 'improving')
                    : (lowerIsBetter ? 'improving' : 'declining');
            }
        }

        trends.push({
            metric,
            direction,
            values7d: recent,
            average7d: Math.round(avg * 10) / 10,
            average7dPrior: priorAvg !== undefined ? Math.round(priorAvg * 10) / 10 : undefined,
        });
    }

    return trends;
};

/**
 * Format bio snapshot + trends into a text block for AI prompt injection
 */
export const formatBioContextForPrompt = (
    snapshot: BioSnapshot,
    trends: BioTrend[],
    options?: { t?: (key: string, opts?: Record<string, any>) => string; locale?: string }
): string => {
    if (snapshot.source === 'fallback') return '';

    const lines: string[] = [];

    if (snapshot.stressIndex !== undefined) {
        const level = snapshot.stressIndex > 70 ? 'HIGH - ELEVATED'
            : snapshot.stressIndex > 40 ? 'moderate' : 'low';
        lines.push(`- Stress Index: ${snapshot.stressIndex}/100 (${level})`);
    }

    if (snapshot.readinessScore !== undefined) {
        const level = snapshot.readinessScore > 70 ? 'good'
            : snapshot.readinessScore > 40 ? 'moderate' : 'LOW - RECOVERY NEEDED';
        lines.push(`- Readiness Score: ${snapshot.readinessScore}/100 (${level})`);
    }

    if (snapshot.hrv !== undefined) {
        lines.push(`- HRV (Heart Rate Variability): ${snapshot.hrv}ms`);
    }

    if (snapshot.restingHR !== undefined) {
        lines.push(`- Resting Heart Rate: ${snapshot.restingHR} bpm`);
    }

    if (snapshot.spo2 !== undefined) {
        lines.push(`- Blood Oxygen (SpO2): ${snapshot.spo2}%`);
    }

    if (snapshot.bodyTemp !== undefined) {
        lines.push(`- Body Temperature: ${formatTemperatureC(snapshot.bodyTemp, options?.locale)}`);
    }

    if (snapshot.basalBodyTemp !== undefined) {
        lines.push(`- Basal Body Temperature: ${snapshot.basalBodyTemp.toFixed(1)}°C`);
    }

    if (snapshot.respiratoryRate !== undefined) {
        lines.push(`- Respiratory Rate: ${snapshot.respiratoryRate} breaths/min`);
    }

    if (snapshot.vo2Max !== undefined) {
        lines.push(`- VO₂ Max: ${snapshot.vo2Max} ml/min/kg`);
    }

    if (snapshot.bloodGlucoseMgDl !== undefined) {
        lines.push(`- Blood Glucose: ${formatBloodGlucoseMgDl(snapshot.bloodGlucoseMgDl, options?.locale)}`);
    }

    if (snapshot.basalMetabolicRateKcal !== undefined) {
        lines.push(`- Basal Metabolic Rate: ${snapshot.basalMetabolicRateKcal} kcal/day`);
    }

    if (snapshot.bodyWeightKg !== undefined) {
        lines.push(`- Body Weight: ${formatWeightKg(snapshot.bodyWeightKg, options?.locale)}`);
    }

    if (snapshot.bodyFatPct !== undefined) {
        lines.push(`- Body Fat: ${snapshot.bodyFatPct}%`);
    }

    if (snapshot.hydrationMl !== undefined) {
        lines.push(`- Hydration (24h): ${formatHydrationMl(snapshot.hydrationMl, options?.locale)}`);
    }

    if (snapshot.nutritionKcal !== undefined) {
        const carbs = snapshot.nutritionCarbsG !== undefined ? `, Carbs ${snapshot.nutritionCarbsG}g` : '';
        const protein = snapshot.nutritionProteinG !== undefined ? `, Protein ${snapshot.nutritionProteinG}g` : '';
        const fat = snapshot.nutritionFatG !== undefined ? `, Fat ${snapshot.nutritionFatG}g` : '';
        lines.push(`- Nutrition (24h): ${snapshot.nutritionKcal} kcal${carbs}${protein}${fat}`);
    } else if (
        snapshot.nutritionCarbsG !== undefined
        || snapshot.nutritionProteinG !== undefined
        || snapshot.nutritionFatG !== undefined
    ) {
        const carbs = snapshot.nutritionCarbsG !== undefined ? `Carbs ${snapshot.nutritionCarbsG}g` : '';
        const protein = snapshot.nutritionProteinG !== undefined ? `Protein ${snapshot.nutritionProteinG}g` : '';
        const fat = snapshot.nutritionFatG !== undefined ? `Fat ${snapshot.nutritionFatG}g` : '';
        const parts = [carbs, protein, fat].filter(Boolean).join(', ');
        lines.push(`- Nutrition Macros (24h): ${parts}`);
    }

    if (snapshot.exerciseMinutes24h !== undefined) {
        let typeLabel: string | undefined;
        if (snapshot.lastExerciseType !== undefined) {
            const key = EXERCISE_TYPE_KEYS[snapshot.lastExerciseType];
            if (key && options?.t) {
                const i18nKey = `bio.exercise_type.${key}`;
                const translated = options.t(i18nKey);
                if (translated && translated !== i18nKey) {
                    typeLabel = translated;
                }
            }
            if (!typeLabel) {
                typeLabel = EXERCISE_TYPE_LABELS[snapshot.lastExerciseType] ?? `Type ${snapshot.lastExerciseType}`;
            }
        }
        const type = typeLabel ? ` (${typeLabel})` : '';
        lines.push(`- Exercise (24h): ${snapshot.exerciseMinutes24h} min${type}`);
    }

    if (snapshot.menstruationActive !== undefined) {
        const activeLabel = options?.t ? options.t('bio.detail.active') : 'active';
        const inactiveLabel = options?.t ? options.t('bio.detail.inactive') : 'inactive';
        const flow = snapshot.menstruationFlow !== undefined ? `, flow ${snapshot.menstruationFlow}` : '';
        lines.push(`- Menstruation: ${snapshot.menstruationActive ? activeLabel : inactiveLabel}${flow}`);
    }

    if (snapshot.steps !== undefined) {
        lines.push(`- Steps (24h): ${snapshot.steps}`);
    }

    if (snapshot.distanceMeters !== undefined) {
        lines.push(`- Distance (24h): ${formatDistanceMeters(snapshot.distanceMeters, options?.locale)}`);
    }

    if (snapshot.activeCalories !== undefined) {
        lines.push(`- Active Calories (24h): ${snapshot.activeCalories} kcal`);
    }

    if (snapshot.currentHR !== undefined) {
        lines.push(`- Current Heart Rate: ${snapshot.currentHR} bpm`);
    }

    if (snapshot.sleepScore !== undefined) {
        lines.push(`- Sleep Score: ${snapshot.sleepScore}/100`);
    }

    if (snapshot.basalBodyTemp !== undefined) {
        lines.push(`- Basal Body Temperature: ${formatTemperatureC(snapshot.basalBodyTemp, options?.locale)}`);
    }

    lines.push(`- Data Freshness: ${snapshot.freshness}`);
    lines.push(`- Source: ${snapshot.source}`);

    // Add trends
    const meaningful = trends.filter(t => t.direction !== 'stable');
    if (meaningful.length > 0) {
        lines.push('');
        lines.push('7-Day Bio Trends:');
        for (const t of meaningful) {
            const priorStr = t.average7dPrior !== undefined ? ` vs prior week ${t.average7dPrior}` : '';
            lines.push(`- ${formatMetricName(t.metric)}: ${t.direction} (avg ${t.average7d}${priorStr})`);
        }
    }

    // Safety guardrails for AI
    const guardrails: string[] = [];

    if (snapshot.stressIndex !== undefined && snapshot.stressIndex > 70) {
        guardrails.push('User stress is ELEVATED. Suggest recovery-focused activities, gentler tone, lighter workload. Avoid pushing intensity.');
    }

    if (snapshot.readinessScore !== undefined && snapshot.readinessScore < 40) {
        guardrails.push('User readiness is LOW. Defer intense workouts, extend rest periods, prioritize sleep quality.');
    }

    if (snapshot.spo2 !== undefined && snapshot.spo2 < 94) {
        guardrails.push('Blood oxygen is below normal. Recommend gentle activity only. Consider suggesting user check with a doctor.');
    }

    if (snapshot.bloodGlucoseMgDl !== undefined) {
        if (snapshot.bloodGlucoseMgDl < 70) {
            guardrails.push('Blood glucose is low. Suggest a quick carbohydrate snack and avoid intense exercise.');
        } else if (snapshot.bloodGlucoseMgDl > 180) {
            guardrails.push('Blood glucose is elevated. Encourage hydration, light movement, and balanced meals.');
        }
    }

    const hrvTrend = trends.find(t => t.metric === 'hrv');
    if (hrvTrend?.direction === 'declining') {
        guardrails.push('HRV has been declining this week, indicating accumulated fatigue. Suggest rest days and recovery.');
    }

    if (guardrails.length > 0) {
        lines.push('');
        lines.push('BIOMETRIC ADAPTATION NOTES (CRITICAL):');
        guardrails.forEach(g => lines.push(`⚠ ${g}`));
    }

    return lines.join('\n');
};

const formatMetricName = (metric: BioMetricKey): string => {
    switch (metric) {
        case 'hrv': return 'HRV';
        case 'restingHR': return 'Resting Heart Rate';
        case 'spo2': return 'Blood Oxygen';
        case 'stressIndex': return 'Stress Index';
        case 'readinessScore': return 'Readiness Score';
        case 'sleepScore': return 'Sleep Score';
        case 'vo2Max': return 'VO₂ Max';
        case 'respiratoryRate': return 'Respiratory Rate';
        default: return metric;
    }
};

/**
 * Compute daily aggregated bio summary for wrap-up
 */
export const computeDailyBioSummary = (snapshots: BioSnapshot[]): {
    avgStress: number;
    avgReadiness: number;
    hrvTrend: 'improving' | 'declining' | 'stable';
    sleepScoreAvg: number;
} | null => {
    const withStress = snapshots.filter(s => s.stressIndex !== undefined);
    const withReadiness = snapshots.filter(s => s.readinessScore !== undefined);
    const withSleep = snapshots.filter(s => s.sleepScore !== undefined);

    if (withStress.length === 0 && withReadiness.length === 0) return null;

    const avgStress = withStress.length > 0
        ? Math.round(withStress.reduce((a, s) => a + s.stressIndex!, 0) / withStress.length)
        : 50;

    const avgReadiness = withReadiness.length > 0
        ? Math.round(withReadiness.reduce((a, s) => a + s.readinessScore!, 0) / withReadiness.length)
        : 50;

    const sleepScoreAvg = withSleep.length > 0
        ? Math.round(withSleep.reduce((a, s) => a + s.sleepScore!, 0) / withSleep.length)
        : 50;

    // Determine HRV trend from within the day's snapshots
    const hrvValues = snapshots
        .map(s => s.hrv)
        .filter((v): v is number => v !== undefined);

    let hrvTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (hrvValues.length >= 4) {
        const firstHalf = hrvValues.slice(0, Math.floor(hrvValues.length / 2));
        const secondHalf = hrvValues.slice(Math.floor(hrvValues.length / 2));
        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const diff = avgSecond - avgFirst;
        if (Math.abs(diff) > avgFirst * 0.05) {
            hrvTrend = diff > 0 ? 'improving' : 'declining';
        }
    }

    return { avgStress, avgReadiness, hrvTrend, sleepScoreAvg };
};
