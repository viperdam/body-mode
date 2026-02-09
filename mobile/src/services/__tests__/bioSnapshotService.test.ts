import type { BioSnapshot } from '../../types';

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

const mockGetBioMetrics = jest.fn();
const mockGetHeartRate = jest.fn();

jest.mock('../healthService', () => ({
    healthService: {
        isInitialized: jest.fn(() => true),
        getBioMetrics: (...args: any[]) => mockGetBioMetrics(...args),
        getHeartRate: (...args: any[]) => mockGetHeartRate(...args),
    },
}));

jest.mock('../healthConnectService', () => ({
    healthConnectService: {
        initialize: jest.fn(),
        isAvailable: jest.fn(() => false),
        readAllBioMetrics: jest.fn(),
    },
}));

jest.mock('../subscriptionService', () => ({
    subscriptionService: {
        isPremiumActive: jest.fn(() => true),
    },
}));

const mockStorageGet = jest.fn();
const mockStorageSet = jest.fn();
const mockStorageRemove = jest.fn();

jest.mock('../storageService', () => ({
    __esModule: true,
    default: {
        get: (...args: any[]) => mockStorageGet(...args),
        set: (...args: any[]) => mockStorageSet(...args),
        remove: (...args: any[]) => mockStorageRemove(...args),
    },
}));

jest.mock('../sleepSessionService', () => ({
    sleepSessionService: {
        getLastNightSleep: jest.fn().mockResolvedValue(null),
        computeSleepScore: jest.fn().mockResolvedValue(50),
    },
}));

describe('bioSnapshotService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStorageGet.mockResolvedValue(null);
        mockStorageSet.mockResolvedValue(undefined);
        mockStorageRemove.mockResolvedValue(true);
    });

    const resetServiceState = async () => {
        const mod = await import('../bioSnapshotService');
        const service = mod.bioSnapshotService as any;
        service.initialized = false;
        service.lastSnapshot = null;
        service.lastFetchTime = 0;
        return mod.bioSnapshotService;
    };

    it('returns fallback when no metrics are available', async () => {
        mockGetBioMetrics.mockResolvedValue({});
        const service = await resetServiceState();
        const snapshot = await service.getSnapshot();
        expect(snapshot.source).toBe('fallback');
        expect(snapshot.freshness).toBe('stale');
    });

    it('returns live snapshot when metrics are available', async () => {
        mockGetBioMetrics.mockResolvedValue({ hrv: 55, restingHR: 62, spo2: 98, heartRate: 62 });
        const service = await resetServiceState();
        const snapshot = await service.getSnapshot();
        expect(snapshot.source).toBe('apple_health');
        expect(snapshot.freshness).toBe('live');
        expect((snapshot as BioSnapshot).hrv).toBe(55);
    });
});
