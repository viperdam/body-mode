// Plan Generation Banner - Shows status when plan is being generated
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { llmQueueService, QueueStatus } from '../services/llmQueueService';
import { useLanguage } from '../contexts/LanguageContext';

interface PlanGenerationBannerProps {
    isTemporary?: boolean;
    onRetry?: () => void;
}

const PlanGenerationBanner: React.FC<PlanGenerationBannerProps> = ({
    isTemporary = false,
    onRetry
}) => {
    const { t } = useLanguage();
    const [queueStatus, setQueueStatus] = useState<QueueStatus>(llmQueueService.getStatus());
    const [pulseAnim] = useState(new Animated.Value(1));
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const unsubscribe = llmQueueService.addStatusListener(setQueueStatus);
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        // Show banner if plan is temporary OR queue is generating a plan
        const isGenerating = queueStatus.processing && queueStatus.currentJobType === 'GENERATE_PLAN';
        const isPending = queueStatus.pending > 0;

        setVisible(isTemporary || isGenerating || (isPending && isTemporary));
    }, [isTemporary, queueStatus]);

    useEffect(() => {
        if (visible) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.6,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [visible]);

    if (!visible) return null;

    const getMessage = () => {
        if (queueStatus.processing && queueStatus.currentJobType === 'GENERATE_PLAN') {
            return t('plan_banner.generating');
        }
        if (queueStatus.rateLimited) {
            const remainingMs = (queueStatus.rateLimitEndsAt || 0) - Date.now();
            const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
            return t('plan_banner.cooldown', { seconds: remainingSec });
        }
        if (isTemporary) {
            return t('plan_banner.temporary');
        }
        return t('plan_banner.default');
    };

    return (
        <Animated.View style={[styles.container, { opacity: pulseAnim }]}>
            <View style={styles.iconContainer}>
                <Text style={styles.icon}>🤖</Text>
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.message}>{getMessage()}</Text>
                <Text style={styles.submessage}>
                    {t('plan_banner.submessage')}
                </Text>
            </View>
            {onRetry && (
                <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
                    <Text style={styles.retryText}>{t('plan_banner.retry')}</Text>
                </TouchableOpacity>
            )}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        borderRadius: 12,
        padding: 14,
        marginHorizontal: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.3)',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    icon: {
        fontSize: 20,
    },
    textContainer: {
        flex: 1,
    },
    message: {
        color: '#06b6d4',
        fontSize: 14,
        fontWeight: '600',
    },
    submessage: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 12,
        marginTop: 2,
    },
    retryBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(6, 182, 212, 0.3)',
        borderRadius: 8,
    },
    retryText: {
        color: '#06b6d4',
        fontSize: 12,
        fontWeight: '600',
    },
});

export default PlanGenerationBanner;
