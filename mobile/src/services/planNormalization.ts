import { DailyPlan, PlanItem } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^(\d{1,2}):(\d{2})$/;

export const isValidDateKey = (value: string | null | undefined): value is string =>
    typeof value === 'string' && DATE_KEY_REGEX.test(value);

const normalizeTime = (value?: string | null): string | null => {
    if (!value) return null;
    const match = value.trim().match(TIME_REGEX);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const stableHash = (input: string): string => {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
};

export const buildStablePlanItemId = (
    planDateKey: string,
    time: string,
    type: string,
    title: string,
    index: number
): string => {
    return `plan-${planDateKey}-${time}-${stableHash(`${type}|${title}|${index}`)}`;
};

const buildScheduledAt = (
    dateKey: string,
    time: string,
    dayStartMinutes: number
): number | undefined => {
    const match = time.match(TIME_REGEX);
    if (!match) return undefined;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return undefined;

    const dateParts = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateParts) return undefined;
    const year = Number(dateParts[1]);
    const month = Number(dateParts[2]) - 1;
    const day = Number(dateParts[3]);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return undefined;

    const baseDate = new Date(year, month, day, hours, minutes, 0, 0);
    const minutesSinceMidnight = hours * 60 + minutes;
    if (dayStartMinutes > 0 && minutesSinceMidnight < dayStartMinutes) {
        baseDate.setDate(baseDate.getDate() + 1);
    }
    return baseDate.getTime();
};

type NormalizeOptions = {
    forceDateKey?: boolean;
    dayStartMinutes?: number;
};

export const normalizePlan = (
    plan: DailyPlan | null,
    dateKey?: string,
    options?: NormalizeOptions
): DailyPlan | null => {
    if (!plan) return null;

    const fallbackDate = dateKey && isValidDateKey(dateKey) ? dateKey : getLocalDateKey(new Date());
    const normalizedDate = (options?.forceDateKey && isValidDateKey(fallbackDate))
        ? fallbackDate
        : (isValidDateKey(plan.date) ? plan.date : fallbackDate);

    const dayStartMinutes = options?.dayStartMinutes ?? 0;

    const rawItems = Array.isArray(plan.items) ? plan.items : [];
    const normalizedItems: PlanItem[] = rawItems
        .map((item, idx): PlanItem | null => {
            const time = normalizeTime(item.time);
            if (!time) return null;

            const skipped = item.skipped ?? false;
            const completed = item.completed ?? false;
            const missed = item.missed ?? false;
            const scheduledAt = buildScheduledAt(normalizedDate, time, dayStartMinutes);

            const completedAtRaw = typeof (item as any).completedAt === 'number' ? (item as any).completedAt : undefined;
            const skippedAtRaw = typeof (item as any).skippedAt === 'number' ? (item as any).skippedAt : undefined;
            const missedAtRaw = typeof (item as any).missedAt === 'number' ? (item as any).missedAt : undefined;

            return {
                ...item,
                id: (item.id && String(item.id).trim())
                    ? item.id
                    : buildStablePlanItemId(
                        normalizedDate,
                        time,
                        String(item.type || 'item'),
                        String(item.title || ''),
                        idx
                    ),
                time,
                scheduledAt,
                completed,
                skipped,
                missed,
                completedAt: completed ? completedAtRaw : undefined,
                skippedAt: skipped ? skippedAtRaw : undefined,
                missedAt: missed ? missedAtRaw : undefined,
            };
        })
        .filter((item): item is PlanItem => item !== null)
        .sort((a, b) => {
            if (typeof a.scheduledAt === 'number' && typeof b.scheduledAt === 'number') {
                return a.scheduledAt - b.scheduledAt;
            }
            return a.time.localeCompare(b.time);
        });

    return {
        ...plan,
        date: normalizedDate,
        items: normalizedItems,
    };
};

export default {
    normalizePlan,
    buildStablePlanItemId,
    isValidDateKey,
};
