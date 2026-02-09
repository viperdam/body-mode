import React, { useCallback, useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useLanguage } from '../contexts/LanguageContext';
import { usePermissionContext } from '../contexts/PermissionContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'PermissionDisclosure'>;
type PermissionDisclosureRoute = RouteProp<RootStackParamList, 'PermissionDisclosure'>;

const PermissionDisclosureScreen: React.FC = () => {
    const { t } = useLanguage();
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<PermissionDisclosureRoute>();
    const {
        requestForegroundLocation,
        requestBackgroundLocation,
        dismissDisclosure,
        openSettings,
        isLoading,
        error,
        blockedType,
        dismissBlocked,
    } = usePermissionContext();

    const type = route.params?.type ?? 'foreground';
    const isBackground = type === 'background';

    const title = isBackground
        ? t('permissions.background_location.title')
        : t('permissions.foreground.title');

    const description = useMemo(() => {
        if (!isBackground) {
            return (
                <Text style={styles.description}>
                    {t('permissions.foreground.description')}
                </Text>
            );
        }

        return (
            <Text style={styles.description}>
                {t('permissions.background_location.description_prefix')}{' '}
                <Text style={styles.highlight}>{t('permissions.background_location.highlight_location')}</Text>{' '}
                {t('permissions.background_location.description_in')}{' '}
                <Text style={styles.highlight}>{t('permissions.background_location.highlight_background')}</Text>{' '}
                {t('permissions.background_location.description_to_improve')}{' '}
                <Text style={styles.highlight}>{t('permissions.background_location.highlight_sleep')}</Text>{' '}
                {t('permissions.background_location.description_suffix')}
            </Text>
        );
    }, [isBackground, t]);

    const featureKeys = isBackground
        ? [
            'permissions.background_location.feature.indoor_outdoor',
            'permissions.background_location.feature.local_only',
            'permissions.background_location.feature.disable_anytime',
        ]
        : [
            'permissions.foreground.feature.weather',
            'permissions.foreground.feature.privacy',
        ];

    const blocked = blockedType === type;
    const blockedBodyKey = isBackground
        ? 'permissions.blocked.body_background'
        : 'permissions.blocked.body_foreground';

    const handleAllow = useCallback(async () => {
        const granted = isBackground
            ? await requestBackgroundLocation()
            : await requestForegroundLocation();

        if (granted) {
            navigation.goBack();
        }
    }, [isBackground, navigation, requestBackgroundLocation, requestForegroundLocation]);

    const handleDeny = useCallback(() => {
        dismissDisclosure('deny');
        navigation.goBack();
    }, [dismissDisclosure, navigation]);

    const handleClose = useCallback(() => {
        dismissDisclosure('dismiss');
        navigation.goBack();
    }, [dismissDisclosure, navigation]);

    const handleOpenSettings = useCallback(() => {
        openSettings();
    }, [openSettings]);

    const handleBlockedDismiss = useCallback(() => {
        dismissBlocked();
        navigation.goBack();
    }, [dismissBlocked, navigation]);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.icon}>{isBackground ? '🌙' : '📍'}</Text>
                    <Text style={styles.title}>{title}</Text>
                </View>

                {blocked ? (
                    <View style={styles.blockedCard}>
                        <Text style={styles.blockedTitle}>{t('permissions.blocked.title')}</Text>
                        <Text style={styles.blockedBody}>{t(blockedBodyKey)}</Text>
                        <TouchableOpacity style={styles.primaryButton} onPress={handleOpenSettings}>
                            <Text style={styles.primaryButtonText}>{t('permissions.blocked.open_settings')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleBlockedDismiss}>
                            <Text style={styles.secondaryButtonText}>{t('permissions.blocked.maybe_later')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {description}
                        <Text style={styles.sectionLabel}>
                            {t(isBackground ? 'permissions.background_location.section_title' : 'permissions.foreground.section_title')}
                        </Text>
                        <View style={styles.features}>
                            {featureKeys.map((key) => (
                                <View key={key} style={styles.featureItem}>
                                    <Text style={styles.featureIcon}>✓</Text>
                                    <Text style={styles.featureText}>{t(key)}</Text>
                                </View>
                            ))}
                        </View>
                        {isBackground && (
                            <Text style={styles.privacyNote}>{t('permissions.background_location.privacy_note')}</Text>
                        )}
                        {error && (
                            <Text style={styles.errorText}>{error}</Text>
                        )}
                        <TouchableOpacity style={styles.primaryButton} onPress={handleAllow} disabled={isLoading}>
                            {isLoading ? (
                                <ActivityIndicator color="#0f172a" />
                            ) : (
                                <Text style={styles.primaryButtonText}>
                                    {t(isBackground ? 'permissions.background_location.allow' : 'permissions.foreground.allow')}
                                </Text>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleDeny} disabled={isLoading}>
                            <Text style={styles.secondaryButtonText}>
                                {t(isBackground ? 'permissions.background_location.deny' : 'permissions.foreground.deny')}
                            </Text>
                        </TouchableOpacity>
                    </>
                )}

                <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                    <Text style={styles.closeButtonText}>{t('back')}</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    content: {
        padding: 24,
        gap: 16,
    },
    header: {
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    icon: {
        fontSize: 40,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#f8fafc',
        textAlign: 'center',
    },
    description: {
        color: 'rgba(248, 250, 252, 0.75)',
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
    },
    highlight: {
        color: '#38bdf8',
        fontWeight: '700',
    },
    features: {
        gap: 10,
        marginTop: 8,
    },
    sectionLabel: {
        marginTop: 14,
        color: 'rgba(226, 232, 240, 0.85)',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        textAlign: 'center',
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    featureIcon: {
        color: '#22c55e',
        fontSize: 14,
        fontWeight: '700',
    },
    featureText: {
        color: 'rgba(226, 232, 240, 0.9)',
        fontSize: 13,
        flex: 1,
    },
    privacyNote: {
        marginTop: 8,
        color: 'rgba(148, 163, 184, 0.8)',
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    errorText: {
        color: '#f97316',
        textAlign: 'center',
        fontSize: 12,
    },
    primaryButton: {
        marginTop: 12,
        backgroundColor: '#06b6d4',
        borderRadius: 14,
        paddingVertical: 12,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#0f172a',
        fontWeight: '700',
    },
    secondaryButton: {
        borderRadius: 14,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.4)',
    },
    secondaryButtonText: {
        color: 'rgba(226, 232, 240, 0.9)',
        fontWeight: '600',
    },
    blockedCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 20,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(248, 113, 113, 0.4)',
    },
    blockedTitle: {
        color: '#f87171',
        fontWeight: '700',
        fontSize: 16,
        textAlign: 'center',
    },
    blockedBody: {
        color: 'rgba(226, 232, 240, 0.9)',
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'center',
    },
    closeButton: {
        alignItems: 'center',
        marginTop: 8,
    },
    closeButtonText: {
        color: 'rgba(148, 163, 184, 0.8)',
        fontSize: 13,
    },
});

export default PermissionDisclosureScreen;
