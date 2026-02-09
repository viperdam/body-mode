// Placeholder screens for BioSync AI - remaining screens

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';

// Profile Screen - Shows user stats and history
import { healthService, HealthData } from '../services/healthService';
import { analytics } from '../services/analyticsService';
import { useState, useEffect } from 'react';

export const ProfileScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const { t } = useLanguage();
    const [healthData, setHealthData] = useState<HealthData | null>(null);

    useEffect(() => {
        analytics.logScreenView('ProfileScreen');
        loadHealthData();
    }, []);

    const loadHealthData = async () => {
        try {
            const granted = await healthService.requestPermissions();
            if (!granted) {
                return;
            }
            const data = await healthService.getDailySummary();
            setHealthData(data);
        } catch (error) {
            console.error('Failed to load health data', error);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnRow}>
                    <Ionicons name="chevron-back" size={20} color="#06b6d4" />
                    <Text style={styles.backText}>{t('back')}</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('nav.profile')}</Text>
                <View style={{ width: 50 }} />
            </View>
            <ScrollView contentContainerStyle={styles.content}>
                <Ionicons name="person" size={64} color="#e2e8f0" style={styles.emoji} />
                <Text style={styles.title}>{t('placeholder.profile.title')}</Text>
                <Text style={styles.subtitle}>{t('placeholder.profile.subtitle')}</Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('placeholder.profile.activity_title')}</Text>
                    {healthData ? (
                        <>
                            <View style={styles.statRow}>
                                <Text style={styles.statLabel}>{t('placeholder.profile.stats.steps')}</Text>
                                <Text style={styles.statValue}>{healthData.steps.toLocaleString()}</Text>
                            </View>
                            <View style={styles.statRow}>
                                <Text style={styles.statLabel}>{t('placeholder.profile.stats.calories')}</Text>
                                <Text style={styles.statValue}>
                                    {Math.round(healthData.calories)} {t('units.kcal')}
                                </Text>
                            </View>
                            <View style={styles.statRow}>
                                <Text style={styles.statLabel}>{t('placeholder.profile.stats.distance')}</Text>
                                <Text style={styles.statValue}>
                                    {(healthData.distance / 1000).toFixed(2)} {t('units.km')}
                                </Text>
                            </View>
                        </>
                    ) : (
                        <Text style={styles.cardText}>{t('placeholder.profile.loading')}</Text>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('placeholder.profile.charts_title')}</Text>
                    <Text style={styles.cardText}>
                        {t('placeholder.profile.charts_body')}
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('placeholder.profile.achievements_title')}</Text>
                    <Text style={styles.cardText}>
                        {t('placeholder.profile.achievements_body')}
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

// Settings Screen - App configuration
export const SettingsScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const { t } = useLanguage();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnRow}>
                    <Ionicons name="chevron-back" size={20} color="#06b6d4" />
                    <Text style={styles.backText}>{t('back')}</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('settings_title')}</Text>
                <View style={{ width: 50 }} />
            </View>
            <ScrollView contentContainerStyle={styles.content}>
                <Ionicons name="settings" size={64} color="#e2e8f0" style={styles.emoji} />
                <Text style={styles.title}>{t('settings_title')}</Text>
                <Text style={styles.subtitle}>{t('placeholder.settings.subtitle')}</Text>

                <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>{t('placeholder.settings.language_label')}</Text>
                    <Text style={styles.settingValue}>{t('placeholder.settings.language_value')}</Text>
                </View>

                <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>{t('placeholder.settings.notifications_label')}</Text>
                    <Text style={styles.settingValue}>{t('placeholder.settings.notifications_value')}</Text>
                </View>

                <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>{t('placeholder.settings.theme_label')}</Text>
                    <Text style={styles.settingValue}>{t('placeholder.settings.theme_value')}</Text>
                </View>

                <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>{t('placeholder.settings.units_label')}</Text>
                    <Text style={styles.settingValue}>{t('placeholder.settings.units_value')}</Text>
                </View>

                <TouchableOpacity style={styles.dangerBtn}>
                    <Text style={styles.dangerBtnText}>{t('placeholder.settings.clear_data')}</Text>
                </TouchableOpacity>

                <Text style={styles.version}>{t('placeholder.settings.version')}</Text>
                <Text style={styles.version}>{t('placeholder.settings.powered_by')}</Text>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    backBtnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    backText: {
        color: '#06b6d4',
        fontSize: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ffffff',
    },
    content: {
        padding: 24,
        alignItems: 'center',
    },
    emoji: {
        marginBottom: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 32,
        textAlign: 'center',
    },
    card: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 20,
        width: '100%',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 8,
    },
    cardText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: 20,
    },
    settingItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 12,
        padding: 16,
        width: '100%',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    settingLabel: {
        fontSize: 16,
        color: '#ffffff',
    },
    settingValue: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    dangerBtn: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderRadius: 12,
        padding: 16,
        width: '100%',
        alignItems: 'center',
        marginTop: 24,
        borderWidth: 1,
        borderColor: '#ef4444',
    },
    dangerBtnText: {
        color: '#ef4444',
        fontSize: 16,
        fontWeight: '500',
    },
    version: {
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: 12,
        marginTop: 16,
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    statLabel: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
    },
    statValue: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '600',
    },
});

export default ProfileScreen;
