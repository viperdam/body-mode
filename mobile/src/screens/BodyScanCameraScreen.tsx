import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator, Image, Alert, AppState } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useLanguage } from '../contexts/LanguageContext';
import { useEnergy } from '../contexts/EnergyContext';
import { bodyProgressService } from '../services/bodyProgressService';
import bodyPhotoConsentService from '../services/bodyPhotoConsentService';
import { JOB_ENERGY_COSTS } from '../services/energyService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'BodyScanCamera'>;

const energyCost = JOB_ENERGY_COSTS.ANALYZE_BODY_SCAN || 0;

const BodyScanCameraScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const { t, language } = useLanguage();
    const { canAfford, showAdRecharge, queueEnergyRetry, energy } = useEnergy();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [facing, setFacing] = useState<CameraType>('front');
    const [cameraKey, setCameraKey] = useState(0);
    const [captured, setCaptured] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [appState, setAppState] = useState<'active' | 'background'>('active');

    useFocusEffect(
        useCallback(() => {
            const subscription = AppState.addEventListener('change', state => {
                setAppState(state === 'active' ? 'active' : 'background');
                if (state === 'active') {
                    setCameraKey(prev => prev + 1);
                }
            });
            return () => subscription.remove();
        }, [])
    );

    const canShowCamera = permission?.granted && appState === 'active' && !captured;

    const ensureConsent = useCallback(async (): Promise<boolean> => {
        const hasConsent = await bodyPhotoConsentService.hasConsent();
        if (hasConsent) return true;
        Alert.alert(
            t('body_progress.consent.title'),
            t('body_progress.consent.body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('body_progress.consent.allow'),
                    onPress: async () => {
                        await bodyPhotoConsentService.grantConsent('body_progress');
                    },
                },
            ]
        );
        return false;
    }, [t]);

    const handleCapture = useCallback(async () => {
        if (!(await ensureConsent())) return;
        if (!cameraRef.current) return;
        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.85,
                base64: false,
            });
            if (photo?.uri) {
                setCaptured(photo.uri);
            }
        } catch (error) {
            console.warn('[BodyScanCamera] capture failed', error);
            Alert.alert(t('alert.error'), t('alert.failed'));
        }
    }, [ensureConsent, t]);

    const handlePickImage = useCallback(async () => {
        if (!(await ensureConsent())) return;
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 1,
                base64: false,
            });
            if (!result.canceled && result.assets?.length) {
                setCaptured(result.assets[0].uri);
            }
        } catch (error) {
            console.warn('[BodyScanCamera] pick failed', error);
            Alert.alert(t('alert.error'), t('alert.failed'));
        }
    }, [ensureConsent, t]);

    const handleConfirm = useCallback(async () => {
        if (!captured) return;
        if (energyCost > 0 && !canAfford(energyCost)) {
            Alert.alert(
                t('alert.low_energy'),
                t('body_progress.alert.low_energy', { cost: energyCost, energy })
            );
            queueEnergyRetry(() => handleConfirm());
            showAdRecharge();
            return;
        }
        setIsSaving(true);
        try {
            const scan = await bodyProgressService.createScan(captured);
            await bodyProgressService.queueAnalysis(scan.id, { language });
            navigation.replace('BodyProgressReport', { scanId: scan.id });
        } catch (error: any) {
            Alert.alert(t('alert.error'), error?.message || t('alert.failed'));
        } finally {
            setIsSaving(false);
        }
    }, [captured, canAfford, energy, language, navigation, queueEnergyRetry, showAdRecharge, t]);

    const handleRequestPermission = useCallback(async () => {
        try {
            await requestPermission();
        } catch (error) {
            Alert.alert(t('alert.error'), t('alert.failed'));
        }
    }, [requestPermission, t]);

    if (!permission?.granted) {
        return (
            <SafeAreaView style={styles.permissionContainer}>
                <Text style={styles.permissionTitle}>{t('permissions.camera.title')}</Text>
                <Text style={styles.permissionText}>{t('permissions.camera.desc')}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={handleRequestPermission}>
                    <Text style={styles.primaryButtonText}>{t('background_permissions.overlay_permission.action')}</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            {captured ? (
                <View style={styles.previewContainer}>
                    <Image source={{ uri: captured }} style={styles.previewImage} />
                    <View style={styles.previewActions}>
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => setCaptured(null)} disabled={isSaving}>
                            <Text style={styles.secondaryButtonText}>{t('body_progress.camera.retake')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.primaryButton} onPress={handleConfirm} disabled={isSaving}>
                            {isSaving ? (
                                <ActivityIndicator color="#020617" />
                            ) : (
                                <Text style={styles.primaryButtonText}>{t('body_progress.camera.analyze')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <>
                    <View style={styles.cameraWrapper}>
                        {canShowCamera && (
                            <CameraView
                                key={cameraKey}
                                ref={cameraRef}
                                style={styles.camera}
                                facing={facing}
                            />
                        )}
                        <View style={styles.overlay} pointerEvents="none">
                            <Text style={styles.overlayText}>{t('body_progress.camera.subtitle')}</Text>
                        </View>
                    </View>
                    <SafeAreaView style={styles.controls}>
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => setFacing(f => (f === 'front' ? 'back' : 'front'))}>
                            <Text style={styles.secondaryButtonText}>🔄</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
                            <View style={styles.captureInner} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handlePickImage}>
                            <Text style={styles.secondaryButtonText}>🖼️</Text>
                        </TouchableOpacity>
                    </SafeAreaView>
                </>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    cameraWrapper: {
        flex: 1,
    },
    camera: {
        flex: 1,
    },
    overlay: {
        position: 'absolute',
        bottom: 120,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    overlayText: {
        color: '#e2e8f0',
        fontSize: 14,
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 12,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: 20,
    },
    captureButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 4,
        borderColor: '#38bdf8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    captureInner: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: '#38bdf8',
    },
    secondaryButton: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    secondaryButtonText: {
        color: '#ffffff',
        fontWeight: '600',
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeText: {
        color: '#ffffff',
        fontSize: 18,
    },
    previewContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    previewImage: {
        width: '100%',
        height: '70%',
        borderRadius: 16,
    },
    previewActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
    },
    primaryButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        backgroundColor: '#38bdf8',
        minWidth: 120,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#020617',
        fontWeight: '700',
    },
    permissionContainer: {
        flex: 1,
        backgroundColor: '#020617',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    permissionTitle: {
        color: '#ffffff',
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 12,
    },
    permissionText: {
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        marginBottom: 20,
    },
});

export default BodyScanCameraScreen;
