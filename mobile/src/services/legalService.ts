import storage from './storageService';
import { LEGAL_VERSION } from '../constants/legal';

export type LegalAcceptance = {
    acceptedAt: number;
    version: string;
};

type LegalListener = (value: LegalAcceptance | null) => void;

const listeners = new Set<LegalListener>();

const notifyListeners = (value: LegalAcceptance | null) => {
    listeners.forEach((listener) => listener(value));
};

export const getStoredLegalAcceptance = async (): Promise<LegalAcceptance | null> => {
    const stored = await storage.get<LegalAcceptance | null>(storage.keys.LEGAL_ACCEPTED);
    return stored ?? null;
};

export const getLegalAcceptance = async (): Promise<LegalAcceptance | null> => {
    const stored = await getStoredLegalAcceptance();
    if (!stored?.acceptedAt) return null;
    if (stored.version !== LEGAL_VERSION) return null;
    return stored;
};

export const recordLegalAcceptance = async (): Promise<LegalAcceptance> => {
    const acceptance: LegalAcceptance = {
        acceptedAt: Date.now(),
        version: LEGAL_VERSION,
    };
    await storage.set(storage.keys.LEGAL_ACCEPTED, acceptance);
    notifyListeners(acceptance);
    return acceptance;
};

export const clearLegalAcceptance = async (): Promise<void> => {
    await storage.set(storage.keys.LEGAL_ACCEPTED, null as unknown as LegalAcceptance);
    notifyListeners(null);
};

export const subscribeLegalAcceptance = (listener: LegalListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
