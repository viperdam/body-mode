import { computeBioTrends, formatBioContextForPrompt } from '../bioAlgorithms';
import type { BioSnapshot } from '../../types';

describe('computeBioTrends', () => {
    it('detects improving HRV trend', () => {
        const history: BioSnapshot[] = Array.from({ length: 14 }, (_, i) => ({
            hrv: 30 + (i > 6 ? 10 : 0),
            timestamp: Date.now() - (13 - i) * 86400000,
            source: 'apple_health',
            freshness: 'live',
        }));
        const trends = computeBioTrends(history);
        const hrvTrend = trends.find(t => t.metric === 'hrv');
        expect(hrvTrend?.direction).toBe('improving');
    });

    it('returns stable when no significant change', () => {
        const history: BioSnapshot[] = Array.from({ length: 14 }, (_, i) => ({
            hrv: 45,
            timestamp: Date.now() - (13 - i) * 86400000,
            source: 'apple_health',
            freshness: 'live',
        }));
        const trends = computeBioTrends(history);
        const hrvTrend = trends.find(t => t.metric === 'hrv');
        expect(hrvTrend?.direction).toBe('stable');
    });
});

describe('formatBioContextForPrompt', () => {
    it('includes high stress warning', () => {
        const snapshot: BioSnapshot = {
            stressIndex: 80,
            readinessScore: 30,
            hrv: 20,
            timestamp: Date.now(),
            source: 'apple_health',
            freshness: 'live',
        };
        const result = formatBioContextForPrompt(snapshot, []);
        expect(result).toContain('HIGH');
        expect(result).toContain('recovery-focused');
    });
});
