import storage from './storageService';

const CONSENT_KEY = '@health_consent_v1';

export type HealthConsentRecord = {
    granted: boolean;
    timestamp: number;
    version: number;
    source?: 'onboarding' | 'settings' | 'permissions';
};

const CURRENT_VERSION = 1;

export const healthConsentService = {
    async getConsent(): Promise<HealthConsentRecord | null> {
        const record = await storage.get<HealthConsentRecord>(CONSENT_KEY);
        return record || null;
    },
    async hasConsent(): Promise<boolean> {
        const record = await storage.get<HealthConsentRecord>(CONSENT_KEY);
        return !!record?.granted;
    },
    async grantConsent(source: HealthConsentRecord['source'] = 'settings'): Promise<void> {
        const record: HealthConsentRecord = {
            granted: true,
            timestamp: Date.now(),
            version: CURRENT_VERSION,
            source,
        };
        await storage.set(CONSENT_KEY, record);
    },
    async revokeConsent(): Promise<void> {
        const record: HealthConsentRecord = {
            granted: false,
            timestamp: Date.now(),
            version: CURRENT_VERSION,
        };
        await storage.set(CONSENT_KEY, record);
    },
};
