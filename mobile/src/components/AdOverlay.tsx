import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { RewardedAd, RewardedAdEventType, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { getAppInstanceId } from '../services/integrityService';
import { useLanguage } from '../contexts/LanguageContext';

const PROD_REWARDED_ANDROID_ID = 'ca-app-pub-6928555061691394/8558384890';
const PROD_REWARDED_IOS_ID = '';
const envRewardedId = Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED,
    android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED,
});
const forceTestAds = process.env.EXPO_PUBLIC_ADMOB_FORCE_TEST === 'true';
const fallbackRewardedId = Platform.select({
    ios: PROD_REWARDED_IOS_ID,
    android: PROD_REWARDED_ANDROID_ID,
});
const resolvedRewardedId = envRewardedId?.trim() || fallbackRewardedId || '';
const useTestAds = __DEV__ || forceTestAds;
const adUnitId = useTestAds ? TestIds.REWARDED : resolvedRewardedId;
const adConfigured = useTestAds || resolvedRewardedId.length > 0;
const OVERALL_VISIBLE_TIMEOUT_MS = 12000;

interface AdOverlayProps {
    visible: boolean;
    onClose: () => void;
    onReward: () => void;
    onReadyChange?: (ready: boolean) => void;
    onUnavailable?: (reason: string) => void;
    onGoPremium?: () => void;
}

export const AdOverlay: React.FC<AdOverlayProps> = ({
    visible,
    onClose,
    onReward,
    onReadyChange,
    onUnavailable,
    onGoPremium,
}) => {
    const { t } = useLanguage();
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [timedOut, setTimedOut] = useState(false); // Track if we've timed out
    const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
    const [ssvOptions, setSsvOptions] = useState<{ userId: string } | null>(null);

    // Retry limiting to prevent spam loop
    const [retryCount, setRetryCount] = useState(0);
    const [retrySignal, setRetrySignal] = useState(0);
    const lastLoadAttemptRef = useRef<number>(0);
    const MAX_RETRIES = 3;
    const MIN_RETRY_INTERVAL_MS = 10000; // 10 seconds between retries
    const INVALID_REQUEST_COOLDOWN_MS = 15000;
    const NO_FILL_COOLDOWN_MS = 30000;
    const GENERIC_ERROR_COOLDOWN_MS = 10000;

    const onRewardRef = useRef(onReward);
    const onCloseRef = useRef(onClose);
    const onReadyChangeRef = useRef(onReadyChange);
    const onUnavailableRef = useRef(onUnavailable);
    const readyStateRef = useRef(false);
    const unavailableTriggeredRef = useRef(false);
    const rewardEarnedRef = useRef(false);

    useEffect(() => {
        onRewardRef.current = onReward;
        onCloseRef.current = onClose;
        onReadyChangeRef.current = onReadyChange;
        onUnavailableRef.current = onUnavailable;
    }, [onReward, onClose, onReadyChange, onUnavailable]);

    useEffect(() => {
        if (visible) {
            unavailableTriggeredRef.current = false;
        }
    }, [visible]);

    const triggerUnavailable = (reason: string) => {
        if (unavailableTriggeredRef.current) return;
        if (!visible) return;
        unavailableTriggeredRef.current = true;
        setIsLoading(false);
        setReadyState(false);
        setTimedOut(true);
        setError(prev => prev || t('ad_overlay.error.unavailable_continue'));
        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
        }
        if (visibleTimeoutRef.current) {
            clearTimeout(visibleTimeoutRef.current);
            visibleTimeoutRef.current = null;
        }
        if (onUnavailableRef.current) {
            onUnavailableRef.current(reason);
        } else if (onCloseRef.current) {
            onCloseRef.current();
        }
    };

    useEffect(() => {
        let mounted = true;
        const loadSsvOptions = async () => {
            try {
                const instanceId = await getAppInstanceId();
                if (!mounted) return;
                setSsvOptions({ userId: instanceId });
            } catch (err) {
                console.warn('[AdOverlay] Failed to resolve SSV user id:', err);
            }
        };
        loadSsvOptions();
        return () => {
            mounted = false;
        };
    }, []);

    // Use ref to persist ad instance across re-renders
    const rewardedRef = useRef<RewardedAd | null>(null);
    const listenersAttachedRef = useRef(false);
    const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Timeout ref for cleanup
    const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
    const loadInFlightRef = useRef(false);
    const visibleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const setReadyState = (nextReady: boolean) => {
        if (readyStateRef.current === nextReady) return;
        readyStateRef.current = nextReady;
        setLoaded(nextReady);
        if (onReadyChangeRef.current) {
            onReadyChangeRef.current(nextReady);
        }
    };

    const attemptLoad = (reason: string) => {
        if (!rewardedRef.current) {
            triggerUnavailable('ad_not_initialized');
            return;
        }
        if (loadInFlightRef.current || isLoading) return;
        if (cooldownUntil && Date.now() < cooldownUntil) return;
        if (retryCount >= MAX_RETRIES) return;

        console.log(`[AdOverlay] Attempting load (${reason})`);
        loadInFlightRef.current = true;
        setIsLoading(true);
        setError(null);
        lastLoadAttemptRef.current = Date.now();
        setRetryCount(prev => prev + 1);

        // Start 15-second timeout
        loadTimeoutRef.current = setTimeout(() => {
            console.log('[AdOverlay] Ad loading timed out after 15 seconds');
            loadInFlightRef.current = false;
            setIsLoading(false);
            setReadyState(false);
            setTimedOut(true);
            setError(t('ad_overlay.error.timeout_continue'));
            triggerUnavailable('load_timeout');
        }, 15000);

        try {
            rewardedRef.current.load();
        } catch (err) {
            console.error('[AdOverlay] Load attempt failed:', err);
            loadInFlightRef.current = false;
            setError(t('ad_overlay.error.load_failed'));
            setIsLoading(false);
            if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
                loadTimeoutRef.current = null;
            }
            triggerUnavailable('load_exception');
        }
    };

    // Initialize ad instance once
    useEffect(() => {
        if (!adConfigured) {
            return;
        }
        if (!rewardedRef.current) {
            console.log('[AdOverlay] Creating RewardedAd instance');
            rewardedRef.current = RewardedAd.createForAdRequest(adUnitId, {
                requestNonPersonalizedAdsOnly: true,
                ...(ssvOptions ? { serverSideVerificationOptions: ssvOptions } : {}),
            });
        }

        const rewarded = rewardedRef.current;

        // Only attach listeners once
        if (!listenersAttachedRef.current && rewarded) {
            console.log('[AdOverlay] Attaching ad event listeners');
            listenersAttachedRef.current = true;

            const unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
                console.log('[AdOverlay] Ad loaded successfully');
                loadInFlightRef.current = false;
                setReadyState(true);
                setIsLoading(false);
                setError(null);
                setTimedOut(false);
                setRetryCount(0);
                setCooldownUntil(null);
                if (cooldownTimerRef.current) {
                    clearTimeout(cooldownTimerRef.current);
                    cooldownTimerRef.current = null;
                }
                if (loadTimeoutRef.current) {
                    clearTimeout(loadTimeoutRef.current);
                    loadTimeoutRef.current = null;
                }
            });

            const unsubscribeEarned = rewarded.addAdEventListener(
                RewardedAdEventType.EARNED_REWARD,
                (reward) => {
                    console.log('[AdOverlay] User earned reward:', reward);
                    rewardEarnedRef.current = true;
                    onRewardRef.current();
                    // Reload ad immediately after reward for next use
                    setReadyState(false);
                    setTimeout(() => {
                        attemptLoad('post-reward');
                    }, 500);
                }
            );

            // CRITICAL: Reload ad when closed (whether reward earned or not)
            const unsubscribeClosed = rewarded.addAdEventListener(
                AdEventType.CLOSED,
                () => {
                    console.log('[AdOverlay] Ad closed, reloading for next time');
                    const hadReward = rewardEarnedRef.current;
                    rewardEarnedRef.current = false;
                    setReadyState(false);
                    if (!hadReward) {
                        triggerUnavailable('closed_without_reward');
                    }
                    // Reload ad for next time
                    setTimeout(() => {
                        attemptLoad('post-close');
                    }, 1000);
                }
            );

            // Handle ad load errors
            const unsubscribeError = rewarded.addAdEventListener(
                AdEventType.ERROR,
                (error) => {
                    const errorMessage = String((error as any)?.message || error);
                    const errorCode = String((error as any)?.code || '').toLowerCase();
                    const errorCodeNumeric = String((error as any)?.code || '');
                    const tooManyFailures = errorMessage.includes('Too many recently failed requests');

                    let cooldownMs = GENERIC_ERROR_COOLDOWN_MS;
                    if (tooManyFailures || errorCode === 'invalid-request' || errorCodeNumeric === '1') {
                        cooldownMs = INVALID_REQUEST_COOLDOWN_MS;
                    } else if (errorCode === 'no-fill' || errorCodeNumeric === '3') {
                        cooldownMs = NO_FILL_COOLDOWN_MS;
                    }

                    const cooldownTarget = Date.now() + cooldownMs;
                    setCooldownUntil(cooldownTarget);
                    if (cooldownTimerRef.current) {
                        clearTimeout(cooldownTimerRef.current);
                    }
                    cooldownTimerRef.current = setTimeout(() => {
                        setCooldownUntil(null);
                        cooldownTimerRef.current = null;
                    }, cooldownMs);

                    console.error('[AdOverlay] Ad load error:', error);
                    loadInFlightRef.current = false;
                    setReadyState(false);
                    setError(t('ad_overlay.error.unavailable_retry'));
                    setIsLoading(false);
                    if (loadTimeoutRef.current) {
                        clearTimeout(loadTimeoutRef.current);
                        loadTimeoutRef.current = null;
                    }
                    triggerUnavailable(errorCode || 'ad_error');
                }
            );

            // Start initial load - delay to ensure Activity is ready
            // Fixes: [googleMobileAds/null-activity] Ad attempted to load but the current Activity was null.
            const loadDelay = setTimeout(() => {
                attemptLoad('initial');
            }, 2000); // 2 second delay for Activity to be ready

            return () => {
                console.log('[AdOverlay] Cleaning up listeners');
                clearTimeout(loadDelay);
                if (cooldownTimerRef.current) {
                    clearTimeout(cooldownTimerRef.current);
                    cooldownTimerRef.current = null;
                }
                unsubscribeLoaded();
                unsubscribeEarned();
                unsubscribeClosed();
                unsubscribeError();
                listenersAttachedRef.current = false;
            };
        }
    }, [ssvOptions]);

    useEffect(() => {
        // Clear timeout when not visible
        if (!visible) {
            if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
                loadTimeoutRef.current = null;
            }
            if (cooldownTimerRef.current) {
                clearTimeout(cooldownTimerRef.current);
                cooldownTimerRef.current = null;
            }
            setCooldownUntil(null);
            // Reset retry count when dialog closes
            setRetryCount(0);
            return;
        }

        // CRITICAL: Prevent spam loop - check retry limits and cooldown
        const now = Date.now();
        const timeSinceLastAttempt = now - lastLoadAttemptRef.current;

        if (cooldownUntil && now < cooldownUntil) {
            const waitSeconds = Math.ceil((cooldownUntil - now) / 1000);
            if (!error) {
                setError(t('ad_overlay.error.cooldown', { seconds: waitSeconds }));
            }
            return;
        }

        if (retryCount >= MAX_RETRIES) {
            if (!timedOut) {
                console.log('[AdOverlay] Max retries reached, stopping attempts');
                setTimedOut(true);
                setError(t('ad_overlay.error.unavailable_later'));
                setIsLoading(false);
                triggerUnavailable('max_retries');
            }
            return;
        }

        if (timeSinceLastAttempt < MIN_RETRY_INTERVAL_MS && lastLoadAttemptRef.current > 0) {
            console.log(`[AdOverlay] Cooldown: ${Math.ceil((MIN_RETRY_INTERVAL_MS - timeSinceLastAttempt) / 1000)}s remaining`);
            // Schedule a delayed retry instead of immediate
            const cooldownTimeout = setTimeout(() => {
                // This will trigger the effect again after cooldown
                setRetrySignal(prev => prev + 1);
            }, MIN_RETRY_INTERVAL_MS - timeSinceLastAttempt + 100);
            return () => clearTimeout(cooldownTimeout);
        }

        // Try to reload when dialog is shown and not ready
        if (visible && !loaded && !isLoading && !timedOut && rewardedRef.current) {
            attemptLoad(`attempt ${retryCount + 1}/${MAX_RETRIES}`);
        }

        // Clear timeout when ad loads successfully
        if (loaded && loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
            setRetryCount(0); // Reset on success
        }

        return () => {
            if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
                loadTimeoutRef.current = null;
            }
        };
    }, [visible, loaded, isLoading, timedOut, retryCount, retrySignal, cooldownUntil, error]);

    useEffect(() => {
        if (!visible) {
            if (visibleTimeoutRef.current) {
                clearTimeout(visibleTimeoutRef.current);
                visibleTimeoutRef.current = null;
            }
            return;
        }

        if (!adConfigured) {
            setError(t('ad_overlay.error.not_configured'));
            triggerUnavailable('not_configured');
            return;
        }

        if (visibleTimeoutRef.current) {
            clearTimeout(visibleTimeoutRef.current);
            visibleTimeoutRef.current = null;
        }

        if (loaded) return;

        visibleTimeoutRef.current = setTimeout(() => {
            if (!loaded) {
                setError(t('ad_overlay.error.visible_timeout'));
                triggerUnavailable('visible_timeout');
            }
        }, OVERALL_VISIBLE_TIMEOUT_MS);

        return () => {
            if (visibleTimeoutRef.current) {
                clearTimeout(visibleTimeoutRef.current);
                visibleTimeoutRef.current = null;
            }
        };
    }, [visible, loaded]);

    const showAd = () => {
        if (!adConfigured) {
            setError(t('ad_overlay.error.not_configured'));
            triggerUnavailable('not_configured');
            return;
        }
        if (!rewardedRef.current) {
            console.error('[AdOverlay] Ad instance not initialized');
            setError(t('ad_overlay.error.not_initialized'));
            triggerUnavailable('ad_not_initialized');
            return;
        }
        if (cooldownUntil && Date.now() < cooldownUntil) {
            const waitSeconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
            setError(t('ad_overlay.error.cooldown', { seconds: waitSeconds }));
            return;
        }

        if (loaded) {
            try {
                console.log('[AdOverlay] Showing ad');
                rewardedRef.current.show();
            } catch (err) {
                console.error('[AdOverlay] Ad show failed', err);
                setError(t('ad_overlay.error.show_failed'));
                triggerUnavailable('show_failed');
            }
        } else {
            console.log('[AdOverlay] Ad not loaded yet, attempting load');
            const now = Date.now();
            if (retryCount >= MAX_RETRIES) {
                setTimedOut(true);
                setError(t('ad_overlay.error.unavailable_later'));
                triggerUnavailable('max_retries');
                return;
            }
            if (now - lastLoadAttemptRef.current < MIN_RETRY_INTERVAL_MS) {
                const waitSeconds = Math.ceil((MIN_RETRY_INTERVAL_MS - (now - lastLoadAttemptRef.current)) / 1000);
            setError(t('ad_overlay.error.retry_wait', { seconds: waitSeconds }));
                return;
            }
            attemptLoad('manual-show');
        }
    };

    if (!visible) return null;

    return (
        <Modal transparent animationType="fade" visible={visible}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.emoji}>⚡</Text>
                    <Text style={styles.title}>{t('ad_overlay.title')}</Text>
                    <Text style={styles.subtitle}>
                        {t('ad_overlay.subtitle')}
                    </Text>

                    {error && <Text style={styles.error}>{error}</Text>}

                    {timedOut ? (
                        // Timed out - show retry and close options
                        <>
                            <TouchableOpacity
                                style={styles.watchBtn}
                                onPress={() => {
                                    setTimedOut(false);
                                    setError(null);
                                    // Will trigger reload in useEffect
                                }}
                            >
                                <Text style={styles.watchBtnText}>{t('ad_overlay.retry')}</Text>
                            </TouchableOpacity>
                            <Text style={styles.timeoutHint}>
                                {t('ad_overlay.timeout_hint')}
                            </Text>
                        </>
                    ) : (
                        <TouchableOpacity
                            style={[styles.watchBtn, (!loaded || isLoading) && styles.disabledBtn]}
                            onPress={showAd}
                            disabled={!loaded || isLoading}
                        >
                            {loaded && !isLoading ? (
                                <Text style={styles.watchBtnText}>{t('ad_overlay.watch')}</Text>
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
                                    <Text style={styles.loadingText}>{t('ad_overlay.loading')}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}

                    {onGoPremium && (
                        <TouchableOpacity style={styles.premiumBtn} onPress={onGoPremium}>
                            <Text style={styles.premiumBtnText}>{t('ad_overlay.go_premium')}</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.closeText}>{t('ad_overlay.close')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 24,
        padding: 32,
        width: '100%',
        maxWidth: 340,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    emoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 24,
    },
    watchBtn: {
        backgroundColor: '#8b5cf6',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        marginBottom: 16,
    },
    disabledBtn: {
        backgroundColor: 'rgba(139, 92, 246, 0.3)',
    },
    watchBtnText: {
        color: '#ffffff',
        fontWeight: '600',
        fontSize: 16,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
        marginLeft: 8,
    },
    closeBtn: {
        padding: 12,
    },
    closeText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
    },
    premiumBtn: {
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.6)',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        marginBottom: 8,
        backgroundColor: 'rgba(2, 132, 199, 0.15)',
    },
    premiumBtnText: {
        color: '#38bdf8',
        fontWeight: '600',
        fontSize: 16,
    },
    error: {
        color: '#ef4444',
        marginBottom: 16,
        textAlign: 'center',
    },
    timeoutHint: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 8,
    },
});
