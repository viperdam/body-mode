import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { EncodingType } from 'expo-file-system/legacy';
import i18n from '../i18n';
import type {
    BodyScanAnalysis,
    BodyScanEntry,
    BodyProgressSettings,
    BodyProgressSummary,
    Language,
} from '../types';
import storage from './storageService';
import { llmQueueService } from './llmQueueService';
import { emit as emitPlanEvent } from './planEventService';
import { scheduleNotification } from './notificationService';

const SCANS_KEY = storage.keys.BODY_PROGRESS_SCANS;
const SUMMARY_KEY = storage.keys.BODY_PROGRESS_SUMMARY;
const SETTINGS_KEY = storage.keys.BODY_PROGRESS_SETTINGS;

const DOCUMENT_DIR =
    (FileSystem as { documentDirectory?: string }).documentDirectory
    ?? FileSystem.Paths?.document?.uri
    ?? '';
const BODY_PROGRESS_DIR = DOCUMENT_DIR ? `${DOCUMENT_DIR}body_progress` : '';
const REMINDER_INTERVAL_DAYS = 14;

const DEFAULT_SETTINGS: BodyProgressSettings = {
    reminderEnabled: true,
};

const ensureDirectory = async (): Promise<void> => {
    if (!BODY_PROGRESS_DIR) return;
    try {
        const info = await FileSystem.getInfoAsync(BODY_PROGRESS_DIR);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(BODY_PROGRESS_DIR, { intermediates: true });
        }
    } catch (error) {
        console.warn('[BodyProgress] Failed to ensure directory:', error);
    }
};

const toDateLabel = (timestamp: number): string => {
    try {
        return new Date(timestamp).toLocaleDateString();
    } catch {
        return new Date(timestamp).toISOString().split('T')[0];
    }
};

const guessExtension = (uri: string): string => {
    const lower = uri.toLowerCase();
    if (lower.includes('.png')) return '.png';
    if (lower.includes('.webp')) return '.webp';
    if (lower.includes('.heic')) return '.heic';
    return '.jpg';
};

const computeWeekNumber = (baselineAt: number, capturedAt: number): number => {
    const diff = Math.max(0, capturedAt - baselineAt);
    return Math.max(1, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1);
};

const normalizeScans = (scans: BodyScanEntry[]): { scans: BodyScanEntry[]; changed: boolean } => {
    const sorted = [...scans].sort((a, b) => a.capturedAt - b.capturedAt);
    if (sorted.length === 0) return { scans: [], changed: false };

    const baselineId = sorted[0].id;
    const baselineAt = sorted[0].capturedAt;
    let changed = false;

    const normalized = sorted.map((scan, index) => {
        const next: BodyScanEntry = { ...scan };
        if (!next.status) {
            next.status = next.analysis ? 'analyzed' : 'queued';
            changed = true;
        }
        if (!next.weekNumber || next.weekNumber < 1) {
            next.weekNumber = computeWeekNumber(baselineAt, next.capturedAt);
            changed = true;
        }
        if (!next.baselineId) {
            next.baselineId = baselineId;
            changed = true;
        }
        if (!next.previousId && index > 0) {
            next.previousId = sorted[index - 1].id;
            changed = true;
        }
        if (!next.updatedAt) {
            next.updatedAt = next.capturedAt;
            changed = true;
        }
        if (next.retryCount === undefined) {
            next.retryCount = 0;
            changed = true;
        }
        return next;
    });

    return { scans: normalized, changed };
};

const buildScanSummary = (scan?: BodyScanEntry | null): string | undefined => {
    if (!scan?.analysis) return undefined;
    const { analysis } = scan;
    const parts: string[] = [];
    parts.push(`Scan ${toDateLabel(scan.capturedAt)} (week ${scan.weekNumber}):`);
    if (analysis.overallAssessment) parts.push(`Overall: ${analysis.overallAssessment}`);
    if (analysis.visibleChanges) parts.push(`Changes: ${analysis.visibleChanges}`);
    if (analysis.progressScore !== undefined) parts.push(`Progress score: ${analysis.progressScore}/10.`);
    if (analysis.biggestImprovements?.length) parts.push(`Improvements: ${analysis.biggestImprovements.join(', ')}`);
    if (analysis.areasNeedingFocus?.length) parts.push(`Focus areas: ${analysis.areasNeedingFocus.join(', ')}`);
    if (analysis.recommendations) parts.push(`Recommendations: ${analysis.recommendations}`);
    return parts.join(' ');
};

const buildTimelineSummary = (scans: BodyScanEntry[]): BodyProgressSummary => {
    if (!scans.length) {
        return {
            summary: 'No body progress scans yet.',
            scanCount: 0,
            updatedAt: Date.now(),
        };
    }

    const sorted = [...scans].sort((a, b) => a.capturedAt - b.capturedAt);
    const baseline = sorted[0];
    const latest = [...sorted].reverse().find(scan => scan.analysis);
    const latestScan = latest ?? sorted[sorted.length - 1];

    const lines: string[] = [];
    lines.push(`Body progress: ${sorted.length} scans since ${toDateLabel(baseline.capturedAt)}.`);
    if (latestScan?.analysis) {
        const analysis = latestScan.analysis;
        lines.push(`Latest (${toDateLabel(latestScan.capturedAt)}): ${analysis.overallAssessment || analysis.visibleChanges || 'Analysis recorded.'}`);
        if (analysis.progressScore !== undefined) {
            lines.push(`Progress score: ${analysis.progressScore}/10.`);
        }
        if (analysis.biggestImprovements?.length) {
            lines.push(`Biggest improvements: ${analysis.biggestImprovements.join(', ')}.`);
        }
        if (analysis.areasNeedingFocus?.length) {
            lines.push(`Needs focus: ${analysis.areasNeedingFocus.join(', ')}.`);
        }
    } else {
        lines.push(`Latest scan taken on ${toDateLabel(latestScan.capturedAt)} (analysis pending).`);
    }

    return {
        summary: lines.join(' '),
        scanCount: sorted.length,
        updatedAt: Date.now(),
    };
};

const saveScans = async (scans: BodyScanEntry[]): Promise<void> => {
    await storage.set(SCANS_KEY, scans);
};

const loadScans = async (): Promise<BodyScanEntry[]> => {
    const stored = await storage.get<BodyScanEntry[]>(SCANS_KEY);
    const safe = Array.isArray(stored) ? stored : [];
    const normalized = normalizeScans(safe);
    if (normalized.changed) {
        await saveScans(normalized.scans);
    }
    return normalized.scans;
};

const loadSettings = async (): Promise<BodyProgressSettings> => {
    const stored = await storage.get<BodyProgressSettings>(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(stored || {}) };
};

const saveSettings = async (settings: BodyProgressSettings): Promise<void> => {
    await storage.set(SETTINGS_KEY, settings);
};

const loadSummary = async (): Promise<BodyProgressSummary | null> => {
    return (await storage.get<BodyProgressSummary>(SUMMARY_KEY)) || null;
};

const saveSummary = async (summary: BodyProgressSummary): Promise<void> => {
    await storage.set(SUMMARY_KEY, summary);
};

const scheduleReminder = async (settings: BodyProgressSettings): Promise<BodyProgressSettings> => {
    if (!settings.reminderEnabled || !settings.nextScanDue) return settings;
    try {
        if (settings.reminderNotificationId) {
            await Notifications.cancelScheduledNotificationAsync(settings.reminderNotificationId);
        }
        const trigger = new Date(settings.nextScanDue);
        const id = await scheduleNotification(
            i18n.t('body_progress.reminder.title'),
            i18n.t('body_progress.reminder.body'),
            trigger
        );
        return {
            ...settings,
            reminderNotificationId: id,
        };
    } catch (error) {
        console.warn('[BodyProgress] Failed to schedule reminder:', error);
        return settings;
    }
};

const buildNextScanDue = (capturedAt: number): number =>
    capturedAt + REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

export const bodyProgressService = {
    async getScans(): Promise<BodyScanEntry[]> {
        return loadScans();
    },

    async getScanById(scanId: string): Promise<BodyScanEntry | null> {
        const scans = await loadScans();
        return scans.find(scan => scan.id === scanId) || null;
    },

    async getSummary(): Promise<BodyProgressSummary | null> {
        return loadSummary();
    },

    async getSettings(): Promise<BodyProgressSettings> {
        return loadSettings();
    },

    async updateSettings(patch: Partial<BodyProgressSettings>): Promise<BodyProgressSettings> {
        const current = await loadSettings();
        const next: BodyProgressSettings = { ...current, ...patch };
        const updated = await scheduleReminder(next);
        await saveSettings(updated);
        await emitPlanEvent('BODY_PROGRESS_UPDATED', { type: 'settings' });
        return updated;
    },

    async createScan(imageUri: string, options?: { capturedAt?: number }): Promise<BodyScanEntry> {
        if (!imageUri) {
            throw new Error(i18n.t('errors.body_progress.missing_image'));
        }

        await ensureDirectory();
        const capturedAt = options?.capturedAt ?? Date.now();
        const scans = await loadScans();
        const id = `scan_${capturedAt}_${Math.random().toString(36).slice(2, 7)}`;
        const ext = guessExtension(imageUri);
        const sanitized = new Date(capturedAt).toISOString().replace(/[:.]/g, '-');
        const target = BODY_PROGRESS_DIR ? `${BODY_PROGRESS_DIR}/${id}_${sanitized}${ext}` : '';
        let persistedImageUri = imageUri;

        if (target) {
            try {
                await FileSystem.copyAsync({ from: imageUri, to: target });
                const copiedInfo = await FileSystem.getInfoAsync(target);
                if (copiedInfo.exists) {
                    persistedImageUri = copiedInfo.uri || target;
                } else {
                    console.warn('[BodyProgress] Copy completed but target file is missing, falling back to source URI');
                }
            } catch (error) {
                console.warn('[BodyProgress] Failed to copy image, attempting base64 persistence fallback:', error);
                try {
                    const base64 = await FileSystem.readAsStringAsync(imageUri, {
                        encoding: EncodingType.Base64,
                    });
                    await FileSystem.writeAsStringAsync(target, base64, {
                        encoding: EncodingType.Base64,
                    });
                    const restoredInfo = await FileSystem.getInfoAsync(target);
                    if (restoredInfo.exists) {
                        persistedImageUri = restoredInfo.uri || target;
                    } else {
                        console.warn('[BodyProgress] Base64 persistence fallback failed, using source URI');
                    }
                } catch (fallbackError) {
                    console.warn('[BodyProgress] Base64 persistence fallback failed, using source URI:', fallbackError);
                }
            }
        }

        const sourceInfo = await FileSystem.getInfoAsync(persistedImageUri);
        if (!sourceInfo.exists) {
            throw new Error(i18n.t('errors.body_progress.missing_image'));
        }

        const baselineId = scans.length ? scans[0].id : id;
        const previousId = scans.length ? scans[scans.length - 1].id : undefined;
        const baselineAt = scans.length ? scans[0].capturedAt : capturedAt;

        const entry: BodyScanEntry = {
            id,
            imageUri: persistedImageUri,
            capturedAt,
            weekNumber: computeWeekNumber(baselineAt, capturedAt),
            status: 'queued',
            baselineId,
            previousId,
            retryCount: 0,
            updatedAt: Date.now(),
        };

        const next = [...scans, entry];
        await saveScans(next);

        const settings = await loadSettings();
        const nextSettings = await scheduleReminder({
            ...settings,
            lastScanAt: capturedAt,
            nextScanDue: buildNextScanDue(capturedAt),
        });
        await saveSettings(nextSettings);

        await emitPlanEvent('BODY_PROGRESS_UPDATED', { type: 'scan_created', scanId: id });
        return entry;
    },

    async queueAnalysis(scanId: string, options?: { language?: Language }): Promise<string> {
        const scans = await loadScans();
        const scan = scans.find(item => item.id === scanId);
        if (!scan) {
            throw new Error(i18n.t('errors.body_progress.not_found'));
        }

        const baseline = scans.find(item => item.id === scan.baselineId) || scans[0];
        const previous = scans.find(item => item.id === scan.previousId) || scans[scans.length - 2];
        const baselineSummary = buildScanSummary(baseline);
        const previousSummary = buildScanSummary(previous);

        await this.updateScan(scanId, {
            status: 'processing',
            lastError: undefined,
            updatedAt: Date.now(),
        });

        const jobId = await llmQueueService.addJob(
            'ANALYZE_BODY_SCAN',
            {
                scanId,
                imageUri: scan.imageUri,
                baselineSummary,
                previousSummary,
                language: options?.language,
            },
            'high'
        );

        await emitPlanEvent('BODY_PROGRESS_UPDATED', { type: 'analysis_queued', scanId, jobId });
        return jobId;
    },

    async analyzeNow(scanId: string, options?: { language?: Language }): Promise<BodyScanAnalysis> {
        const scans = await loadScans();
        const scan = scans.find(item => item.id === scanId);
        if (!scan) {
            throw new Error(i18n.t('errors.body_progress.not_found'));
        }

        const baseline = scans.find(item => item.id === scan.baselineId) || scans[0];
        const previous = scans.find(item => item.id === scan.previousId) || scans[scans.length - 2];
        const baselineSummary = buildScanSummary(baseline);
        const previousSummary = buildScanSummary(previous);

        await this.updateScan(scanId, { status: 'processing', lastError: undefined, updatedAt: Date.now() });

        const analysis = await llmQueueService.addJobAndWait<BodyScanAnalysis>(
            'ANALYZE_BODY_SCAN',
            {
                scanId,
                imageUri: scan.imageUri,
                baselineSummary,
                previousSummary,
                language: options?.language,
            },
            'high'
        );

        await this.applyAnalysisResult(scanId, analysis);
        return analysis;
    },

    async applyAnalysisResult(scanId: string, analysis: BodyScanAnalysis): Promise<void> {
        if (!analysis) return;
        await this.updateScan(scanId, {
            status: 'analyzed',
            analysis,
            comparisonWithPrevious: analysis.comparisonWithPrevious,
            comparisonWithBaseline: analysis.comparisonWithBaseline,
            progressScore: analysis.progressScore,
            lastError: undefined,
            updatedAt: Date.now(),
        });

        const scans = await loadScans();
        const summary = buildTimelineSummary(scans);
        await saveSummary(summary);

        const settings = await loadSettings();
        await saveSettings({ ...settings, lastSummaryAt: summary.updatedAt });

        await emitPlanEvent('BODY_PROGRESS_UPDATED', { type: 'analysis_complete', scanId });
    },

    async markScanFailed(scanId: string, error: string, retryCount?: number): Promise<void> {
        await this.updateScan(scanId, {
            status: 'failed',
            lastError: error,
            retryCount: retryCount ?? undefined,
            updatedAt: Date.now(),
        });
        await emitPlanEvent('BODY_PROGRESS_UPDATED', { type: 'analysis_failed', scanId });
    },

    async updateScan(scanId: string, patch: Partial<BodyScanEntry>): Promise<void> {
        const scans = await loadScans();
        const updated = scans.map(scan => (scan.id === scanId ? { ...scan, ...patch } : scan));
        await saveScans(updated);
    },

    async deleteScan(scanId: string): Promise<void> {
        const scans = await loadScans();
        const target = scans.find(scan => scan.id === scanId);
        const remaining = scans.filter(scan => scan.id !== scanId);
        await saveScans(remaining);
        if (target?.imageUri) {
            try {
                await FileSystem.deleteAsync(target.imageUri, { idempotent: true });
            } catch (error) {
                console.warn('[BodyProgress] Failed to delete image:', error);
            }
        }
        const summary = buildTimelineSummary(remaining);
        await saveSummary(summary);
        await emitPlanEvent('BODY_PROGRESS_UPDATED', { type: 'scan_deleted', scanId });
    },

    async clearAllScans(): Promise<void> {
        await saveScans([]);
        await saveSummary(buildTimelineSummary([]));
        const settings = await loadSettings();
        if (settings.reminderNotificationId) {
            try {
                await Notifications.cancelScheduledNotificationAsync(settings.reminderNotificationId);
            } catch (error) {
                console.warn('[BodyProgress] Failed to cancel reminder:', error);
            }
        }
        await saveSettings({ ...DEFAULT_SETTINGS });
        try {
            await FileSystem.deleteAsync(BODY_PROGRESS_DIR, { idempotent: true });
        } catch (error) {
            console.warn('[BodyProgress] Failed to clear directory:', error);
        }
        await emitPlanEvent('BODY_PROGRESS_UPDATED', { type: 'cleared' });
    },
};

export default bodyProgressService;
