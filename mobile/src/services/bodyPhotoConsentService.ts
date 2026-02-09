import storage from './storageService';

export type BodyPhotoConsentRecord = {
    granted: boolean;
    timestamp: number;
    version: number;
    source?: 'onboarding' | 'settings' | 'body_progress';
};

const CURRENT_VERSION = 1;

export const bodyPhotoConsentService = {
    async getConsent(): Promise<BodyPhotoConsentRecord | null> {
        const record = await storage.get<BodyPhotoConsentRecord>(storage.keys.BODY_PHOTO_CONSENT);
        return record || null;
    },
    async hasConsent(): Promise<boolean> {
        const record = await storage.get<BodyPhotoConsentRecord>(storage.keys.BODY_PHOTO_CONSENT);
        return !!record?.granted;
    },
    async grantConsent(source: BodyPhotoConsentRecord['source'] = 'settings'): Promise<void> {
        const record: BodyPhotoConsentRecord = {
            granted: true,
            timestamp: Date.now(),
            version: CURRENT_VERSION,
            source,
        };
        await storage.set(storage.keys.BODY_PHOTO_CONSENT, record);
    },
    async revokeConsent(): Promise<void> {
        const record: BodyPhotoConsentRecord = {
            granted: false,
            timestamp: Date.now(),
            version: CURRENT_VERSION,
        };
        await storage.set(storage.keys.BODY_PHOTO_CONSENT, record);
    },
};

export default bodyPhotoConsentService;
