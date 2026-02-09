import React, { useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { googleWebClientId } from '../utils/googleAuthConfig';
import authService from '../services/authService';
import firestoreService from '../services/firestoreService';
import userProfileService from '../services/userProfileService';
import cloudSyncService from '../services/cloudSyncService';
import settingsSyncService from '../services/settingsSyncService';
import accountService from '../services/accountService';
import storage from '../services/storageService';
import { analytics } from '../services/analyticsService';
import { useLanguage } from '../contexts/LanguageContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;
type AuthRouteProp = RouteProp<RootStackParamList, 'Auth'>;

const AuthScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<AuthRouteProp>();
    const { t } = useLanguage();
    const entrySource = route.params?.source ?? 'settings';
    const entryAction = route.params?.action;
    const isWelcomeFlow = entrySource === 'welcome';
    const isReauthDeleteFlow = entryAction === 'reauth_delete';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAnonymous, setIsAnonymous] = useState(authService.isAnonymous());
    const [userEmail, setUserEmail] = useState(authService.getEmail());
    const [providerIds, setProviderIds] = useState(authService.getProviderIds());
    const googleReady = !!googleWebClientId;

    useEffect(() => {
        const unsubscribe = authService.onAuthStateChange((user) => {
            setIsAnonymous(user?.isAnonymous === true);
            setUserEmail(user?.email ?? null);
            setProviderIds(authService.getProviderIds());
        });
        return () => unsubscribe();
    }, [googleWebClientId]);

    useEffect(() => {
        if (!googleWebClientId) return;
        GoogleSignin.configure({
            webClientId: googleWebClientId,
        });
    }, []);

    useEffect(() => {
        if (isReauthDeleteFlow) {
            setMode('sign_in');
            setError(null);
        }
    }, [isReauthDeleteFlow]);

    const normalizeEmail = (value: string) => value.trim().toLowerCase();

    const mapAuthError = (err: unknown): string => {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('auth/invalid-email')) return t('auth.error.invalid_email');
        if (message.includes('auth/user-not-found')) return t('auth.error.user_not_found');
        if (message.includes('auth/wrong-password')) return t('auth.error.wrong_password');
        if (message.includes('auth/weak-password')) return t('auth.error.weak_password');
        if (message.includes('auth/email-already-in-use')) return t('auth.error.email_in_use');
        if (message.includes('auth/user-mismatch')) return t('auth.error.user_mismatch');
        if (message.includes('auth/invalid-credential')) return t('auth.error.invalid_credential');
        if (message.includes('auth/requires-recent-login')) return t('auth.error.requires_recent_login');
        return t('auth.error.generic');
    };

    const formatProviders = (providers: string[]): string => {
        if (!providers.length) return t('auth.status.guest');
        const labels = providers.map((provider) => {
            if (provider === 'google.com') return t('auth.provider.google');
            if (provider === 'password') return t('auth.provider.email');
            return provider;
        });
        return `${t('auth.status.linked_prefix')} ${labels.join(', ')}`;
    };

    const promptRestoreChoice = (): Promise<'merge' | 'replace' | 'skip'> => {
        return new Promise((resolve) => {
            Alert.alert(
                t('auth.restore.title'),
                t('auth.restore.body'),
                [
                    { text: t('auth.restore.keep_local'), style: 'cancel', onPress: () => resolve('skip') },
                    { text: t('auth.restore.merge_recommended'), onPress: () => resolve('merge') },
                    { text: t('auth.restore.replace_local'), style: 'destructive', onPress: () => resolve('replace') },
                ]
            );
        });
    };

    const performCloudRestore = async (mode: 'merge' | 'replace') => {
        const result = await cloudSyncService.restoreFromCloud({ source: 'auth', mode });
        await settingsSyncService.restorePreferences({ source: 'auth', mode });

        const localProfile = await userProfileService.loadUserProfile();
        const hasLocalProfile = !!localProfile?.name;

        if (mode === 'replace' || !hasLocalProfile) {
            const cloudProfile = await firestoreService.fetchUserProfile();
            if (cloudProfile) {
                await userProfileService.saveUserProfile(cloudProfile, { source: 'cloud_restore', sync: false });
            } else {
                await userProfileService.clearUserProfile({ source: 'cloud_restore', sync: false });
            }
        } else if (localProfile) {
            await firestoreService.syncUserProfile(localProfile, { source: 'auth' });
        }

        await settingsSyncService.syncPreferences('auth');
        await cloudSyncService.syncAllNow('auth');
        return result;
    };

    const handlePostAuthSync = async (options: { forcePrompt?: boolean } = {}): Promise<boolean> => {
        let didAlert = false;
        try {
            const currentUid = authService.getUid();
            const previousUid = await storage.get<string>(storage.keys.LAST_AUTH_UID);
            const accountSwitched = !!previousUid && !!currentUid && previousUid !== currentUid;

            if (currentUid) {
                await storage.set(storage.keys.LAST_AUTH_UID, currentUid);
            }

            const [localSummary, cloudSummary, localProfile] = await Promise.all([
                cloudSyncService.getLocalSummary(),
                cloudSyncService.getCloudSummary(),
                userProfileService.loadUserProfile(),
            ]);
            const hasLocalProfile = !!localProfile?.name;
            const hasLocalData = localSummary.hasData || hasLocalProfile;

            if (!cloudSummary.hasData) {
                if (localProfile) {
                    await firestoreService.syncUserProfile(localProfile, { source: 'auth' });
                }
                await settingsSyncService.syncPreferences('auth');
                await cloudSyncService.syncAllNow('auth');
                return false;
            }

            if (!hasLocalData) {
                const restoreResult = await performCloudRestore('merge');
                Alert.alert(
                    t('auth.restore.alert.title'),
                    t('auth.restore.alert.body', {
                        plans: restoreResult.totals.plans,
                        wrapups: restoreResult.totals.wrapups,
                    })
                );
                return true;
            }

            if (accountSwitched || options.forcePrompt) {
                const choice = await promptRestoreChoice();
                if (choice === 'skip') {
                    await settingsSyncService.syncPreferences('auth');
                    await cloudSyncService.syncAllNow('auth');
                    return false;
                }
                const restoreResult = await performCloudRestore(choice);
                Alert.alert(
                    t('auth.restore.complete_title'),
                    t('auth.restore.complete_body', {
                        plans: restoreResult.totals.plans,
                        logs: Object.values(restoreResult.totals.logs).reduce((sum, count) => sum + count, 0),
                    })
                );
                return true;
            }

            await settingsSyncService.syncPreferences('auth');
            await cloudSyncService.syncAllNow('auth');
            return false;
        } catch (error) {
            analytics.logError(error, 'AuthScreen.postAuthSync');
            Alert.alert(
                t('auth.sync.signed_in_title'),
                t('auth.sync.failed_body')
            );
            didAlert = true;
        }
        return didAlert;
    };

    const routeAfterAuth = async () => {
        if (!isWelcomeFlow) return;
        const profile = await userProfileService.loadUserProfile();
        const hasProfile = !!profile?.name;
        const nextRoute: keyof RootStackParamList = hasProfile ? 'MainTabs' : 'Permissions';
        navigation.reset({
            index: 0,
            routes: [{ name: nextRoute }],
        });
    };

    const handleSubmit = async () => {
        setError(null);
        const cleanEmail = normalizeEmail(email);
        const wasAnonymous = authService.isAnonymous();

        if (!cleanEmail || !password) {
            setError(t('auth.error.required_fields'));
            return;
        }

        if (mode === 'sign_up' && password !== confirmPassword) {
            setError(t('auth.error.passwords_mismatch'));
            return;
        }

        setLoading(true);
        try {
            if (isReauthDeleteFlow) {
                await authService.reauthenticateWithEmail(cleanEmail, password);
                const result = await accountService.deleteAccountAndData({
                    source: 'reauth',
                    skipCloudDelete: true,
                });
                analytics.logEvent('auth_reauth_delete_completed', {
                    authDeleted: result.authDeleted,
                });
                if (result.requiresRecentLogin) {
                    setError(t('auth.reauth.requires_recent_login'));
                    return;
                }
                Alert.alert(t('auth.delete.success_title'), t('auth.delete.success_body'));
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Welcome' }],
                });
                return;
            }

            if (mode === 'sign_up') {
                if (authService.isAnonymous()) {
                    await authService.linkWithEmail(cleanEmail, password);
                } else {
                    await authService.signUpWithEmail(cleanEmail, password);
                }
            } else {
                await authService.signInWithEmail(cleanEmail, password);
            }

            const forcePrompt = !wasAnonymous || (wasAnonymous && mode === 'sign_in');
            const didAlert = await handlePostAuthSync({ forcePrompt });
            analytics.logEvent('auth_completed', { mode });
            if (!isWelcomeFlow && !didAlert) {
                Alert.alert(t('auth.success.title'), t('auth.success.body'));
            }
            await routeAfterAuth();
        } catch (err) {
            const message = mapAuthError(err);
            setError(message);
            analytics.logEvent('auth_failed', { mode });
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError(null);

            if (!googleWebClientId) {
                setError(t('auth.google.config_missing'));
                return;
            }

        setLoading(true);
        try {
            if (Platform.OS === 'android') {
                await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
            }
            const result = await GoogleSignin.signIn();
            // v16+ returns { type: 'success', data: { idToken, user } }
            const idToken = result.data?.idToken ?? (result as any)?.idToken;

            if (!idToken) {
                throw new Error(t('auth.google.missing_token'));
            }

            if (isReauthDeleteFlow) {
                await authService.reauthenticateWithGoogle(idToken);
                const result = await accountService.deleteAccountAndData({
                    source: 'reauth',
                    skipCloudDelete: true,
                });
                analytics.logEvent('auth_reauth_delete_completed', {
                    authDeleted: result.authDeleted,
                });
                if (result.requiresRecentLogin) {
                    setError(t('auth.reauth.requires_recent_login'));
                    return;
                }
                Alert.alert(t('auth.delete.success_title'), t('auth.delete.success_body'));
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Welcome' }],
                });
                return;
            }

            const authResult = await authService.signInWithGoogle(idToken);
            const forcePrompt = authResult.mode === 'sign_in';
            const didAlert = await handlePostAuthSync({ forcePrompt });
            analytics.logEvent('auth_google_completed', {
                mode: authResult.mode,
                recovered: !!authResult.recovered,
            });
            if (!isWelcomeFlow && !didAlert) {
                Alert.alert(t('auth.success.title'), t('auth.success.body'));
            }
            await routeAfterAuth();
        } catch (err: any) {
            if (err?.code === statusCodes.SIGN_IN_CANCELLED) {
                setError(t('auth.google.cancelled'));
            } else if (err?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                setError(t('auth.google.play_services_unavailable'));
            } else if (err?.code === statusCodes.IN_PROGRESS) {
                setError(t('auth.google.in_progress'));
            } else {
                setError(t('auth.google.failed'));
            }
            analytics.logEvent('auth_google_failed', { code: err?.code ?? 'unknown' });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordReset = async () => {
        const cleanEmail = normalizeEmail(email);
        if (!cleanEmail) {
            setError(t('auth.reset.email_required'));
            return;
        }

        setLoading(true);
        try {
            await authService.sendPasswordReset(cleanEmail);
            Alert.alert(t('auth.reset.title'), t('auth.reset.body'));
        } catch (err) {
            setError(mapAuthError(err));
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        Alert.alert(t('auth.signout.title'), t('auth.signout.body'), [
            { text: t('cancel'), style: 'cancel' },
            {
                text: t('auth.signout.action'),
                style: 'destructive',
                onPress: async () => {
                    setLoading(true);
                    try {
                        await authService.signOut();
                        try {
                            await GoogleSignin.signOut();
                        } catch {
                            // Ignore Google sign-out issues
                        }
                        const uid = authService.getUid();
                        if (uid) {
                            await storage.set(storage.keys.LAST_AUTH_UID, uid);
                        }
                        analytics.logEvent('auth_signed_out', {});
                        Alert.alert(t('auth.signout.success_title'), t('auth.signout.success_body'));
                    } finally {
                        setLoading(false);
                    }
                },
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.container}
            >
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()}>
                            <Text style={styles.backText}>{t('back')}</Text>
                        </TouchableOpacity>
                        <Text style={styles.title}>{t('account')}</Text>
                    </View>

                    {isReauthDeleteFlow && (
                        <View style={styles.noticeCard}>
                            <Text style={styles.noticeTitle}>{t('auth.reauth.title')}</Text>
                            <Text style={styles.noticeText}>{t('auth.reauth.body')}</Text>
                        </View>
                    )}

                    <View style={styles.card}>
                        <Text style={styles.label}>{t('auth.status.label')}</Text>
                        <Text style={styles.value}>
                            {isAnonymous
                                ? t('auth.status.guest')
                                : t('auth.status.signed_in_as', { email: userEmail || t('auth.status.user_fallback') })}
                        </Text>
                        <Text style={styles.subValue}>{formatProviders(providerIds)}</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.googleButton, (loading || !googleReady) && styles.buttonDisabled]}
                        onPress={handleGoogleSignIn}
                        disabled={loading || !googleReady}
                    >
                        <Text style={styles.googleButtonText}>
                            {googleReady
                                ? (loading ? t('auth.working') : t('auth.google.continue'))
                                : t('auth.google.not_configured')}
                        </Text>
                    </TouchableOpacity>

                    {!isReauthDeleteFlow && (
                        <View style={styles.modeToggle}>
                            <TouchableOpacity
                                style={[styles.modeButton, mode === 'sign_in' && styles.modeButtonActive]}
                                onPress={() => setMode('sign_in')}
                            >
                                <Text style={[styles.modeButtonText, mode === 'sign_in' && styles.modeButtonTextActive]}>
                                    {t('auth.sign_in')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modeButton, mode === 'sign_up' && styles.modeButtonActive]}
                                onPress={() => setMode('sign_up')}
                            >
                                <Text style={[styles.modeButtonText, mode === 'sign_up' && styles.modeButtonTextActive]}>
                                    {t('auth.create_account')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.form}>
                        <TextInput
                            placeholder={t('auth.placeholder.email')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            style={styles.input}
                        />
                        <TextInput
                            placeholder={t('auth.placeholder.password')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            style={styles.input}
                        />
                        {mode === 'sign_up' && (
                            <TextInput
                                placeholder={t('auth.placeholder.confirm_password')}
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry
                                style={styles.input}
                            />
                        )}

                        {error && <Text style={styles.errorText}>{error}</Text>}

                        <TouchableOpacity
                            style={[styles.primaryButton, loading && styles.buttonDisabled]}
                            onPress={handleSubmit}
                            disabled={loading}
                        >
                            <Text style={styles.primaryButtonText}>
                                {loading ? t('auth.working') : mode === 'sign_up' ? t('auth.create_account') : t('auth.sign_in')}
                            </Text>
                        </TouchableOpacity>

                        {mode === 'sign_in' && !isReauthDeleteFlow && (
                            <TouchableOpacity
                                style={styles.linkButton}
                                onPress={handlePasswordReset}
                                disabled={loading}
                            >
                                <Text style={styles.linkButtonText}>{t('auth.forgot_password')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {!isAnonymous && (
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleSignOut} disabled={loading}>
                            <Text style={styles.secondaryButtonText}>{t('auth.signout.action')}</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    content: { padding: 20, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
    backText: { color: '#38bdf8', fontSize: 16 },
    title: { color: '#ffffff', fontSize: 24, fontWeight: '700' },
    card: {
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        marginBottom: 20,
    },
    noticeCard: {
        backgroundColor: 'rgba(14, 116, 144, 0.2)',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.25)',
        marginBottom: 16,
    },
    noticeTitle: { color: '#38bdf8', fontWeight: '700', fontSize: 14, marginBottom: 4 },
    noticeText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
    label: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6 },
    value: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
    subValue: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 6 },
    googleButton: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        marginBottom: 20,
    },
    googleButtonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
    modeToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 20 },
    modeButton: { flex: 1, paddingVertical: 10, alignItems: 'center' },
    modeButtonActive: { backgroundColor: 'rgba(56, 189, 248, 0.2)', borderRadius: 12 },
    modeButtonText: { color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
    modeButtonTextActive: { color: '#38bdf8' },
    form: { gap: 12 },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: '#ffffff',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    errorText: { color: '#f97316', fontSize: 12 },
    primaryButton: {
        backgroundColor: '#06b6d4',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    primaryButtonText: { color: '#020617', fontWeight: '700', fontSize: 16 },
    buttonDisabled: { opacity: 0.6 },
    linkButton: { alignItems: 'center', marginTop: 6 },
    linkButtonText: { color: '#38bdf8', fontSize: 13 },
    secondaryButton: {
        marginTop: 20,
        borderRadius: 12,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
    },
    secondaryButtonText: { color: '#ffffff', fontWeight: '600' },
});

export default AuthScreen;
