// Food Analyzer Screen with Camera, Refinement, Energy Checks, and Save to Favorites
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Image,
    ActivityIndicator, ScrollView, SafeAreaView, Alert,
    TextInput, KeyboardAvoidingView, Platform, AppState, AppStateStatus, useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation, useRoute, RouteProp, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ActivityLogEntry, AppContext, DailyPlan, FoodAnalysisResult, FoodLogEntry, MoodLog, SavedMeal, UserProfile, WeightLogEntry } from '../types';
import { analyzeMedia, refineFoodAnalysis } from '../services/geminiService';
import storage from '../services/storageService';
import { useEnergy } from '../contexts/EnergyContext';
import { PermissionModal } from '../components';
import { startSpeechRecognition, isSpeechRecognitionAvailable } from '../services/speechRecognitionService';
import { useLanguage } from '../contexts/LanguageContext';
import { getLocalDateKey } from '../utils/dateUtils';
import { notifyFoodLogged, parseLLMError, getRetryDelay, LLMError } from '../services/planEventService';
import { logMealOnly, replaceAndLogMeal } from '../services/mealReplacementService';
import { llmQueueService } from '../services/llmQueueService';
import { JOB_ENERGY_COSTS } from '../services/energyService';
import { NUTRIENT_DISPLAY_NAMES, NUTRIENT_UNITS } from '../services/nutritionService';
import { analytics } from '../services/analyticsService';
import { useFeatureGate } from '../hooks/useFeatureGate';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'FoodAnalyzer'>;

type FoodAnalyzerRouteProp = RouteProp<RootStackParamList, 'FoodAnalyzer'>;

const FoodAnalyzerScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<FoodAnalyzerRouteProp>();
    const { width, height } = useWindowDimensions();
    const scanFrameSize = Math.round(Math.min(width, height) * 0.7);

    // Lifecycle
    const isFocused = useIsFocused();
    const appState = useRef(AppState.currentState);
    const [appStateVisible, setAppStateVisible] = useState(appState.current);

    // Replacement context from meal detail modal
    const replacePlanItemId = route.params?.replacePlanItemId;
    const replacePlanDateKey = route.params?.replacePlanDateKey;
    const sourceMealTitle = route.params?.sourceMealTitle;
    const isReplacementMode = !!(replacePlanItemId && replacePlanDateKey);

    const { language, t } = useLanguage();
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<CameraType>('back');
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);
    const [isRefining, setIsRefining] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<FoodAnalysisResult | null>(null);
    const [user, setUser] = useState<UserProfile | null>(null);
    const cameraRef = useRef<CameraView>(null);
    const [showOnlyDetectedMicros, setShowOnlyDetectedMicros] = useState(false);

    // Capture mode: photo or video
    const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('photo');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [capturedVideo, setCapturedVideo] = useState<string | null>(null);
    const [, setIsFromVideo] = useState(false); // Track if current media is from video
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const MAX_VIDEO_BYTES = 1000 * 1024 * 1024; // 1000MB safety cap for base64 conversion
    const [cameraKey, setCameraKey] = useState(0);

    /**
     * Get Gemini-compatible video MIME type
     * Gemini accepts: video/mp4, video/mpeg, video/mov, video/avi, video/x-flv, video/mpg, video/webm, video/wmv, video/3gpp
     * NOTE: video/quicktime is NOT supported - use video/mov for .mov files
     */
    const getVideoMimeType = (uri: string) => {
        const lower = uri.toLowerCase();
        // IMPORTANT: Gemini accepts 'video/mov' NOT 'video/quicktime' for .mov files
        if (lower.endsWith('.mov') || lower.endsWith('.qt')) return 'video/mov';
        if (lower.endsWith('.webm')) return 'video/webm';
        if (lower.endsWith('.mkv')) return 'video/mp4'; // Gemini doesn't support mkv, try mp4
        if (lower.endsWith('.avi')) return 'video/avi';
        if (lower.endsWith('.wmv')) return 'video/wmv';
        if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) return 'video/3gpp';
        if (lower.endsWith('.flv')) return 'video/x-flv';
        if (lower.endsWith('.mpg') || lower.endsWith('.mpeg')) return 'video/mpeg';
        return 'video/mp4';
    };

    // Refinement state
    const [showRefinement, setShowRefinement] = useState(false);
    const [correctionText, setCorrectionText] = useState('');
    const [isListening, setIsListening] = useState(false);

    // Permission state
    const [showPermissionModal, setShowPermissionModal] = useState(false);

    // Energy context
    const { energy, canAfford, showAdRecharge, queueEnergyRetry } = useEnergy();
    const foodGate = useFeatureGate('food_scan');

    // Error state for retry
    const [lastError, setLastError] = useState<LLMError | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    // Determine if camera should be active (Strict Resource Management)
    const canShowCamera =
        isFocused && appStateVisible === 'active' && !capturedImage && !capturedVideo && permission?.granted;

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            appState.current = nextAppState;
            setAppStateVisible(nextAppState);
            if (nextAppState === 'active' && isFocused) {
                setCameraKey(prev => prev + 1);
            }
            if (nextAppState !== 'active' && isRecording && cameraRef.current) {
                cameraRef.current.stopRecording();
                if (recordingTimerRef.current) {
                    clearInterval(recordingTimerRef.current);
                    recordingTimerRef.current = null;
                }
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isFocused]);

    useFocusEffect(
        useCallback(() => {
            setCameraKey(prev => prev + 1);
            return () => {
                if (cameraRef.current) {
                    // Best effort cleanup when leaving the screen.
                    // @ts-ignore - pausePreview exists on some camera implementations
                    cameraRef.current.pausePreview?.();
                    cameraRef.current.stopRecording?.();
                }
                if (recordingTimerRef.current) {
                    clearInterval(recordingTimerRef.current);
                    recordingTimerRef.current = null;
                }
                setIsRecording(false);
            };
        }, [])
    );


    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        const savedUser = await storage.get<UserProfile>(storage.keys.USER);
        if (savedUser) setUser(savedUser);
    };

    const takePicture = async () => {
        if (!foodGate.checkOnly()) {
            foodGate.showPaywall();
            return;
        }
        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync({
                    base64: false,
                    quality: 0.85,
                });
                if (photo?.uri) {
                    if (!foodGate.consume()) {
                        foodGate.showPaywall();
                        return;
                    }
                    setCapturedImage(photo.uri);
                    setCapturedBase64(null);
                    setCapturedVideo(null);
                    setIsFromVideo(false);
                    analyzeFood(photo.uri, 'image/jpeg', false, 'camera');
                }
            } catch (error) {
                console.error('Failed to take picture:', error);
                Alert.alert(t('alert.error'), t('food_analyzer.alert.capture_failed'));
            }
        }
    };

    // Video recording functions
    const startRecording = async () => {
        if (!foodGate.checkOnly()) {
            foodGate.showPaywall();
            return;
        }
        if (cameraRef.current && !isRecording) {
            try {
                setIsRecording(true);
                setRecordingDuration(0);

                // Start duration timer
                recordingTimerRef.current = setInterval(() => {
                    setRecordingDuration(prev => prev + 1);
                }, 1000);

                const video = await cameraRef.current.recordAsync({
                    maxDuration: 30, // Max 30 seconds for food scanning
                    // Force H.264 codec on iOS for better Gemini compatibility
                    // (HEVC/H.265 may not be supported by Gemini)
                    codec: 'avc1', // H.264/AVC codec
                });

                if (video?.uri) {
                    if (!foodGate.consume()) {
                        foodGate.showPaywall();
                        return;
                    }
                    const info = await FileSystem.getInfoAsync(video.uri);
                    if (info.exists && typeof info.size === 'number' && info.size > MAX_VIDEO_BYTES) {
                        Alert.alert(
                            t('food_analyzer.alert.video_too_large.title'),
                            t('food_analyzer.alert.video_too_large.body')
                        );
                        setCapturedVideo(null);
                        setCapturedImage(null);
                        setCapturedBase64(null);
                        setIsFromVideo(false);
                        return;
                    }

                    setCapturedImage(null);
                    setCapturedBase64(null);
                    setCapturedVideo(video.uri);
                    setIsFromVideo(true);
                    const videoMimeType = getVideoMimeType(video.uri);
                    analyzeFood(video.uri, videoMimeType, true, 'camera');
                } else {
                    console.error('[FoodAnalyzer] Video recording returned no URI');
                    Alert.alert(t('alert.error'), t('food_analyzer.alert.record_failed'));
                }
            } catch (error) {
                console.error('[FoodAnalyzer] Failed to record video:', error);
                Alert.alert(t('alert.error'), t('food_analyzer.alert.capture_video_failed'));
            } finally {
                setIsRecording(false);
                if (recordingTimerRef.current) {
                    clearInterval(recordingTimerRef.current);
                    recordingTimerRef.current = null;
                }
            }
        }
    };

    const stopRecording = () => {
        if (cameraRef.current && isRecording) {
            cameraRef.current.stopRecording();
            setIsRecording(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    };

    const pickImage = async () => {
        if (!foodGate.checkOnly()) {
            foodGate.showPaywall();
            return;
        }
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 1,
                base64: false,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                if (!foodGate.consume()) {
                    foodGate.showPaywall();
                    return;
                }
                setCapturedImage(asset.uri);
                setCapturedBase64(null);
                setCapturedVideo(null);
                setIsFromVideo(false);
                analyzeFood(asset.uri, 'image/jpeg', false, 'gallery');
            }
        } catch (error) {
            console.error('Failed to pick image:', error);
            Alert.alert(t('alert.error'), t('food_analyzer.alert.pick_failed'));
        }
    };

    const openTextEntry = () => {
        navigation.navigate('Action', { initialMode: 'log_food_text' });
    };


    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const analyzeFood = async (
        mediaUri: string,
        mimeType: string = 'image/jpeg',
        fromVideo: boolean = false,
        source: 'camera' | 'gallery' = 'camera'
    ) => {
        const jobType = fromVideo ? 'ANALYZE_FOOD_VIDEO' : 'ANALYZE_FOOD_MEDIA';
        const mediaType = fromVideo ? 'video' : 'photo';
        const jobCost = JOB_ENERGY_COSTS[jobType] || 0;
        if (jobCost > 0 && !canAfford(jobCost)) {
            analytics.logEvent('food_analysis_blocked', { source, media: mediaType, reason: 'energy_low' });
            Alert.alert(
                t('alert.low_energy'),
                t('food_analyzer.alert.low_energy_scan', { cost: jobCost, energy })
            );
            queueEnergyRetry(() => analyzeFood(mediaUri, mimeType, fromVideo, source));
            showAdRecharge();
            return;
        }

        setIsAnalyzing(true);
        const requestId = Date.now().toString();
        setLastError(null);
        setRetryCount(0);
        setIsFromVideo(fromVideo);

        analytics.logEvent('food_analysis_started', { source, media: mediaType });

        try {
            const result = fromVideo
                ? await llmQueueService.analyzeFoodMediaNow({
                    jobId: requestId,
                    imageUri: mediaUri,
                    mimeType,
                    language
                })
                : await llmQueueService.addJobAndWait<FoodAnalysisResult>(
                    jobType,
                    {
                        jobId: requestId,
                        imageUri: mediaUri,
                        mimeType,
                        language
                    },
                    'high'
                );

            setAnalysisResult(result);
            analytics.logEvent('food_analysis_completed', { source, media: mediaType });

        } catch (error) {
            console.error('Queue Analysis failed:', error);
            analytics.logEvent('food_analysis_failed', {
                source,
                media: mediaType,
                reason: error instanceof Error ? error.name : 'unknown_error',
            });
            if (error instanceof Error && error.name === 'InsufficientEnergyError') {
                Alert.alert(t('alert.low_energy'), t('food_analyzer.alert.low_energy_photo'));
                queueEnergyRetry(() => analyzeFood(mediaUri, mimeType, fromVideo, source));
                showAdRecharge();
                return;
            }
            const parsedError = parseLLMError(error);
            setLastError(parsedError);
            const errorMessage = parsedError.message;
            Alert.alert(t('alert.error'), errorMessage);
            retake();
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleRetry = async (mediaUri: string, mimeType: string, fromVideo: boolean = false) => {
        const newRetryCount = retryCount + 1;
        setRetryCount(newRetryCount);

        // Wait with exponential backoff
        const delay = getRetryDelay(newRetryCount);
        console.log(`[FoodAnalyzer] Retrying in ${delay}ms (attempt ${newRetryCount})`);

        await new Promise(resolve => setTimeout(resolve, delay));

        if (newRetryCount > 3) {
            Alert.alert(t('food_analyzer.alert.max_retries.title'), t('food_analyzer.alert.max_retries.body'));
            retake();
            return;
        }

        await analyzeFood(mediaUri, mimeType, fromVideo);
    };

    const handleRefine = async () => {
        if (!correctionText.trim() || !analysisResult) return;

        setIsRefining(true);
        analytics.logEvent('food_refine_started', {});
        try {
            let originalImage = capturedBase64;
            if (!originalImage && capturedImage) {
                try {
                    originalImage = await readAsStringAsync(capturedImage, { encoding: EncodingType.Base64 });
                    setCapturedBase64(originalImage);
                } catch (e) {
                    console.warn('[FoodAnalyzer] Failed to read original image for refinement:', e);
                }
            }

            // Use queue for rate limit protection
            const refined = await llmQueueService.addJobAndWait<FoodAnalysisResult>('REFINE_FOOD_ANALYSIS', {
                originalAnalysis: analysisResult,
                correction: correctionText,
                originalImage: originalImage || undefined,
                language,
            }, 'high');
            setAnalysisResult(refined);
            analytics.logEvent('food_refine_completed', {});
            setCorrectionText('');
            setShowRefinement(false);
            Alert.alert(t('alert.success'), t('alert.try_again'));
        } catch (error) {
            console.error('Refinement failed:', error);
            analytics.logEvent('food_refine_failed', {
                reason: error instanceof Error ? error.name : 'unknown_error',
            });
            if (error instanceof Error && error.name === 'InsufficientEnergyError') {
                Alert.alert(t('alert.low_energy'), t('food_analyzer.alert.low_energy_refine'));
                queueEnergyRetry(() => handleRefine());
                showAdRecharge();
                return;
            }
            Alert.alert(t('alert.failed'), t('alert.try_again'));
        } finally {
            setIsRefining(false);
        }
    };

    const handleVoiceInput = async () => {
        if (isListening) {
            // Stop recording
            if (stopRecordingRef.current) {
                setIsListening(false);
                await stopRecordingRef.current();
                stopRecordingRef.current = null;
            }
            return;
        }

        setIsListening(true);
        try {
            const stopFn = await startSpeechRecognition(
                (result) => {
                    setCorrectionText(result.transcript);
                    setIsListening(false);
                },
                (error) => {
                    console.error('Speech recognition error:', error);
                    setIsListening(false);
                    Alert.alert(t('alert.error'), t('alert.try_again'));
                }
            );
            stopRecordingRef.current = stopFn;
        } catch (e) {
            console.error('Failed to start recording', e);
            setIsListening(false);
        }
    };

    const logFood = async (useInstead: boolean = false) => {
        if (!analysisResult) return;

        try {
            if (useInstead && isReplacementMode) {
                // Replace plan item AND log
                await replaceAndLogMeal(
                    analysisResult,
                    replacePlanItemId!,
                    replacePlanDateKey!,
                    'camera'
                );
                Alert.alert(
                    t('food_analyzer.alert.replaced_title'),
                    t('food_analyzer.alert.replaced_body', {
                        food: analysisResult.foodName,
                        source: sourceMealTitle || ''
                    })
                );
            } else {
                // Just log to food history
                await logMealOnly(analysisResult, 'camera');
                Alert.alert(t('alert.logged'), `${analysisResult.foodName} ${t('alert.meal_added')}`);
            }
            analytics.logEvent('food_logged', {
                mode: useInstead && isReplacementMode ? 'replace' : 'log',
                source: useInstead && isReplacementMode ? 'plan_replace' : 'history',
            });
            navigation.goBack();
        } catch (error) {
            console.error('Failed to log food:', error);
            analytics.logEvent('food_log_failed', {
                reason: error instanceof Error ? error.name : 'unknown_error',
            });
            Alert.alert(t('alert.error'), t('alert.try_again'));
        }
    };

    const saveToFavorites = async () => {
        if (!analysisResult) return;

        const newMeal: SavedMeal = {
            id: Date.now().toString(),
            name: analysisResult.foodName,
            macros: analysisResult.macros,
            healthGrade: analysisResult.healthGrade,
        };

        const existingMeals = await storage.get<SavedMeal[]>(storage.keys.SAVED_MEALS) || [];

        // Check if already saved
        if (existingMeals.some(m => m.name.toLowerCase() === newMeal.name.toLowerCase())) {
            Alert.alert(t('alert.already_saved'), t('alert.try_again'));
            return;
        }

        await storage.set(storage.keys.SAVED_MEALS, [...existingMeals, newMeal]);
        analytics.logEvent('food_favorite_saved', { source: 'food_analyzer' });
        Alert.alert(t('alert.saved'), `${analysisResult.foodName} ${t('alert.added_to_favorites')}`);
    };

    const retake = () => {
        setCapturedImage(null);
        setCapturedBase64(null);
        setCapturedVideo(null);
        setAnalysisResult(null);
        setShowRefinement(false);
        setCorrectionText('');
        setIsFromVideo(false); // Reset video flag for next capture
        setShowOnlyDetectedMicros(false);
    };

    // Permission handling
    if (!permission) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#06b6d4" />
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.permissionContainer}>
                    <Text style={styles.emoji}>📷</Text>
                    <Text style={styles.title}>{t('food_analyzer.permission.title')}</Text>
                    <Text style={styles.subtitle}>
                        {t('food_analyzer.permission.subtitle')}
                    </Text>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => setShowPermissionModal(true)}
                    >
                        <Text style={styles.buttonText}>{t('food_analyzer.permission.grant')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155' }]}
                        onPress={pickImage}
                    >
                        <Text style={[styles.buttonText, { color: '#ffffff' }]}>{t('food_analyzer.permission.pick_gallery')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.backText}>{t('food_analyzer.permission.back')}</Text>
                    </TouchableOpacity>
                </View>

                <PermissionModal
                    visible={showPermissionModal}
                    permissionType="camera"
                    canAskAgain={permission?.canAskAgain ?? true}
                    onGranted={() => {
                        requestPermission(); // Refresh hook state
                        setShowPermissionModal(false);
                    }}
                    onDenied={() => setShowPermissionModal(false)}
                    onClose={() => setShowPermissionModal(false)}
                />
            </SafeAreaView>
        );
    }

    const hasCapturedMedia = !!(capturedImage || capturedVideo);

    // Show analysis result
    if (analysisResult && hasCapturedMedia) {
        const micronutrientEntries = analysisResult.micronutrients
            ? (Object.keys(NUTRIENT_DISPLAY_NAMES) as Array<keyof typeof NUTRIENT_DISPLAY_NAMES>)
                .map((key) => {
                    const value = analysisResult.micronutrients?.[key] ?? 0;
                    const labelKey = `food_analyzer.micros.nutrient.${key}`;
                    const localizedLabel = t(labelKey);
                    return {
                        key,
                        label: localizedLabel === labelKey ? (NUTRIENT_DISPLAY_NAMES[key] || String(key)) : localizedLabel,
                        value: typeof value === 'number' && Number.isFinite(value) ? value : 0,
                        unit: NUTRIENT_UNITS[key] || '',
                    };
                })
                .filter(entry => !showOnlyDetectedMicros || entry.value > 0)
            : [];
        const microsSourceKey = analysisResult.nutritionSource || 'unknown';
        const microsSourceLabelKey = `food_analyzer.micros.source.${microsSourceKey}`;
        const microsSourceLabel = t(microsSourceLabelKey);
        const microsSource = microsSourceLabel === microsSourceLabelKey
            ? t('food_analyzer.micros.unknown')
            : microsSourceLabel;
        const microsConfidenceKey = (analysisResult.micronutrientsConfidence || 'medium').toLowerCase();
        const microsConfidenceLabelKey = `food_analyzer.micros.confidence.${microsConfidenceKey}`;
        const microsConfidenceLabel = t(microsConfidenceLabelKey);
        const safeMicrosConfidenceLabel =
            microsConfidenceLabel === microsConfidenceLabelKey
                ? analysisResult.micronutrientsConfidence || 'medium'
                : microsConfidenceLabel;
        const confidenceKey = (analysisResult.confidence || 'medium').toLowerCase();
        const confidenceLabelKey = `food_analyzer.confidence_level.${confidenceKey}`;
        const confidenceLabel = t(confidenceLabelKey);
        const safeConfidenceLabel =
            confidenceLabel === confidenceLabelKey
                ? analysisResult.confidence
                : confidenceLabel;
        const estimatedWeightGrams = typeof analysisResult.estimatedWeightGrams === 'number'
            ? analysisResult.estimatedWeightGrams
            : 0;

        return (
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.resultContainer}>
                        {/* Header */}
                        <View style={styles.resultHeader}>
                            <TouchableOpacity onPress={retake}>
                                <Text style={styles.headerButton}>← {t('food_analyzer.action.retake')}</Text>
                            </TouchableOpacity>
                            <Text style={styles.headerTitle}>{t('food_analyzer.header.analysis')}</Text>
                            <TouchableOpacity onPress={() => logFood()}>
                                <Text style={styles.headerButtonPrimary}>✓ {t('food_analyzer.action.log')}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Food Image */}
                        {capturedImage ? (
                            <Image source={{ uri: capturedImage }} style={styles.resultImage} />
                        ) : (
                            <View style={styles.videoResultPreview}>
                                <Ionicons name="videocam" size={48} color="#e2e8f0" />
                                <Text style={styles.videoPreviewText}>{t('food_analyzer.video.captured')}</Text>
                            </View>
                        )}

                        {/* Food Info */}
                        <View style={styles.foodInfo}>
                            <View style={styles.gradeContainer}>
                                <Text style={[styles.grade, { color: getGradeColor(analysisResult.healthGrade) }]}>
                                    {analysisResult.healthGrade}
                                </Text>
                            </View>
                            <View style={styles.foodDetails}>
                                <Text style={styles.foodName}>{analysisResult.foodName}</Text>
                                <Text style={styles.foodDescription}>{analysisResult.description}</Text>
                            <Text style={styles.confidence}>
                                {t('food_analyzer.confidence', { level: safeConfidenceLabel })}
                            </Text>
                            <Text style={styles.analysisDisclaimer}>
                                {t('legal.nutrition_disclaimer_short')}
                            </Text>
                        </View>
                    </View>

                        {/* Refinement Section */}
                        {!showRefinement ? (
                            <TouchableOpacity
                                style={styles.refineButton}
                                onPress={() => setShowRefinement(true)}
                            >
                                <Text style={styles.refineButtonText}>✏️ {t('food_analyzer.refine.cta')}</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.refinementCard}>
                                <Text style={styles.refinementTitle}>{t('food_analyzer.refine.title')}</Text>
                                <View style={styles.inputContainer}>
                                    <TextInput
                                        style={styles.refinementInput}
                                        value={correctionText}
                                        onChangeText={setCorrectionText}
                                        placeholder={t('food_analyzer.refine.placeholder')}
                                        placeholderTextColor="rgba(255,255,255,0.3)"
                                        multiline
                                    />
                                    <TouchableOpacity
                                        style={[styles.micButton, isListening && styles.micButtonActive]}
                                        onPress={handleVoiceInput}
                                    >
                                        {isListening ? (
                                            <ActivityIndicator size="small" color="#ffffff" />
                                        ) : (
                                            <Ionicons name={isListening ? "stop" : "mic"} size={20} color="#ffffff" />
                                        )}
                                    </TouchableOpacity>
                                </View>
                                {isListening && (
                                    <Text style={styles.listeningText}>🎤 {t('food_analyzer.refine.listening')}</Text>
                                )}
                                <View style={styles.refinementButtons}>
                                    <TouchableOpacity
                                        style={styles.refineCancelBtn}
                                        onPress={() => {
                                            setShowRefinement(false);
                                            setCorrectionText('');
                                        }}
                                    >
                                        <Text style={styles.refineCancelText}>{t('cancel')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.refineSubmitBtn, !correctionText.trim() && styles.disabledBtn]}
                                        onPress={handleRefine}
                                        disabled={!correctionText.trim() || isRefining}
                                    >
                                        {isRefining ? (
                                            <ActivityIndicator color="#ffffff" size="small" />
                                        ) : (
                                            <Text style={styles.refineSubmitText}>{t('food_analyzer.refine.update')}</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Macros */}
                        {analysisResult.macros && (
                            <View style={styles.macrosCard}>
                                <Text style={styles.cardTitle}>{t('food_analyzer.nutrition_facts')}</Text>
                                <View style={styles.macrosGrid}>
                                    <MacroItem label={t('calories')} value={analysisResult.macros.calories || 0} unit={t('units.kcal')} color="#f97316" />
                                    <MacroItem label={t('protein')} value={analysisResult.macros.protein || 0} unit={t('units.g')} color="#06b6d4" />
                                    <MacroItem label={t('carbs')} value={analysisResult.macros.carbs || 0} unit={t('units.g')} color="#8b5cf6" />
                                    <MacroItem label={t('fat')} value={analysisResult.macros.fat || 0} unit={t('units.g')} color="#eab308" />
                                </View>
                                {estimatedWeightGrams > 0 && (
                                    <Text style={styles.weight}>
                                        {t('food_analyzer.estimated_portion', { grams: estimatedWeightGrams })}
                                    </Text>
                                )}
                            </View>
                        )}

                        {/* Micronutrients */}
                        {micronutrientEntries.length > 0 && (
                            <View style={styles.microsCard}>
                                <Text style={styles.cardTitle}>{t('food_analyzer.micros.title')}</Text>
                                <Text style={styles.microsMeta}>
                                    {t('food_analyzer.micros.meta', { source: microsSource, confidence: safeMicrosConfidenceLabel })}
                                </Text>
                                <TouchableOpacity
                                    style={styles.microsToggle}
                                    onPress={() => setShowOnlyDetectedMicros(prev => !prev)}
                                >
                                    <Text style={styles.microsToggleText}>
                                        {showOnlyDetectedMicros
                                            ? t('food_analyzer.micros.show_all')
                                            : t('food_analyzer.micros.show_detected')}
                                    </Text>
                                </TouchableOpacity>
                                <View style={styles.microsGrid}>
                                    {micronutrientEntries.map((entry) => (
                                        <View key={entry.key} style={styles.microsItem}>
                                            <Text style={styles.microsValue}>
                                                {formatMicronutrientValue(entry.value, entry.unit)}
                                            </Text>
                                            <Text style={styles.microsUnit}>{entry.unit}</Text>
                                            <Text style={styles.microsLabel}>{entry.label}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Ingredients */}
                        {analysisResult.ingredients && analysisResult.ingredients.length > 0 && (
                            <View style={styles.ingredientsCard}>
                                <Text style={styles.cardTitle}>{t('food_analyzer.ingredients.title')}</Text>
                                <View style={styles.ingredientsList}>
                                    {analysisResult.ingredients.map((ing, idx) => (
                                        <View key={idx} style={styles.ingredientTag}>
                                            <Text style={styles.ingredientText}>{ing}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Advice */}
                        <View style={styles.adviceCard}>
                            <Text style={styles.cardTitle}>💡 {t('food_analyzer.advice.title')}</Text>
                            <Text style={styles.adviceText}>{analysisResult.advice}</Text>
                        </View>

                        {/* Action Buttons */}
                        <View style={styles.actionButtons}>
                            <TouchableOpacity style={styles.favoriteButton} onPress={saveToFavorites}>
                                <Text style={styles.favoriteButtonText}>⭐ {t('food_analyzer.action.save_favorite')}</Text>
                            </TouchableOpacity>

                            {/* Replace mode: default to updating the planned meal */}
                            {isReplacementMode ? (
                                <TouchableOpacity
                                    style={styles.logButton}
                                    onPress={() => logFood(true)}
                                >
                                    <Text style={styles.logButtonText}>{t('food_analyzer.action.replace_meal')}</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.logButton} onPress={() => logFood(false)}>
                                    <Text style={styles.logButtonText}>{t('food_analyzer.action.add_log')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    // Show camera or captured image
    return (
        <View style={styles.container}>
            {/* Energy indicator */}
            <View style={styles.energyBadge}>
                <Text style={styles.energyText}>⚡ {energy}</Text>
            </View>

            {hasCapturedMedia ? (
                // Analyzing state
                <View style={styles.analyzingContainer}>
                    {capturedImage ? (
                        <Image source={{ uri: capturedImage }} style={styles.capturedImage} />
                    ) : (
                        <View style={styles.videoPreview}>
                            <Ionicons name="videocam" size={48} color="#e2e8f0" />
                            <Text style={styles.videoPreviewText}>{t('food_analyzer.video.captured')}</Text>
                        </View>
                    )}
                    <View style={styles.analyzingOverlay}>
                        <ActivityIndicator size="large" color="#06b6d4" />
                        <Text style={styles.analyzingText}>{t('food_analyzer.analyzing.title')}</Text>
                        <Text style={styles.analyzingSubtext}>{t('food_analyzer.analyzing.subtitle')}</Text>
                    </View>
                </View>
            ) : (
                // Camera view
                <>
                    <View style={styles.cameraWrapper}>
                        {canShowCamera && (
                            <CameraView
                                key={cameraKey}
                                ref={cameraRef}
                                style={styles.camera}
                                facing={facing}
                                mode={captureMode === 'video' ? 'video' : 'picture'}
                                mute={captureMode === 'video'}
                            />
                        )}

                        <View style={styles.cameraOverlay} pointerEvents="box-none">
                            <SafeAreaView style={styles.overlayTopRow} pointerEvents="box-none">
                                <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                                    <Text style={styles.closeText}>✕</Text>
                                </TouchableOpacity>
                            </SafeAreaView>

                            <View style={[styles.scanFrame, { height: scanFrameSize }]} pointerEvents="none">
                                <View style={[styles.corner, styles.topLeft]} />
                                <View style={[styles.corner, styles.topRight]} />
                                <View style={[styles.corner, styles.bottomLeft]} />
                                <View style={[styles.corner, styles.bottomRight]} />
                            </View>

                            {isRecording && (
                                <View style={styles.recordingIndicator}>
                                    <View style={styles.recordingDot} />
                                    <Text style={styles.recordingTime}>{formatDuration(recordingDuration)}</Text>
                                </View>
                            )}

                            <View style={styles.instructionContainer}>
                                <Text style={styles.instructionText}>
                                    {captureMode === 'photo'
                                        ? t('food_analyzer.instruction.photo')
                                        : t('food_analyzer.instruction.video')}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Mode Toggle */}
                    <View style={styles.modeToggleContainer}>
                        <TouchableOpacity
                            style={[styles.modeButton, captureMode === 'photo' && styles.modeButtonActive]}
                            onPress={() => setCaptureMode('photo')}
                            disabled={isRecording}
                            accessibilityRole="button"
                            accessibilityLabel={t('food_analyzer.accessibility.switch_photo')}
                            accessibilityState={{ selected: captureMode === 'photo', disabled: isRecording }}
                        >
                            <Text style={styles.modeEmoji}>📷</Text>
                            <Text style={[styles.modeText, captureMode === 'photo' && styles.modeTextActive]}>{t('food_analyzer.mode.photo')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modeButton, captureMode === 'video' && styles.modeButtonActive]}
                            onPress={() => setCaptureMode('video')}
                            disabled={isRecording}
                            accessibilityRole="button"
                            accessibilityLabel={t('food_analyzer.accessibility.switch_video')}
                            accessibilityState={{ selected: captureMode === 'video', disabled: isRecording }}
                        >
                            <Text style={styles.modeEmoji}>🎬</Text>
                            <Text style={[styles.modeText, captureMode === 'video' && styles.modeTextActive]}>{t('food_analyzer.mode.video')}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.controlsContainer}>
                        <TouchableOpacity
                            style={styles.flipButton}
                            onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
                            disabled={isRecording}
                            accessibilityRole="button"
                            accessibilityLabel={t('food_analyzer.accessibility.flip_camera')}
                            accessibilityHint={t('food_analyzer.accessibility.flip_hint')}
                        >
                            <Text style={[styles.flipText, isRecording && { opacity: 0.3 }]}>🔄</Text>
                        </TouchableOpacity>

                        {captureMode === 'photo' ? (
                            <TouchableOpacity
                                style={styles.captureButton}
                                onPress={takePicture}
                                accessibilityRole="button"
                                accessibilityLabel={t('food_analyzer.accessibility.take_picture')}
                            >
                                <View style={styles.captureInner} />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[styles.captureButton, isRecording && styles.recordingButton]}
                                onPress={isRecording ? stopRecording : startRecording}
                            >
                                <View style={[styles.captureInner, isRecording && styles.recordingInner]} />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.galleryButton}
                            onPress={pickImage}
                            disabled={isRecording}
                        >
                            <Text style={styles.galleryIcon}>🖼️</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.manualEntryRow}>
                        <TouchableOpacity
                            style={[styles.manualEntryButton, isRecording && styles.manualEntryDisabled]}
                            onPress={openTextEntry}
                            disabled={isRecording}
                        >
                            <Text style={styles.manualEntryIcon}>✍️</Text>
                            <Text style={styles.manualEntryText}>{t('action.log_food.describe')}</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
};

// Helper components
const MacroItem: React.FC<{ label: string; value: number; unit: string; color: string }> =
    ({ label, value, unit, color }) => (
        <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color }]}>{Math.round(value)}</Text>
            <Text style={styles.macroUnit}>{unit}</Text>
            <Text style={styles.macroLabel}>{label}</Text>
        </View>
    );

const getGradeColor = (grade: string): string => {
    switch (grade) {
        case 'A': return '#22c55e';
        case 'B': return '#84cc16';
        case 'C': return '#eab308';
        case 'D': return '#f97316';
        case 'F': return '#ef4444';
        default: return '#ffffff';
    }
};

const formatMicronutrientValue = (value: number, unit: string): string => {
    if (!Number.isFinite(value)) return '0';
    if (unit === 'mcg') {
        return value >= 100 ? Math.round(value).toString() : value.toFixed(1);
    }
    if (unit === 'mg' || unit === 'g') {
        return value >= 10 ? value.toFixed(0) : value.toFixed(1);
    }
    return value.toFixed(1);
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    energyBadge: {
        position: 'absolute',
        top: 50,
        right: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        zIndex: 100,
    },
    energyText: { color: '#eab308', fontWeight: '600', fontSize: 14 },
    permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    emoji: { fontSize: 64, marginBottom: 24 },
    title: { fontSize: 24, fontWeight: '700', color: '#ffffff', marginBottom: 12 },
    subtitle: { fontSize: 16, color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center', marginBottom: 32 },
    button: { backgroundColor: '#06b6d4', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12, marginBottom: 16 },
    buttonText: { fontSize: 16, fontWeight: '600', color: '#020617' },
    backButton: { padding: 12 },
    backText: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 16 },
    cameraWrapper: { flex: 1, width: '100%', position: 'relative' },
    camera: { flex: 1 },
    cameraOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 16, justifyContent: 'space-between', alignItems: 'center' },
    overlayTopRow: { width: '100%', flexDirection: 'row', justifyContent: 'flex-start' },
    closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
    galleryButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    galleryIcon: { fontSize: 20 },
    closeText: { color: '#ffffff', fontSize: 24 },
    scanFrame: { position: 'absolute', top: '20%', left: '10%', right: '10%' },
    corner: { position: 'absolute', width: 30, height: 30, borderColor: '#06b6d4' },
    topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
    topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
    bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
    bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
    instructionContainer: { position: 'absolute', bottom: 140, left: 0, right: 0, alignItems: 'center' },
    instructionText: { color: '#ffffff', fontSize: 16, backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    controlsContainer: { position: 'absolute', bottom: 80, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 32, paddingBottom: 12 },
    manualEntryRow: { position: 'absolute', bottom: 28, left: 0, right: 0, alignItems: 'center' },
    manualEntryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(6, 182, 212, 0.18)',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.6)',
    },
    manualEntryIcon: { fontSize: 18 },
    manualEntryText: { color: '#e2e8f0', fontWeight: '600', fontSize: 14 },
    manualEntryDisabled: { opacity: 0.5 },
    flipButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255, 255, 255, 0.2)', justifyContent: 'center', alignItems: 'center' },
    flipText: { fontSize: 24 },
    captureButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255, 255, 255, 0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#ffffff' },
    captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff' },
    placeholder: { width: 50, height: 50 },
    analyzingContainer: { flex: 1 },
    capturedImage: { flex: 1, resizeMode: 'cover' },
    analyzingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2, 6, 23, 0.8)', justifyContent: 'center', alignItems: 'center' },
    analyzingText: { color: '#ffffff', fontSize: 20, fontWeight: '600', marginTop: 20 },
    analyzingSubtext: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, marginTop: 8 },
    resultContainer: { padding: 16, paddingBottom: 40 },
    resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    headerButton: { color: '#06b6d4', fontSize: 16 },
    headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
    headerButtonPrimary: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
    resultImage: { width: '100%', height: 200, borderRadius: 16, marginBottom: 16 },
    videoPreview: {
        flex: 1,
        width: '100%',
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoResultPreview: {
        width: '100%',
        height: 200,
        borderRadius: 16,
        marginBottom: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoPreviewText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 8 },
    foodInfo: { flexDirection: 'row', backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    gradeContainer: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255, 255, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    grade: { fontSize: 32, fontWeight: '800' },
    foodDetails: { flex: 1 },
    foodName: { fontSize: 20, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
    foodDescription: { fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 4 },
    confidence: { fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' },
    analysisDisclaimer: { fontSize: 12, color: 'rgba(255, 255, 255, 0.6)', marginTop: 6 },
    refineButton: { backgroundColor: 'rgba(249, 115, 22, 0.2)', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#f97316' },
    refineButtonText: { color: '#f97316', fontWeight: '600' },
    refinementCard: { backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f97316' },
    refinementTitle: { color: '#f97316', fontWeight: '600', marginBottom: 12 },
    inputContainer: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
    refinementInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, color: '#ffffff', fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
    micButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#8b5cf6', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
    micButtonActive: { backgroundColor: '#ef4444' },
    listeningText: { color: '#8b5cf6', fontSize: 12, marginBottom: 8, fontStyle: 'italic' },
    refinementButtons: { flexDirection: 'row', gap: 12 },
    refineCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    refineCancelText: { color: 'rgba(255,255,255,0.6)' },
    refineSubmitBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#f97316' },
    refineSubmitText: { color: '#ffffff', fontWeight: '600' },
    disabledBtn: { opacity: 0.5 },
    macrosCard: { backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    cardTitle: { fontSize: 16, fontWeight: '600', color: '#ffffff', marginBottom: 16 },
    macrosGrid: { flexDirection: 'row', justifyContent: 'space-between' },
    macroItem: { alignItems: 'center' },
    macroValue: { fontSize: 24, fontWeight: '700' },
    macroUnit: { fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' },
    macroLabel: { fontSize: 12, color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 },
    weight: { fontSize: 14, color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', marginTop: 12 },
    microsCard: { backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    microsMeta: { fontSize: 12, color: 'rgba(255, 255, 255, 0.6)', marginBottom: 12 },
    microsToggle: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.08)', marginBottom: 12 },
    microsToggleText: { fontSize: 12, color: 'rgba(255, 255, 255, 0.75)' },
    microsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    microsItem: { width: '48%', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 12, padding: 10, marginBottom: 12 },
    microsValue: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
    microsUnit: { fontSize: 11, color: 'rgba(255, 255, 255, 0.5)' },
    microsLabel: { fontSize: 12, color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 },
    ingredientsCard: { backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    ingredientsList: { flexDirection: 'row', flexWrap: 'wrap' },
    ingredientTag: { backgroundColor: 'rgba(6, 182, 212, 0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8 },
    ingredientText: { color: '#06b6d4', fontSize: 14 },
    adviceCard: { backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    adviceText: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 14, lineHeight: 22 },
    actionButtons: { gap: 12, marginBottom: 20 },
    favoriteButton: { backgroundColor: 'rgba(234, 179, 8, 0.2)', paddingVertical: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#eab308' },
    favoriteButtonText: { fontSize: 16, fontWeight: '600', color: '#eab308' },
    logButton: { backgroundColor: '#06b6d4', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    logButtonText: { fontSize: 18, fontWeight: '700', color: '#020617' },
    // Video recording styles
    modeToggleContainer: {
        position: 'absolute',
        top: 12,
        alignSelf: 'center',
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 12,
        zIndex: 5,
    },
    modeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.35)',
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    modeButtonActive: {
        backgroundColor: 'rgba(6, 182, 212, 0.3)',
        borderWidth: 1,
        borderColor: '#06b6d4',
    },
    modeEmoji: {
        fontSize: 18,
    },
    modeText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontWeight: '500',
    },
    modeTextActive: {
        color: '#06b6d4',
    },
    recordingIndicator: {
        position: 'absolute',
        top: 100,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 8,
    },
    recordingDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#ffffff',
    },
    recordingTime: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
    recordingButton: {
        borderColor: '#ef4444',
        borderWidth: 3,
    },
    recordingInner: {
        width: 24,
        height: 24,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },
});

export default FoodAnalyzerScreen;
