// Battery Widget Component - Shows energy level for AI calls
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useEnergy } from '../contexts/EnergyContext';
import { useLanguage } from '../contexts/LanguageContext';
import { MAX_ENERGY } from '../types';

interface BatteryWidgetProps {
    onPress?: () => void;
    compact?: boolean;
}

export const BatteryWidget: React.FC<BatteryWidgetProps> = ({ onPress, compact = false }) => {
    const { energy } = useEnergy();
    const { t } = useLanguage();

    const percentage = (energy / MAX_ENERGY) * 100;

    const getColor = () => {
        if (percentage > 60) return '#22c55e';
        if (percentage > 30) return '#eab308';
        return '#ef4444';
    };

    const getEmoji = () => {
        if (percentage > 80) return '⚡';
        if (percentage > 60) return '🔋';
        if (percentage > 30) return '🪫';
        return '❗';
    };

    if (compact) {
        return (
            <TouchableOpacity
                style={styles.compactContainer}
                onPress={onPress}
                activeOpacity={0.7}
            >
                <Text style={styles.compactEmoji}>{getEmoji()}</Text>
                <Text style={[styles.compactValue, { color: getColor() }]}>{energy}</Text>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={styles.header}>
                <Text style={styles.emoji}>{getEmoji()}</Text>
                <Text style={styles.label}>{t('energy.label')}</Text>
            </View>

            <View style={styles.batteryOuter}>
                <View style={[styles.batteryFill, { width: `${percentage}%`, backgroundColor: getColor() }]} />
            </View>

            <View style={styles.valueRow}>
                <Text style={[styles.value, { color: getColor() }]}>{energy}</Text>
                <Text style={styles.max}>/ {MAX_ENERGY}</Text>
            </View>

            {percentage < 30 && (
                <Text style={styles.warning}>{t('energy.low_warning')}</Text>
            )}
        </TouchableOpacity>
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
        fontSize: 24,
        marginRight: 8,
    },
    label: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    batteryOuter: {
        height: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 8,
    },
    batteryFill: {
        height: '100%',
        borderRadius: 6,
    },
    valueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    value: {
        fontSize: 28,
        fontWeight: '700',
    },
    max: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.4)',
        marginLeft: 4,
    },
    warning: {
        fontSize: 12,
        color: '#ef4444',
        marginTop: 8,
    },
    // Compact styles
    compactContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    compactEmoji: {
        fontSize: 14,
        marginRight: 4,
    },
    compactValue: {
        fontSize: 14,
        fontWeight: '600',
    },
});

export default BatteryWidget;
