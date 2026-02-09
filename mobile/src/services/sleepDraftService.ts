import { storage } from './storageService';

export type SleepDraftState = 'pending_sleep' | 'pending_review';

export interface SleepDraft {
    id: string;
    sleepStartTime: number;
    wakeTime?: number;
    durationMs?: number;
    durationHours?: number;
    state: SleepDraftState;
    tags?: string[];
    sleepContext?: Record<string, any>;
    createdAt: number;
    updatedAt: number;
}

const MAX_DRAFTS = 10;

const sortDrafts = (drafts: SleepDraft[]): SleepDraft[] =>
    [...drafts].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

const buildDraftId = (sleepStartTime: number): string => `draft_${sleepStartTime}`;

const normalizeDraft = (draft: SleepDraft): SleepDraft => ({
    ...draft,
    id: draft.id || buildDraftId(draft.sleepStartTime),
    createdAt: draft.createdAt || Date.now(),
    updatedAt: draft.updatedAt || Date.now(),
});

const computeDuration = (sleepStartTime: number, wakeTime?: number) => {
    if (typeof wakeTime !== 'number' || !Number.isFinite(wakeTime)) {
        return { durationMs: undefined, durationHours: undefined };
    }
    const durationMs = Math.max(0, wakeTime - sleepStartTime);
    return {
        durationMs,
        durationHours: durationMs / (1000 * 60 * 60),
    };
};

export const sleepDraftService = {
    async getDrafts(): Promise<SleepDraft[]> {
        const drafts = await storage.get<SleepDraft[]>(storage.keys.SLEEP_DRAFTS);
        if (!Array.isArray(drafts)) return [];
        return sortDrafts(drafts.map(normalizeDraft));
    },

    async saveDrafts(drafts: SleepDraft[]): Promise<void> {
        const trimmed = sortDrafts(drafts).slice(0, MAX_DRAFTS);
        await storage.set(storage.keys.SLEEP_DRAFTS, trimmed);
    },

    async upsertDraft(draft: SleepDraft): Promise<SleepDraft> {
        const normalized = normalizeDraft(draft);
        const drafts = await this.getDrafts();
        const index = drafts.findIndex(item => item.id === normalized.id);
        if (index >= 0) {
            drafts[index] = { ...drafts[index], ...normalized, updatedAt: Date.now() };
        } else {
            drafts.push({ ...normalized, updatedAt: Date.now() });
        }
        await this.saveDrafts(drafts);
        return normalized;
    },

    async upsertDraftFromTimes(params: {
        id?: string;
        sleepStartTime: number;
        wakeTime?: number;
        tags?: string[];
        sleepContext?: Record<string, any>;
    }): Promise<SleepDraft> {
        const { sleepStartTime, wakeTime, tags, sleepContext } = params;
        const duration = computeDuration(sleepStartTime, wakeTime);
        const state: SleepDraftState = typeof wakeTime === 'number' ? 'pending_review' : 'pending_sleep';
        return this.upsertDraft({
            id: params.id || buildDraftId(sleepStartTime),
            sleepStartTime,
            wakeTime,
            state,
            tags,
            sleepContext,
            durationMs: duration.durationMs,
            durationHours: duration.durationHours,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    },

    async updateDraftTimes(
        draftId: string,
        sleepStartTime: number,
        wakeTime?: number
    ): Promise<SleepDraft | null> {
        const drafts = await this.getDrafts();
        const existing = drafts.find(item => item.id === draftId);
        if (!existing) return null;

        const nextId = buildDraftId(sleepStartTime);
        const duration = computeDuration(sleepStartTime, wakeTime);
        const nextDraft: SleepDraft = {
            ...existing,
            id: nextId,
            sleepStartTime,
            wakeTime,
            state: typeof wakeTime === 'number' ? 'pending_review' : 'pending_sleep',
            durationMs: duration.durationMs,
            durationHours: duration.durationHours,
            updatedAt: Date.now(),
        };

        const filtered = drafts.filter(item => item.id !== draftId);
        filtered.push(nextDraft);
        await this.saveDrafts(filtered);
        return nextDraft;
    },

    async removeDraft(id: string): Promise<void> {
        const drafts = await this.getDrafts();
        await this.saveDrafts(drafts.filter(draft => draft.id !== id));
    },

    async clearDrafts(): Promise<void> {
        await storage.remove(storage.keys.SLEEP_DRAFTS);
    },

    buildDraftId,
};

export default sleepDraftService;
