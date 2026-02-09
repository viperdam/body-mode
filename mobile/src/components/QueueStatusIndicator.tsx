// Queue Status Indicator - Shows queue status and rate limit info
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { llmQueueService, QueueStatus } from '../services/llmQueueService';
import { useLanguage } from '../contexts/LanguageContext';

interface QueueStatusIndicatorProps {
    /** Whether to show even when idle */
    showWhenIdle?: boolean;
    /** Custom style override */
    style?: any;
}

const QueueStatusIndicator: React.FC<QueueStatusIndicatorProps> = ({
    showWhenIdle = false,
    style
}) => {
    const { t } = useLanguage();
    const [status, setStatus] = useState<QueueStatus>(llmQueueService.getStatus());
    const [pulseAnim] = useState(new Animated.Value(1));

    useEffect(() => {
        // Subscribe to status changes
        const unsubscribe = llmQueueService.addStatusListener(setStatus);

        return () => {
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (status.processing || status.rateLimited) {
            // Start pulsing animation
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.5,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            // Stop animation
            pulseAnim.setValue(1);
        }
    }, [status.processing, status.rateLimited]);

    // Don't show if idle and showWhenIdle is false
    if (!showWhenIdle && !status.processing && !status.rateLimited && status.pending === 0) {
        return null;
    }

    const getStatusColor = () => {
        if (status.rateLimited) return '#ef4444'; // Red
        if (status.processing) return '#f59e0b'; // Amber
        if (status.pending > 0) return '#06b6d4'; // Cyan
        return '#22c55e'; // Green - idle
    };

    const getStatusText = () => {
        if (status.rateLimited) {
            const remainingMs = status.rateLimitEndsAt
                ? Math.max(0, status.rateLimitEndsAt - Date.now())
                : 0;
            const remainingSec = Math.ceil(remainingMs / 1000);
            return t('queue_status.cooldown', { seconds: remainingSec });
        }
        if (status.processing) {
            return status.pending > 0
                ? t('queue_status.working_queued', { count: status.pending })
                : t('queue_status.working');
        }
        if (status.pending > 0) {
            return t('queue_status.pending', { count: status.pending });
        }
        return t('queue_status.ready');
    };

    const getStatusIcon = () => {
        if (status.rateLimited) return '⏳';
        if (status.processing) return '🤖';
        if (status.pending > 0) return '⏱️';
        return '✅';
    };

    return (
        <Animated.View
            style={[
                styles.container,
                { opacity: pulseAnim, borderColor: getStatusColor() },
                style
            ]}
        >
            <View style={[styles.dot, { backgroundColor: getStatusColor() }]} />
            <Text style={styles.icon}>{getStatusIcon()}</Text>
            <Text style={styles.text}>{getStatusText()}</Text>
        </Animated.View>
    );
};

/**
 * Compact version for inline use (e.g., in headers)
 */
export const QueueStatusBadge: React.FC<{ style?: any }> = ({ style }) => {
    const [status, setStatus] = useState<QueueStatus>(llmQueueService.getStatus());

    useEffect(() => {
        const unsubscribe = llmQueueService.addStatusListener(setStatus);
        return () => unsubscribe();
    }, []);

    // Only show when busy or rate limited
    if (!status.processing && !status.rateLimited && status.pending === 0) {
        return null;
    }

    const getColor = () => {
        if (status.rateLimited) return '#ef4444';
        if (status.processing) return '#f59e0b';
        return '#06b6d4';
    };

    return (
        <View style={[styles.badge, { backgroundColor: getColor() }, style]}>
            <Text style={styles.badgeText}>
                {status.rateLimited ? '⏳' : status.processing ? '🤖' : `${status.pending}`}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: 1,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    icon: {
        fontSize: 14,
        marginRight: 6,
    },
    text: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 12,
        fontWeight: '500',
    },
    badge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '700',
    },
});

export default QueueStatusIndicator;
