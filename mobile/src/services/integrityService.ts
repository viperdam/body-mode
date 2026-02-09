import { NativeModules, Platform } from 'react-native';
import storage from './storageService';

export type IntegrityProvider = 'play_integrity' | 'app_attest' | 'none';

type IntegrityToken = {
    provider: IntegrityProvider;
    token: string;
    nonce: string;
    issuedAt: number;
    expiresAt: number;
};

const TOKEN_TTL_MS = 4 * 60 * 1000;
const TOKEN_SKEW_MS = 20 * 1000;

const IntegrityBridge = NativeModules.IntegrityBridge;
const AppAttestBridge = NativeModules.AppAttestBridge;

let cachedToken: IntegrityToken | null = null;
let tokenInFlight: Promise<IntegrityToken | null> | null = null;

const buildNonce = (): string =>
    `nonce_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const resolveProvider = (): IntegrityProvider => {
    if (Platform.OS === 'android') return 'play_integrity';
    if (Platform.OS === 'ios') return 'app_attest';
    return 'none';
};

const requestNativeToken = async (provider: IntegrityProvider, nonce: string): Promise<string | null> => {
    if (provider === 'play_integrity') {
        if (!IntegrityBridge?.requestToken) return null;
        return IntegrityBridge.requestToken(nonce);
    }

    if (provider === 'app_attest') {
        if (!AppAttestBridge?.requestToken) return null;
        return AppAttestBridge.requestToken(nonce);
    }

    return null;
};

export const getAppInstanceId = async (): Promise<string> => {
    let existing = await storage.get<string>(storage.keys.APP_INSTANCE_ID);
    if (existing) return existing;

    const created = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    await storage.set(storage.keys.APP_INSTANCE_ID, created);
    return created;
};

export const getIntegrityToken = async (force = false): Promise<IntegrityToken | null> => {
    const now = Date.now();
    if (!force && cachedToken && cachedToken.expiresAt - TOKEN_SKEW_MS > now) {
        return cachedToken;
    }

    if (tokenInFlight) {
        return tokenInFlight;
    }

    const provider = resolveProvider();
    if (provider === 'none') return null;

    const nonce = buildNonce();

    tokenInFlight = (async () => {
        try {
            const token = await requestNativeToken(provider, nonce);
            if (!token) return null;

            const issuedAt = Date.now();
            const integrityToken: IntegrityToken = {
                provider,
                token,
                nonce,
                issuedAt,
                expiresAt: issuedAt + TOKEN_TTL_MS,
            };

            cachedToken = integrityToken;
            return integrityToken;
        } catch (error) {
            console.warn('[Integrity] Token request failed:', error);
            return null;
        } finally {
            tokenInFlight = null;
        }
    })();

    return tokenInFlight;
};

export const getIntegrityHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
        'X-App-Platform': Platform.OS,
    };

    const instanceId = await getAppInstanceId();
    headers['X-App-Instance'] = instanceId;

    const token = await getIntegrityToken();
    if (token?.token) {
        headers['X-Integrity-Provider'] = token.provider;
        headers['X-Integrity-Token'] = token.token;
        headers['X-Integrity-Nonce'] = token.nonce;
    } else {
        headers['X-Integrity-Provider'] = 'none';
    }

    return headers;
};

export const clearIntegrityCache = (): void => {
    cachedToken = null;
};
