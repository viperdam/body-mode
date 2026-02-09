// Energy Context for React Native - AI call budget management
// Now integrates with headless energyService and listens for ENERGY_LOW events
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AdOverlay } from '../components';
import { Linking } from 'react-native';
import { energyService, JOB_ENERGY_COSTS } from '../services/energyService';
import { subscribe } from '../services/planEventService';
import { autoPlanService } from '../services/autoPlanService';
import { llmQueueService } from '../services/llmQueueService';
import { useSubscription } from './SubscriptionContext';
import { bioTrendsAccessService } from '../services/bioTrendsAccessService';

const MAX_ENERGY = 100;

interface EnergyContextType {
    energy: number;
    maxEnergy: number;
    consumeEnergy: (amount: number) => boolean;
    rechargeEnergy: () => void;
    canAfford: (amount: number) => boolean;
    getRechargeTime: () => string;
    showAdRecharge: () => void;
    queueEnergyRetry: (action: () => void) => void;
}

const EnergyContext = createContext<EnergyContextType>({
    energy: MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    consumeEnergy: () => false,
    rechargeEnergy: () => { },
    canAfford: () => true,
    getRechargeTime: () => '',
    showAdRecharge: () => { },
    queueEnergyRetry: () => { },
});

export const EnergyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [energy, setEnergy] = useState<number>(MAX_ENERGY);
    const [showAd, setShowAd] = useState(false);
    const pendingEnergyActionsRef = useRef<Array<() => void>>([]);
    const { isPremium, ready: subscriptionReady } = useSubscription();
    const premiumRef = useRef(isPremium);
    const subscriptionReadyRef = useRef(subscriptionReady);
    useEffect(() => {
        premiumRef.current = isPremium;
    }, [isPremium, subscriptionReady]);
    useEffect(() => {
        subscriptionReadyRef.current = subscriptionReady;
    }, [subscriptionReady]);

    const runPendingEnergyActions = () => {
        const pending = pendingEnergyActionsRef.current.splice(0);
        pending.forEach(action => {
            try {
                action();
            } catch (error) {
                console.warn('[EnergyContext] Pending energy action failed:', error);
            }
        });
    };

    const refreshAfterEnergyUnlock = async (
        source: 'ad' | 'premium',
        rechargeFn: () => Promise<void> = () => energyService.rechargeToMax()
    ) => {
        await rechargeFn();
        try {
            const result = await autoPlanService.retryPendingGeneration();
            if (result.status === 'SUCCESS') {
                console.log(`[EnergyContext] Pending plan generated after ${source} unlock`);
            }
        } catch (error) {
            console.warn(`[EnergyContext] Pending plan generation failed after ${source} unlock:`, error);
        }
        runPendingEnergyActions();
    };

    const handleAdReward = async () => {
        try {
            await refreshAfterEnergyUnlock('ad', () => energyService.rechargeFromAd());
            await bioTrendsAccessService.unlockFor(24 * 60 * 60 * 1000, 'ad');
        } catch (error) {
            console.warn('[EnergyContext] Ad recharge failed:', error);
            const message = String((error as Error)?.message || '');
            if (message.includes('ad_unavailable:cooldown')) {
                await handleAdUnavailable('ad_cooldown');
            } else if (message.includes('ad_unavailable:daily_cap')) {
                await handleAdUnavailable('ad_daily_limit');
            } else {
                await handleAdUnavailable('ad_recharge_failed');
            }
            return;
        }
        setShowAd(false);
    };

    const handlePremiumRecharge = async () => {
        await refreshAfterEnergyUnlock('premium');
        setShowAd(false);
    };

    const handleAdUnavailable = async (reason?: string) => {
        if (reason) {
            console.log('[EnergyContext] Ad unavailable:', reason);
        }
        if (reason === 'ad_cooldown' || reason === 'ad_daily_limit') {
            setShowAd(false);
            return;
        }
        llmQueueService.grantEnergyBypass(1);
        try {
            await autoPlanService.retryPendingGeneration();
        } catch (error) {
            console.warn('[EnergyContext] Pending plan generation failed after ad fallback:', error);
        }
        runPendingEnergyActions();
        setShowAd(false);
    };

    const openRechargePromptIfAvailable = async (): Promise<void> => {
        if (!subscriptionReadyRef.current) {
            await handleAdUnavailable('subscription_not_ready');
            return;
        }
        const availability = await energyService.getAdAvailability();
        if (!availability.canShow) {
            const reason = availability.reason === 'cooldown' ? 'ad_cooldown' : 'ad_daily_limit';
            await handleAdUnavailable(reason);
            return;
        }
        setShowAd(true);
    };

    const handleRechargeDeepLink = async (origin: 'initial_url' | 'runtime_url'): Promise<void> => {
        const requiredEnergy = JOB_ENERGY_COSTS.GENERATE_PLAN || 15;
        const currentEnergy = await energyService.getEnergy();

        // Outside-app overlay should only open ad flow when energy is actually low.
        if (currentEnergy >= requiredEnergy) {
            console.log('[EnergyContext] Recharge deep link ignored (energy is sufficient)');
            try {
                await autoPlanService.retryPendingGeneration();
            } catch (error) {
                console.warn('[EnergyContext] Pending plan retry failed after deep link:', error);
            }
            runPendingEnergyActions();
            return;
        }

        console.log(`[EnergyContext] Recharge deep link accepted from ${origin} (energy: ${currentEnergy}/${requiredEnergy})`);
        if (premiumRef.current) {
            await handlePremiumRecharge();
            return;
        }
        await openRechargePromptIfAvailable();
    };

    const openPaywall = () => {
        setShowAd(false);
        Linking.openURL('bodymode://paywall?source=energy_low').catch((error) => {
            console.warn('[EnergyContext] Failed to open paywall link:', error);
        });
    };

    // Initialize and subscribe to energyService
    useEffect(() => {
        // Subscribe to energy changes from the headless service
        const unsubEnergy = energyService.subscribe(setEnergy);

        // Subscribe to ENERGY_LOW events from llmQueueService
        // When an LLM job fails due to low energy, show the ad overlay
        const unsubEnergyLow = subscribe('ENERGY_LOW', (data) => {
            console.log('[EnergyContext] ENERGY_LOW event received:', data);
            if (!premiumRef.current) {
                setShowAd(true);
            }
        });

        // Handle deep link for ad recharge (from native overlay)
        const handleDeepLink = (event: { url: string }) => {
            if (event.url.includes('recharge')) {
                console.log('[EnergyContext] Recharge deep link received');
                void handleRechargeDeepLink('runtime_url');
            }
        };

        // Listen for deep links while app is open
        const subscription = Linking.addEventListener('url', handleDeepLink);

        // Check initial URL (if app was opened via deep link)
        Linking.getInitialURL().then(url => {
            if (url?.includes('recharge')) {
                console.log('[EnergyContext] App opened with recharge deep link');
                void handleRechargeDeepLink('initial_url');
            }
        });

        return () => {
            unsubEnergy();
            unsubEnergyLow();
            subscription?.remove();
        };
    }, []);

    useEffect(() => {
        if (!isPremium) return;
        setShowAd(false);
        void handlePremiumRecharge();
    }, [isPremium]);

    // UI-level sync: consume via energyService
    const consumeEnergy = (amount: number): boolean => {
        // This is for UI components that still call consumeEnergy directly
        // The real consumption happens in energyService via llmQueueService
        if (isPremium) {
            return true;
        }
        energyService.consume(amount).then(success => {
            if (!success) {
                console.log('[EnergyContext] Consumption failed, showing ad overlay');
                setShowAd(true);
            }
        });
        return energy >= amount;
    };

    const canAfford = (amount: number): boolean => {
        if (isPremium) return true;
        return energy >= amount || llmQueueService.hasEnergyBypass();
    };

    const rechargeEnergy = () => {
        energyService.rechargeToMax().catch(console.error);
    };

    const getRechargeTime = (): string => {
        return energyService.getRechargeTimeString();
    };

    const queueEnergyRetry = (action: () => void) => {
        if (isPremium) {
            action();
            return;
        }
        pendingEnergyActionsRef.current.push(action);
    };

    return (
        <EnergyContext.Provider value={{
            energy,
            maxEnergy: MAX_ENERGY,
            consumeEnergy,
            rechargeEnergy,
            canAfford,
            getRechargeTime,
            showAdRecharge: () => {
                if (isPremium) {
                    void handlePremiumRecharge();
                    return;
                }
                void openRechargePromptIfAvailable();
            },
            queueEnergyRetry
        }}>
            {children}
            {!isPremium && subscriptionReady && (
                <AdOverlay
                    visible={showAd}
                    onClose={() => {
                        pendingEnergyActionsRef.current = [];
                        setShowAd(false);
                    }}
                    onReward={handleAdReward}
                    onUnavailable={handleAdUnavailable}
                    onGoPremium={openPaywall}
                />
            )}
        </EnergyContext.Provider>
    );
};

export const useEnergy = () => useContext(EnergyContext);

