// ContextStatus Component - Shows user's current context/activity
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { useLanguage } from '../contexts/LanguageContext';

type ActivityContext = 'resting' | 'walking' | 'exercising' | 'working' | 'commuting' | 'unknown';

interface ContextStatusProps {
    onContextChange?: (context: ActivityContext) => void;
    compact?: boolean;
}

export const ContextStatus: React.FC<ContextStatusProps> = ({ onContextChange, compact = false }) => {
    const { t } = useLanguage();
    const [context, setContext] = useState<ActivityContext>('unknown');
    const [motionLevel, setMotionLevel] = useState(0);

    useEffect(() => {
        let subscription: { remove: () => void } | null = null;

        const startDetection = async () => {
            const { status } = await Accelerometer.getPermissionsAsync();
            if (status === 'granted') {
                Accelerometer.setUpdateInterval(1000);

                subscription = Accelerometer.addListener(({ x, y, z }) => {
                    const magnitude = Math.sqrt(x * x + y * y + z * z);
                    const movement = Math.abs(magnitude - 1) * 100;
                    setMotionLevel(movement);

                    // Determine context from motion
                    let newContext: ActivityContext;
                    if (movement < 2) {
                        newContext = 'resting';
                    } else if (movement < 10) {
                        newContext = 'working';
                    } else if (movement < 30) {
                        newContext = 'walking';
                    } else {
                        newContext = 'exercising';
                    }

                    if (newContext !== context) {
                        setContext(newContext);
                        onContextChange?.(newContext);
                    }
                });
            }
        };

        startDetection();

        return () => { subscription?.remove(); };
    }, [context, onContextChange]);

    const getContextEmoji = () => {
        switch (context) {
            case 'resting': return '😌';
            case 'working': return '💼';
            case 'walking': return '🚶';
            case 'exercising': return '🏃';
            case 'commuting': return '🚗';
            default: return '❓';
        }
    };

    const getContextLabel = () => {
        switch (context) {
            case 'resting': return t('context.resting');
            case 'working': return t('context.working');
            case 'walking': return t('context.walking');
            case 'exercising': return t('context.exercising');
            case 'commuting': return t('context.commuting');
            default: return t('context.detecting');
        }
    };

    const getContextColor = () => {
        switch (context) {
            case 'resting': return '#22c55e';
            case 'working': return '#06b6d4';
            case 'walking': return '#eab308';
            case 'exercising': return '#ef4444';
            case 'commuting': return '#8b5cf6';
            default: return '#64748b';
        }
    };

    if (compact) {
        return (
            <View style={[styles.compactContainer, { borderColor: getContextColor() }]}>
                <Text style={styles.compactEmoji}>{getContextEmoji()}</Text>
                <Text style={[styles.compactLabel, { color: getContextColor() }]}>{getContextLabel()}</Text>
            </View>
        );
    }

    return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.emoji}>{getContextEmoji()}</Text>
                    <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{t('context.current')}</Text>
                    <Text style={[styles.context, { color: getContextColor() }]}>{getContextLabel()}</Text>
                    </View>
                </View>
                <View style={styles.motionBar}>
                    <View style={[styles.motionFill, { width: `${Math.min(100, motionLevel * 3)}%`, backgroundColor: getContextColor() }]} />
                </View>
            <Text style={styles.motionLabel}>{t('context.motion', { value: motionLevel.toFixed(1) })}</Text>
            </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    emoji: {
        fontSize: 32,
        marginRight: 12,
    },
    label: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    context: {
        fontSize: 18,
        fontWeight: '700',
    },
    motionBar: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    motionFill: {
        height: '100%',
        borderRadius: 3,
    },
    motionLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        marginTop: 6,
        textAlign: 'right',
    },
    // Compact styles
    compactContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
    },
    compactEmoji: {
        fontSize: 14,
        marginRight: 4,
    },
    compactLabel: {
        fontSize: 12,
        fontWeight: '600',
    },
});

export default ContextStatus;
