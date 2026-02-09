import storage from './storageService';

const STORAGE_KEY = 'ls_bio_trends_access_v1';
const DEFAULT_UNLOCK_MS = 24 * 60 * 60 * 1000; // 24 hours

export type BioTrendsAccessState = {
    unlockedUntil: number;
    source?: 'ad' | 'other';
};

const readState = async (): Promise<BioTrendsAccessState | null> => {
    const stored = await storage.get<BioTrendsAccessState>(STORAGE_KEY);
    if (!stored || typeof stored.unlockedUntil !== 'number') return null;
    return stored;
};

export const bioTrendsAccessService = {
    async getAccessState(): Promise<BioTrendsAccessState | null> {
        return readState();
    },

    async isUnlocked(): Promise<boolean> {
        const state = await readState();
        if (!state) return false;
        return state.unlockedUntil > Date.now();
    },

    async unlockFor(durationMs: number = DEFAULT_UNLOCK_MS, source: BioTrendsAccessState['source'] = 'ad'): Promise<void> {
        const next: BioTrendsAccessState = {
            unlockedUntil: Date.now() + Math.max(0, durationMs),
            source,
        };
        await storage.set(STORAGE_KEY, next);
    },

    async clear(): Promise<void> {
        await storage.remove(STORAGE_KEY);
    },
};

export default bioTrendsAccessService;
