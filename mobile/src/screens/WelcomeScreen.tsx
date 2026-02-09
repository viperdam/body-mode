// Welcome Screen - Entry point for new users
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, useWindowDimensions, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useLanguage, AVAILABLE_LANGUAGES } from '../contexts/LanguageContext';
import { LEGAL_LINKS } from '../constants/legal';
import { getLegalAcceptance, recordLegalAcceptance, subscribeLegalAcceptance } from '../services/legalService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

const WelcomeScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const { t, language, setLanguage } = useLanguage();
    const { height, width } = useWindowDimensions();
    const isLandscape = width > height;
    const isWide = width >= 768;
    const [legalAccepted, setLegalAccepted] = useState(false);

    useEffect(() => {
        let mounted = true;
        const loadAcceptance = async () => {
            const existing = await getLegalAcceptance();
            if (!mounted) return;
            if (existing?.acceptedAt) {
                setLegalAccepted(true);
            }
        };
        loadAcceptance();
        const unsubscribe = subscribeLegalAcceptance((value) => {
            if (!mounted) return;
            setLegalAccepted(!!value?.acceptedAt);
        });
        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);

    const handleContinueAsGuest = async () => {
        if (!legalAccepted) return;
        await recordLegalAcceptance();
        navigation.navigate('Permissions');
    };

    const handleSignIn = async () => {
        if (!legalAccepted) return;
        await recordLegalAcceptance();
        navigation.navigate('Auth', { source: 'welcome' });
    };

    const openLegalLink = (url: string) => {
        Linking.openURL(url).catch((error) => {
            console.warn('[Welcome] Failed to open legal link:', error);
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Background gradient */}
            <View style={styles.backgroundGradient}>
                <View style={styles.gradientOrb1} />
                <View style={styles.gradientOrb2} />
            </View>

            <ScrollView
                contentContainerStyle={[
                    styles.content,
                    {
                        minHeight: height,
                        justifyContent: isLandscape ? 'flex-start' : 'center',
                        paddingTop: isLandscape ? 16 : 24,
                        paddingBottom: isLandscape ? 24 : 32,
                        paddingHorizontal: isWide ? 48 : 32,
                    },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.contentInner, isWide && styles.contentInnerWide]}>
                {/* Logo/Icon */}
                <View style={styles.logoContainer}>
                    <Text style={styles.logoIcon}>🤖</Text>
                </View>

                {/* Title */}
                <Text style={styles.title}>{t('welcome_title')}</Text>
                <Text style={styles.subtitle}>{t('welcome_tagline')}</Text>

                {/* Feature highlights */}
                <View style={styles.features}>
                    <FeatureItem icon="📷" text={t('feature_ai_food')} />
                    <FeatureItem icon="🎯" text={t('feature_daily_plan')} />
                    <FeatureItem icon="😴" text={t('feature_sleep')} />
                    <FeatureItem icon="💬" text={t('feature_ai_coach')} />
                </View>

                {/* Language picker */}
                <View style={styles.languageCard}>
                    <Text style={styles.languageLabel}>{t('select_language')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {AVAILABLE_LANGUAGES.map((lang) => {
                            const selected = lang.code === language;
                            return (
                                <TouchableOpacity
                                    key={lang.code}
                                    style={[styles.langPill, selected && styles.langPillSelected]}
                                    onPress={() => setLanguage(lang.code)}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('welcome.select_language_accessibility', { language: lang.nativeName })}
                                    accessibilityState={{ selected }}
                                >
                                    <Text style={[styles.langText, selected && styles.langTextSelected]}>
                                        {lang.nativeName}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Get Started Button */}
                <View style={styles.legalRow}>
                    <TouchableOpacity
                        onPress={() => setLegalAccepted(prev => !prev)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: legalAccepted }}
                        style={styles.legalCheckbox}
                    >
                        <View style={[styles.legalCheckboxBox, legalAccepted && styles.legalCheckboxBoxChecked]}>
                            <Text style={styles.legalCheckboxText}>{legalAccepted ? 'x' : ''}</Text>
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.legalText}>
                        {t('legal.agree_prefix')}{' '}
                        <Text style={styles.legalLink} onPress={() => openLegalLink(LEGAL_LINKS.terms)}>
                            {t('legal.terms')}
                        </Text>{' '}
                        {t('legal.and')}{' '}
                        <Text style={styles.legalLink} onPress={() => openLegalLink(LEGAL_LINKS.privacy)}>
                            {t('legal.privacy')}
                        </Text>
                        .
                    </Text>
                </View>

                <View style={styles.buttonGroup}>
                    <TouchableOpacity
                        style={[styles.secondaryButton, !legalAccepted && styles.buttonDisabled]}
                        onPress={handleSignIn}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={t('sign_in')}
                        accessibilityHint={t('welcome.sign_in_hint')}
                        accessibilityState={{ disabled: !legalAccepted }}
                        disabled={!legalAccepted}
                    >
                        <Text style={styles.secondaryButtonText}>{t('sign_in')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, !legalAccepted && styles.buttonDisabled]}
                        onPress={handleContinueAsGuest}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={t('continue_as_guest')}
                        accessibilityHint={t('welcome.guest_hint')}
                        accessibilityState={{ disabled: !legalAccepted }}
                        disabled={!legalAccepted}
                    >
                        <Text style={styles.buttonText}>{t('continue_as_guest')}</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.disclaimer}>
                    {t('powered_by_gemini')}
                </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const FeatureItem: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
    <View style={styles.featureItem}>
        <Text style={styles.featureIcon}>{icon}</Text>
        <Text style={styles.featureText}>{text}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    backgroundGradient: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
    gradientOrb1: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        top: -100,
        right: -100,
    },
    gradientOrb2: {
        position: 'absolute',
        width: 250,
        height: 250,
        borderRadius: 125,
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        bottom: 100,
        left: -80,
    },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingVertical: 24,
    },
    contentInner: {
        width: '100%',
        maxWidth: 520,
        alignItems: 'center',
    },
    contentInnerWide: {
        maxWidth: 680,
    },
    logoContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 2,
        borderColor: 'rgba(6, 182, 212, 0.5)',
    },
    logoIcon: {
        fontSize: 48,
    },
    title: {
        fontSize: 36,
        fontWeight: '800',
        color: '#ffffff',
        marginBottom: 8,
        textShadowColor: 'rgba(6, 182, 212, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 48,
    },
    features: {
        width: '100%',
        marginBottom: 48,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 12,
        columnGap: 12,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        borderRadius: 12,
        flexGrow: 1,
        flexBasis: 240,
        flexShrink: 1,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    featureIcon: {
        fontSize: 24,
        marginRight: 16,
    },
    featureText: {
        fontSize: 16,
        color: '#ffffff',
        fontWeight: '500',
    },
    languageCard: {
        width: '100%',
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(15,23,42,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginBottom: 32,
    },
    languageLabel: {
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: 10,
    },
    langPill: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        marginRight: 8,
    },
    langPillSelected: {
        backgroundColor: '#06b6d4',
        borderColor: '#06b6d4',
    },
    langText: {
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '600',
    },
    langTextSelected: {
        color: '#020617',
    },
    button: {
        width: '100%',
        paddingVertical: 18,
        backgroundColor: '#06b6d4',
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#06b6d4',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
    },
    buttonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#020617',
    },
    buttonGroup: {
        width: '100%',
        gap: 12,
    },
    secondaryButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    legalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        marginBottom: 16,
    },
    legalCheckbox: {
        marginRight: 12,
    },
    legalCheckboxBox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    legalCheckboxBoxChecked: {
        backgroundColor: '#38bdf8',
        borderColor: '#38bdf8',
    },
    legalCheckboxText: {
        color: '#020617',
        fontWeight: '700',
        fontSize: 12,
    },
    legalText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        lineHeight: 18,
        flex: 1,
    },
    legalLink: {
        color: '#38bdf8',
        fontWeight: '600',
    },
    disclaimer: {
        marginTop: 24,
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
    },
});

export default WelcomeScreen;
