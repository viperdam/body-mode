
import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';
import { checkNetworkConnection, onNetworkEvent } from '../services/offlineService';
import storage from '../services/storageService';

export const OfflineBanner: React.FC = () => {
    const { t } = useLanguage();
    const [isConnected, setIsConnected] = useState(true);
    const [monitoringEnabled, setMonitoringEnabled] = useState(true);
    const [animation] = useState(new Animated.Value(0));
    const offlineStreakRef = useRef(0);
    const isConnectedRef = useRef(true);

    useEffect(() => {
        let unsubscribeStorage: (() => void) | null = null;

        const hydrateMonitoring = async () => {
            try {
                const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
                const enabled = prefs?.networkMonitoringEnabled !== false;
                setMonitoringEnabled(enabled);
            } catch {
                setMonitoringEnabled(true);
            }
        };

        hydrateMonitoring();
        unsubscribeStorage = storage.subscribe((key, value) => {
            if (key === storage.keys.APP_PREFERENCES) {
                const prefs = value as any;
                const enabled = prefs?.networkMonitoringEnabled !== false;
                setMonitoringEnabled(enabled);
            }
        });

        return () => {
            unsubscribeStorage?.();
        };
    }, []);

    useEffect(() => {
        if (!monitoringEnabled) {
            offlineStreakRef.current = 0;
            isConnectedRef.current = true;
            setIsConnected(true);
            return;
        }

        const applyConnected = (connected: boolean) => {
            offlineStreakRef.current = connected ? 0 : offlineStreakRef.current + 1;
            const shouldShowOffline = offlineStreakRef.current >= 2;
            const nextConnected = !shouldShowOffline;

            if (nextConnected !== isConnectedRef.current) {
                isConnectedRef.current = nextConnected;
                setIsConnected(nextConnected);
                Animated.timing(animation, {
                    toValue: nextConnected ? 0 : 1,
                    duration: 300,
                    useNativeDriver: true,
                }).start();
            }
        };

        const hydrate = async () => {
            try {
                const connected = await checkNetworkConnection();
                applyConnected(connected);
            } catch (e) {
                // Ignore errors in network check
                if (__DEV__) {
                    console.log('Network check failed', e);
                }
            }
        };

        hydrate();
        const unsubscribe = onNetworkEvent('statusChanged', (state) => {
            applyConnected(state.isOnline);
        });

        return () => {
            unsubscribe();
        };
    }, [animation, monitoringEnabled]);

    if (isConnected) return null;

    return (
        <Animated.View style={[styles.container, {
            transform: [{
                translateY: animation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-50, 0]
                })
            }]
        }]} pointerEvents="none">
            <Text style={styles.text}>{t('offline.banner')}</Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 50, // Below status bar
        left: 20,
        right: 20,
        backgroundColor: '#ef4444',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    text: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    }
});
