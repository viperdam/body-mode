import { create } from 'zustand';
import type { BodyProgressSummary, BodyScanEntry, BodyProgressSettings } from '../types';
import { bodyProgressService } from '../services/bodyProgressService';
import { subscribe as subscribePlanEvent } from '../services/planEventService';

type BodyProgressState = {
    scans: BodyScanEntry[];
    summary: BodyProgressSummary | null;
    settings: BodyProgressSettings | null;
    isLoading: boolean;
    lastError: string | null;
    refresh: () => Promise<void>;
    refreshSummary: () => Promise<void>;
    refreshSettings: () => Promise<void>;
    setError: (error: string | null) => void;
};

export const useBodyProgressStore = create<BodyProgressState>((set, get) => ({
    scans: [],
    summary: null,
    settings: null,
    isLoading: false,
    lastError: null,

    setError: (error) => set({ lastError: error }),

    refresh: async () => {
        set({ isLoading: true });
        try {
            const [scans, summary, settings] = await Promise.all([
                bodyProgressService.getScans(),
                bodyProgressService.getSummary(),
                bodyProgressService.getSettings(),
            ]);
            set({ scans, summary, settings, lastError: null });
        } catch (error: any) {
            set({ lastError: error?.message || 'Failed to load body progress.' });
        } finally {
            set({ isLoading: false });
        }
    },

    refreshSummary: async () => {
        try {
            const summary = await bodyProgressService.getSummary();
            set({ summary });
        } catch (error: any) {
            set({ lastError: error?.message || 'Failed to load summary.' });
        }
    },

    refreshSettings: async () => {
        try {
            const settings = await bodyProgressService.getSettings();
            set({ settings });
        } catch (error: any) {
            set({ lastError: error?.message || 'Failed to load settings.' });
        }
    },
}));

let subscriptionInit = false;

export const initBodyProgressStore = (): (() => void) => {
    if (subscriptionInit) {
        return () => {};
    }
    subscriptionInit = true;
    const unsubscribe = subscribePlanEvent('BODY_PROGRESS_UPDATED', () => {
        void useBodyProgressStore.getState().refresh();
    });
    return () => {
        subscriptionInit = false;
        unsubscribe();
    };
};

