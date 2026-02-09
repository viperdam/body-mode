import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';

type AvatarOption = {
    id: string;
    emoji: string;
    labelKey: string;
};

const AVATAR_OPTIONS: AvatarOption[] = [
    { id: 'default', emoji: '🤖', labelKey: 'avatar_cyborg' },
    { id: 'titan', emoji: '🦾', labelKey: 'avatar_titan' },
    { id: 'zen', emoji: '🧘', labelKey: 'avatar_zen' },
    { id: 'sprinter', emoji: '⚡', labelKey: 'avatar_sprinter' },
];

interface AvatarPickerProps {
    value: string;
    onChange: (value: string) => void;
    showTitle?: boolean;
}

const AvatarPicker: React.FC<AvatarPickerProps> = ({ value, onChange, showTitle = false }) => {
    const { t } = useLanguage();

    return (
        <View style={styles.container}>
            {showTitle && (
                <View style={styles.header}>
                    <Text style={styles.title}>{t('avatar_title')}</Text>
                    <Text style={styles.subtitle}>{t('avatar_subtitle')}</Text>
                </View>
            )}
            <View style={styles.grid}>
                {AVATAR_OPTIONS.map((option) => {
                    const selected = option.id === value;
                    return (
                        <TouchableOpacity
                            key={option.id}
                            style={[styles.card, selected && styles.cardSelected]}
                            onPress={() => onChange(option.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={t(option.labelKey)}
                        >
                            <Text style={styles.emoji}>{option.emoji}</Text>
                            <Text style={[styles.label, selected && styles.labelSelected]}>
                                {t(option.labelKey)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    header: {
        marginBottom: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ffffff',
    },
    subtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    card: {
        width: '47%',
        paddingVertical: 16,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
    },
    cardSelected: {
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
    },
    emoji: {
        fontSize: 30,
        marginBottom: 8,
    },
    label: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    labelSelected: {
        color: '#06b6d4',
    },
});

export default AvatarPicker;
