import { DailyPlan, PlanItem } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';

const parseMinutes = (time: string): number | null => {
    const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
};

const slotKey = (item: PlanItem) => `${item.time}|${item.type}`;

export const mergePlanPreservingCompletedAndPast = (
    incoming: DailyPlan,
    previous?: DailyPlan | null,
    now: Date = new Date(),
    options?: { dayStartMinutes?: number; activeDayKey?: string }
): DailyPlan => {
    if (!previous) return incoming;

    const nowDateKey = getLocalDateKey(now);
    const incomingDate = incoming.date || nowDateKey;
    const previousDate = previous.date || nowDateKey;

    // Only merge when both plans are for the same date.
    if (incomingDate !== previousDate) return incoming;

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const dayStartMinutes =
        options?.activeDayKey && incomingDate === options.activeDayKey
            ? (options.dayStartMinutes ?? 0)
            : 0;
    const normalizeMinutes = (minutes: number) => {
        return (minutes - dayStartMinutes + 1440) % 1440;
    };
    const nowRelative = normalizeMinutes(nowMinutes);
    const nowTs = now.getTime();

    const previousById = new Map<string, PlanItem>();
    const previousBySlot = new Map<string, PlanItem>();
    (previous.items || []).forEach(item => {
        if (item.id) previousById.set(item.id, item);
        previousBySlot.set(slotKey(item), item);
    });

    const shouldPreserve = (item: PlanItem) => {
        if (item.completed || item.skipped || item.missed) return true;
        if (typeof item.snoozedUntil === 'number' && item.snoozedUntil > nowTs) return true;
        const minutes = parseMinutes(item.time);
        if (minutes === null) return false;
        return normalizeMinutes(minutes) < nowRelative;
    };

    const preserved = (previous.items || []).filter(shouldPreserve);
    const preservedIds = new Set(preserved.map(i => i.id).filter(Boolean));
    const preservedSlots = new Set(preserved.map(slotKey));

    const incomingUpcoming = (incoming.items || []).filter(item => {
        const minutes = parseMinutes(item.time);
        if (minutes === null) return true;
        return normalizeMinutes(minutes) >= nowRelative;
    });

    const mergedUpcoming = incomingUpcoming.filter(item => {
        if (item.id && preservedIds.has(item.id)) return false;
        if (preservedSlots.has(slotKey(item))) return false;
        return true;
    });

    const mergedItems = [...preserved, ...mergedUpcoming]
        .map(item => {
            const previousMatch = (item.id && previousById.get(item.id)) || previousBySlot.get(slotKey(item));
            const snoozedUntil = previousMatch?.snoozedUntil;
            if (typeof snoozedUntil === 'number' && snoozedUntil > nowTs) {
                return { ...item, snoozedUntil };
            }
            return item;
        })
        .sort((a, b) => {
            const aMinutes = parseMinutes(a.time);
            const bMinutes = parseMinutes(b.time);
            if (aMinutes === null || bMinutes === null) return a.time.localeCompare(b.time);
            return normalizeMinutes(aMinutes) - normalizeMinutes(bMinutes);
        });

    return { ...incoming, date: incomingDate, items: mergedItems };
};
