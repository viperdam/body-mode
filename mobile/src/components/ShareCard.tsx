import React from 'react';
import { View, Text, StyleSheet, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '../contexts/LanguageContext';

const { width } = Dimensions.get('window');

interface ShareCardProps {
    date: string;
    neuralBattery: number;
    streak: number;
    viewRef?: React.RefObject<any>; // Passed from parent to capture this specific view
}

export const ShareCard: React.FC<ShareCardProps> = ({
    date,
    neuralBattery,
    streak,
    viewRef
}) => {
    const { t } = useLanguage();
    return (
        <View
            ref={viewRef}
            collapsable={false}
            style={styles.container}
        >
            <LinearGradient
                colors={['#0f172a', '#1e293b']}
                style={styles.gradient}
            >
                {/* Brand Header */}
                <View style={styles.header}>
                    <Text style={styles.brandName}>{t('share_card.brand')}</Text>
                    <Text style={styles.date}>{date}</Text>
                </View>

                {/* Main Stat: Neural Battery */}
                <View style={styles.mainStat}>
                    <View style={styles.batteryRing}>
                        <Text style={styles.batteryValue}>{neuralBattery}%</Text>
                        <Text style={styles.batteryLabel}>{t('share_card.neural_battery')}</Text>
                    </View>
                </View>

                {/* Secondary Stats */}
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>🔥 {streak}</Text>
                        <Text style={styles.statLabel}>{t('share_card.day_streak')}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>✨ {t('share_card.ai_badge')}</Text>
                        <Text style={styles.statLabel}>{t('share_card.plan_ready')}</Text>
                    </View>
                </View>

                {/* Footer */}
                <Text style={styles.footer}>{t('share_card.footer')}</Text>
            </LinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 375, // Fixed width for consistent sharing (Instagram Story width approx)
        height: 667, // Fixed height (Instagram Story height approx)
        position: 'absolute',
        top: 2000, // Hide off-screen
        left: 0,
        backgroundColor: '#0f172a',
    },
    gradient: {
        flex: 1,
        padding: 32,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        marginTop: 40,
    },
    brandName: {
        fontSize: 24,
        fontWeight: '900',
        color: '#ffffff',
        letterSpacing: 4,
    },
    date: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    mainStat: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
    },
    batteryRing: {
        width: 220,
        height: 220,
        borderRadius: 110,
        borderWidth: 12,
        borderColor: '#22c55e', // Dynamic color based on score in real app
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    batteryValue: {
        fontSize: 64,
        fontWeight: '900',
        color: '#ffffff',
    },
    batteryLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#22c55e',
        marginTop: 4,
        letterSpacing: 2,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 24,
        marginBottom: 40,
    },
    statBox: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '700',
        letterSpacing: 1,
    },
    footer: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 20,
    },
});
