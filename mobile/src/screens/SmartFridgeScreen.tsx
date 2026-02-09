// Smart Fridge Screen - Scan fridge and get recipe suggestions
import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Image,
    ScrollView, SafeAreaView, Dimensions, Alert, ActivityIndicator, AppState
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { UserProfile, Recipe, CookingMood } from '../types';
import { llmQueueService } from '../services/llmQueueService';
import storage from '../services/storageService';
import { useEnergy } from '../contexts/EnergyContext';
import { useLanguage } from '../contexts/LanguageContext';
import { JOB_ENERGY_COSTS } from '../services/energyService';
import { analytics } from '../services/analyticsService';
import { useFeatureGate } from '../hooks/useFeatureGate';

import { PermissionModal } from '../components';

const { width } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'SmartFridge'>;

type FridgeState = 'camera' | 'analyzing_ingredients' | 'select_mood' | 'generating_recipes' | 'results';

const SmartFridgeScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const { energy, canAfford, showAdRecharge, queueEnergyRetry } = useEnergy();
    const { language, t } = useLanguage();
    const fridgeGate = useFeatureGate('fridge_scan');
    const [permission, requestPermission] = useCameraPermissions();
    const isFocused = useIsFocused();
    const appStateRef = useRef(AppState.currentState);
    const [appStateVisible, setAppStateVisible] = useState(appStateRef.current);
    const [cameraKey, setCameraKey] = useState(0);
    const [fridgeState, setFridgeState] = useState<FridgeState>('camera');
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [capturedVideo, setCapturedVideo] = useState<string | null>(null);
    const [ingredients, setIngredients] = useState<string[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [bookmarkedRecipes, setBookmarkedRecipes] = useState<Recipe[]>([]);
    const [showSavedRecipes, setShowSavedRecipes] = useState(false);
    const cameraRef = useRef<CameraView>(null);
    const renderIngredients = Array.isArray(ingredients) ? ingredients : [];
    const renderRecipes = Array.isArray(recipes) ? recipes : [];
    const safeBookmarkedRecipes = Array.isArray(bookmarkedRecipes) ? bookmarkedRecipes : [];

    // Video capture state
    const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('photo');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25MB safety cap for base64 conversion

    const [showPermissionModal, setShowPermissionModal] = useState(false);

    const canShowCamera =
        isFocused &&
        appStateVisible === 'active' &&
        permission?.granted &&
        fridgeState === 'camera' &&
        !capturedImage &&
        !capturedVideo;

    useEffect(() => {
        loadUser();
        loadBookmarks();
        checkPermission();
    }, []);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            appStateRef.current = nextAppState;
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
    }, [isFocused, isRecording]);

    const checkPermission = async () => {
        if (permission && !permission.granted) {
            // Show modal regardless of canAskAgain - modal will handle "Go to Settings" flow
            setShowPermissionModal(true);
        }
    };

    // ... existing loadUser, loadBookmarks ...

    const loadUser = async () => {
        const savedUser = await storage.get<UserProfile>(storage.keys.USER);
        if (savedUser) setUser(savedUser);
    };

    const loadBookmarks = useCallback(async () => {
        const saved = await storage.get<Recipe[]>(storage.keys.SAVED_RECIPES);
        setBookmarkedRecipes(Array.isArray(saved) ? saved : []);
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadBookmarks();
            setCameraKey(prev => prev + 1);
            return () => {
                if (cameraRef.current) {
                    // @ts-ignore - pausePreview exists on some camera implementations
                    cameraRef.current.pausePreview?.();
                }
                if (recordingTimerRef.current) {
                    clearInterval(recordingTimerRef.current);
                    recordingTimerRef.current = null;
                }
                if (isRecording && cameraRef.current) {
                    cameraRef.current.stopRecording();
                }
                setIsRecording(false);
            };
        }, [loadBookmarks, isRecording])
    );

    const toggleBookmark = async (recipe: Recipe) => {
        const isSaved = safeBookmarkedRecipes.some(r => r.name === recipe.name);
        const next = isSaved
            ? safeBookmarkedRecipes.filter(r => r.name !== recipe.name)
            : [...safeBookmarkedRecipes, recipe];

        setBookmarkedRecipes(next);
        await storage.set(storage.keys.SAVED_RECIPES, next);
        Alert.alert(
            isSaved ? t('smart_fridge.alert.removed_title') : t('smart_fridge.alert.saved_title'),
            isSaved ? t('smart_fridge.alert.removed_body') : t('smart_fridge.alert.saved_body')
        );
    };

    const takePicture = async () => {
        if (!fridgeGate.checkOnly()) {
            fridgeGate.showPaywall();
            return;
        }
        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync({
                    base64: false,
                    quality: 0.7,
                });
                if (photo?.uri) {
                    if (!fridgeGate.consume()) {
                        fridgeGate.showPaywall();
                        return;
                    }
                    setCapturedImage(photo.uri);
                    setCapturedVideo(null);
                    analyzeIngredients(photo.uri, guessMimeType(photo.uri), false);
                }
            } catch (error) {
                console.error('Failed to take picture:', error);
                Alert.alert(t('alert.error'), t('smart_fridge.alert.capture_failed'));
            }
        }
    };

    const pickImage = async () => {
        if (!fridgeGate.checkOnly()) {
            fridgeGate.showPaywall();
            return;
        }
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
                base64: false,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                if (asset.uri) {
                    if (!fridgeGate.consume()) {
                        fridgeGate.showPaywall();
                        return;
                    }
                    setCapturedImage(asset.uri);
                    setCapturedVideo(null);
                    analyzeIngredients(asset.uri, guessMimeType(asset.uri), false);
                }
            }
        } catch (error) {
            console.error('Failed to pick image:', error);
            Alert.alert(t('alert.error'), t('smart_fridge.alert.pick_failed'));
        }
    };

    const guessMimeType = (uri: string): string => {
        const lower = uri.toLowerCase();
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.webp')) return 'image/webp';
        return 'image/jpeg';
    };

    /**
     * Get Gemini-compatible video MIME type
     * Gemini accepts: video/mp4, video/mpeg, video/mov, video/avi, video/x-flv, video/mpg, video/webm, video/wmv, video/3gpp
     * NOTE: video/quicktime is NOT supported - use video/mov for .mov files
     */
    const getVideoMimeType = (uri: string): string => {
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

    // Start video recording
    const startVideoRecording = async () => {
        if (cameraRef.current && !isRecording) {
            try {
                if (!fridgeGate.checkOnly()) {
                    fridgeGate.showPaywall();
                    return;
                }

                setIsRecording(true);
                setRecordingDuration(0);

                // Start duration timer
                recordingTimerRef.current = setInterval(() => {
                    setRecordingDuration(prev => prev + 1);
                }, 1000);

                const video = await cameraRef.current.recordAsync({
                    maxDuration: 30, // Max 30 seconds for fridge scanning
                    // Force H.264 codec on iOS for better Gemini compatibility
                    // (HEVC/H.265 may not be supported by Gemini)
                    codec: 'avc1', // H.264/AVC codec
                });

                if (video?.uri) {
                    const info = await FileSystem.getInfoAsync(video.uri);
                    if (info.exists && typeof info.size === 'number' && info.size > MAX_VIDEO_BYTES) {
                        Alert.alert(
                            t('smart_fridge.alert.video_too_large.title'),
                            t('smart_fridge.alert.video_too_large.body')
                        );
                        setCapturedImage(null);
                        setCapturedVideo(null);
                        return;
                    }

                    if (!fridgeGate.consume()) {
                        fridgeGate.showPaywall();
                        setCapturedImage(null);
                        setCapturedVideo(null);
                        return;
                    }

                    setCapturedImage(null);
                    setCapturedVideo(video.uri);
                    const videoMimeType = getVideoMimeType(video.uri);
                    analyzeIngredients(video.uri, videoMimeType, true);
                } else {
                    console.error('[SmartFridge] Video recording returned no URI');
                    Alert.alert(t('alert.error'), t('smart_fridge.alert.record_failed'));
                }
            } catch (error) {
                console.error('[SmartFridge] Failed to record video:', error);
                Alert.alert(t('alert.error'), t('smart_fridge.alert.capture_video_failed'));
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

    const analyzeIngredients = async (mediaUri: string, mimeType: string, fromVideo: boolean = false) => {
        // Use higher energy job type for video captures
        const jobType = fromVideo ? 'DETECT_INGREDIENTS_VIDEO' : 'DETECT_INGREDIENTS';
        const jobCost = JOB_ENERGY_COSTS[jobType] || 0;
        if (jobCost > 0 && !canAfford(jobCost)) {
            analytics.logEvent('fridge_scan_blocked', { reason: 'energy_low', media: fromVideo ? 'video' : 'photo' });
            Alert.alert(t('alert.low_energy'), t('smart_fridge.alert.low_energy_scan', { cost: jobCost, energy }));
            queueEnergyRetry(() => analyzeIngredients(mediaUri, mimeType, fromVideo));
            showAdRecharge();
            return;
        }

        analytics.logEvent('fridge_scan_started', { media: fromVideo ? 'video' : 'photo' });
        setFridgeState('analyzing_ingredients');
        try {
            const detected = fromVideo
                ? await llmQueueService.detectIngredientsNow({
                    imageUri: mediaUri,
                    mimeType,
                })
                : await llmQueueService.addJobAndWait<string[]>(jobType, {
                    imageUri: mediaUri,
                    mimeType,
                }, 'high');
            const detectedList = Array.isArray(detected) ? detected : [];
            setIngredients(detectedList);
            analytics.logEvent('fridge_scan_completed', { count: detectedList.length });
            setFridgeState('select_mood');
        } catch (error) {
            const debugMessage = error instanceof Error ? error.message : String(error);
            const localizedError = t('smart_fridge.alert.unknown_error');
            console.error('[SmartFridge] Ingredient detection failed:', debugMessage, error);
            analytics.logEvent('fridge_scan_failed', { reason: error instanceof Error ? error.name : 'unknown' });
            if (error instanceof Error && error.name === 'InsufficientEnergyError') {
                Alert.alert(t('alert.low_energy'), t('smart_fridge.alert.low_energy_scan_short'));
                queueEnergyRetry(() => analyzeIngredients(mediaUri, mimeType, fromVideo));
                showAdRecharge();
                setFridgeState('camera');
                return;
            }
            // Show more specific error for debugging
            const displayError = fromVideo
                ? t('smart_fridge.alert.video_failed_body', { error: localizedError })
                : t('smart_fridge.alert.scan_failed_body');
            Alert.alert(t('alert.error'), displayError);
            setCapturedImage(null);
            setCapturedVideo(null);
            setFridgeState('camera');
        }
    };

    const handleMoodSelect = async (mood: CookingMood) => {
        if (!user) {
            Alert.alert(t('smart_fridge.alert.profile_required_title'), t('smart_fridge.alert.profile_required_body'));
            return;
        }

        const jobCost = JOB_ENERGY_COSTS['GENERATE_FRIDGE_RECIPES'] || 0;
        if (jobCost > 0 && !canAfford(jobCost)) {
            analytics.logEvent('fridge_recipe_blocked', { reason: 'energy_low', mood });
            Alert.alert(t('alert.low_energy'), t('smart_fridge.alert.low_energy_recipes', { cost: jobCost, energy }));
            queueEnergyRetry(() => handleMoodSelect(mood));
            showAdRecharge();
            return;
        }

        const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
        if (safeIngredients.length === 0) {
            Alert.alert(t('smart_fridge.alert.no_ingredients_title'), t('smart_fridge.alert.no_ingredients_body'));
            setCapturedImage(null);
            setCapturedVideo(null);
            setFridgeState('camera');
            return;
        }

        analytics.logEvent('fridge_mood_selected', { mood });
        setFridgeState('generating_recipes');
        try {
            // Use queue for rate limit protection
            const generatedRecipes = await llmQueueService.addJobAndWait<Recipe[]>('GENERATE_FRIDGE_RECIPES', {
                ingredients: safeIngredients,
                mood,
                language,
            }, 'high');
            // Null-safe: ensure we always have an array
            setRecipes(Array.isArray(generatedRecipes) ? generatedRecipes : []);
            analytics.logEvent('fridge_recipes_completed', { count: Array.isArray(generatedRecipes) ? generatedRecipes.length : 0 });
            setFridgeState('results');
        } catch (error) {
            console.error('Recipe generation failed:', error);
            analytics.logEvent('fridge_recipes_failed', { reason: error instanceof Error ? error.name : 'unknown' });
            if (error instanceof Error && error.name === 'InsufficientEnergyError') {
                Alert.alert(t('alert.low_energy'), t('smart_fridge.alert.low_energy_recipes_short'));
                queueEnergyRetry(() => handleMoodSelect(mood));
                showAdRecharge();
                setFridgeState('select_mood');
                return;
            }
            Alert.alert(t('alert.error'), t('smart_fridge.alert.recipe_failed'));
            setFridgeState('select_mood');
        }
    };

    const retake = () => {
        setCapturedImage(null);
        setCapturedVideo(null);
        setIngredients([]);
        setRecipes([]);
        setSelectedRecipe(null);
        setFridgeState('camera');
    };

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
                    <Text style={styles.permissionTitle}>{t('permission_modal.camera.title')}</Text>
                    <Text style={styles.permissionSubtitle}>{t('permission_modal.camera.description')}</Text>
                    <TouchableOpacity
                        style={styles.permissionButton}
                        onPress={() => setShowPermissionModal(true)}
                    >
                        <Text style={styles.permissionButtonText}>{t('food_analyzer.permission.grant')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.permissionButton, styles.permissionSecondary]}
                        onPress={pickImage}
                    >
                        <Text style={[styles.permissionButtonText, styles.permissionSecondaryText]}>
                            {t('food_analyzer.permission.pick_gallery')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Text style={styles.permissionBack}>{t('food_analyzer.permission.back')}</Text>
                    </TouchableOpacity>
                </View>
                <PermissionModal
                    visible={showPermissionModal}
                    permissionType="camera"
                    canAskAgain={permission?.canAskAgain ?? true}
                    onGranted={() => {
                        requestPermission();
                        setShowPermissionModal(false);
                    }}
                    onDenied={() => setShowPermissionModal(false)}
                    onClose={() => setShowPermissionModal(false)}
                />
            </SafeAreaView>
        );
    }

    // Recipe Detail View
    if (selectedRecipe) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setSelectedRecipe(null)}>
                        <Text style={styles.backBtn}>← {t('back')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('smart_fridge.header.recipe')}</Text>
                    <TouchableOpacity onPress={() => toggleBookmark(selectedRecipe)}>
                        <Text style={styles.bookmarkHeader}>
                            {bookmarkedRecipes.some(r => r.name === selectedRecipe.name) ? '❤️' : '🤍'}
                        </Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.recipeDetail} contentContainerStyle={styles.recipeDetailContent}>
                    <Text style={styles.recipeName}>{selectedRecipe.name}</Text>

                    {selectedRecipe.chefNote && (
                        <View style={styles.chefNoteBox}>
                            <Text style={styles.chefNoteLabel}>👨‍🍳 {t('smart_fridge.recipe.chef_note')}</Text>
                            <Text style={styles.chefNoteText}>"{selectedRecipe.chefNote}"</Text>
                        </View>
                    )}

                    <View style={styles.recipeStats}>
                        <View style={styles.recipeStat}>
                            <Text style={styles.recipeStatValue}>{selectedRecipe.prepTime}</Text>
                            <Text style={styles.recipeStatLabel}>{t('smart_fridge.recipe.prep_time')}</Text>
                        </View>
                        <View style={styles.recipeStat}>
                            <Text style={styles.recipeStatValue}>{selectedRecipe.calories}</Text>
                            <Text style={styles.recipeStatLabel}>{t('calories')}</Text>
                        </View>
                        <View style={styles.recipeStat}>
                            <Text style={styles.recipeStatValue}>
                                {selectedRecipe.protein}{t('units.g')}
                            </Text>
                            <Text style={styles.recipeStatLabel}>{t('protein')}</Text>
                        </View>
                    </View>

                    {Array.isArray(selectedRecipe.missingIngredients) && selectedRecipe.missingIngredients.length > 0 && (
                        <View style={styles.missingBox}>
                            <Text style={styles.missingLabel}>⚠️ {t('smart_fridge.recipe.missing')}</Text>
                            <Text style={styles.missingText}>
                                {selectedRecipe.missingIngredients.join(', ')}
                            </Text>
                        </View>
                    )}

                    <View style={styles.instructionsBox}>
                        <Text style={styles.instructionsLabel}>📝 {t('smart_fridge.recipe.instructions')}</Text>
                        {(selectedRecipe.instructions || []).map((step, idx) => (
                            <View key={idx} style={styles.instructionStep}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>{idx + 1}</Text>
                                </View>
                                <Text style={styles.stepText}>{step || ''}</Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // Saved Recipes List
    if (showSavedRecipes) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setShowSavedRecipes(false)}>
                        <Text style={styles.backBtn}>← {t('back')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('smart_fridge.header.saved_recipes')}</Text>
                    <View style={{ width: 50 }} />
                </View>
                <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
                    {safeBookmarkedRecipes.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyEmoji}>📖</Text>
                            <Text style={styles.emptyText}>{t('smart_fridge.saved.empty')}</Text>
                        </View>
                    ) : (
                        safeBookmarkedRecipes.map((recipe, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={styles.recipeCard}
                                onPress={() => {
                                    analytics.logEvent('fridge_recipe_opened', { source: 'saved' });
                                    navigation.navigate('Recipe', { kind: 'fridge', recipe });
                                }}
                            >
                                <View style={styles.recipeHeader}>
                                    <Text style={styles.recipeTitle}>{recipe.name}</Text>
                                    <Text>❤️</Text>
                                </View>
                                <View style={styles.recipeInfo}>
                                    <Text style={styles.recipeInfoText}>{t('smart_fridge.recipe.prep_short', { time: recipe.prepTime })}</Text>
                                    <Text style={styles.recipeInfoText}>{t('smart_fridge.recipe.calories_short', { calories: recipe.calories })}</Text>
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>
            </SafeAreaView>
        );
    }

    const hasCapturedMedia = !!(capturedImage || capturedVideo);

    // Camera View
    if (fridgeState === 'camera' && !capturedImage && !capturedVideo) {
        return (
            <View style={styles.container}>
                <View style={styles.cameraWrapper}>
                    {canShowCamera ? (
                        <CameraView
                            key={cameraKey}
                            ref={cameraRef}
                            style={styles.camera}
                            facing="back"
                            mode={captureMode === 'video' ? 'video' : 'picture'}
                            mute={captureMode === 'video'}
                        />
                    ) : (
                        <View style={styles.cameraPaused}>
                            <ActivityIndicator size="large" color="#06b6d4" />
                        </View>
                    )}

                    <View style={styles.cameraOverlay} pointerEvents="box-none">
                        <SafeAreaView style={styles.overlayTopRow} pointerEvents="box-none">
                            <TouchableOpacity
                                style={styles.closeButton}
                                onPress={() => navigation.goBack()}
                            >
                                <Text style={styles.closeText}>✕</Text>
                            </TouchableOpacity>
                        </SafeAreaView>

                        <View style={styles.fridgeFrame} pointerEvents="none">
                            <View style={[styles.corner, styles.topLeft]} />
                            <View style={[styles.corner, styles.topRight]} />
                            <View style={[styles.corner, styles.bottomLeft]} />
                            <View style={[styles.corner, styles.bottomRight]} />
                            <Text style={styles.frameText}>🧊 {t('smart_fridge.camera.frame')}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.controlsContainer}>
                    {/* Recording Timer */}
                    {isRecording && (
                        <View style={{ marginBottom: 10 }}>
                            <Text style={{ color: '#ff4444', fontSize: 18, fontWeight: 'bold' }}>
                                🔴 {t('smart_fridge.camera.timer', { seconds: recordingDuration })}
                            </Text>
                        </View>
                    )}

                    {/* Photo/Video Mode Toggle */}
                    <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                        <TouchableOpacity
                            style={{ padding: 12, backgroundColor: captureMode === 'photo' ? '#10b981' : 'transparent', borderRadius: 8, marginRight: 8 }}
                            onPress={() => setCaptureMode('photo')}
                        >
                            <Text style={{ color: captureMode === 'photo' ? '#fff' : '#94A3B8' }}>📷 {t('smart_fridge.mode.photo')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ padding: 12, backgroundColor: captureMode === 'video' ? '#10b981' : 'transparent', borderRadius: 8 }}
                            onPress={() => setCaptureMode('video')}
                        >
                            <Text style={{ color: captureMode === 'video' ? '#fff' : '#94A3B8' }}>🎥 {t('smart_fridge.mode.video')}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Capture Button */}
                    <TouchableOpacity
                        style={[styles.captureButton, isRecording && { borderColor: '#ff4444' }]}
                        onPress={() => {
                            if (captureMode === 'photo') {
                                takePicture();
                            } else {
                                if (isRecording) {
                                    stopRecording();
                                } else {
                                    startVideoRecording();
                                }
                            }
                        }}
                    >
                        <View style={[styles.captureInner, isRecording && { backgroundColor: '#ff4444' }]}>
                            <Text style={styles.captureIcon}>
                                {captureMode === 'photo' ? '🥦' : (isRecording ? '⏹️' : '🎬')}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
                        <Text style={styles.galleryIcon}>🖼️</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.savedButton}
                        onPress={() => setShowSavedRecipes(true)}
                    >
                        <Text style={styles.savedIcon}>📖</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Processing States
    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={retake}>
                    <Text style={styles.backBtn}>← {t('smart_fridge.action.retake')}</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('smart_fridge.header.title')}</Text>
                <View style={{ width: 50 }} />
            </View>

            {/* Captured Media */}
            {hasCapturedMedia && (
                <View style={styles.imageContainer}>
                    {capturedImage ? (
                        <Image source={{ uri: capturedImage }} style={styles.capturedImage} />
                    ) : (
                        <View style={styles.videoPreview}>
                            <Text style={styles.videoPreviewText}>{t('smart_fridge.video.captured')}</Text>
                        </View>
                    )}

                    {(fridgeState === 'analyzing_ingredients' || fridgeState === 'generating_recipes') && (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator size="large" color="#10b981" />
                            <Text style={styles.loadingText}>
                                {fridgeState === 'analyzing_ingredients'
                                    ? t('smart_fridge.loading.ingredients')
                                    : t('smart_fridge.loading.recipes')}
                            </Text>
                        </View>
                    )}
                </View>
            )}

            <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
                {/* Select Mood */}
                {fridgeState === 'select_mood' && (
                    <View style={styles.moodSection}>
                        <Text style={styles.sectionTitle}>{t('smart_fridge.mood.title')}</Text>
                        <Text style={styles.ingredientCount}>
                            {t('smart_fridge.mood.ingredients_found', { count: renderIngredients.length })}
                        </Text>

                        <View style={styles.ingredientTags}>
                            {renderIngredients.map((ing, idx) => (
                                <View key={idx} style={styles.ingredientTag}>
                                    <Text style={styles.ingredientTagText}>{ing}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={styles.moodOptions}>
                            <TouchableOpacity
                                style={[styles.moodCard, styles.moodQuick]}
                                onPress={() => handleMoodSelect('quick')}
                                accessibilityLabel={t('smart_fridge.mood.quick.accessibility')}
                                accessibilityRole="button"
                            >
                                <View style={styles.moodCardHeader}>
                                    <Text style={styles.moodEmoji}>⚡</Text>
                                    <View style={styles.moodTimeBadge}>
                                        <Text style={styles.moodTimeText}>{t('smart_fridge.mood.quick.time')}</Text>
                                    </View>
                                </View>
                                <Text style={styles.moodTitle}>{t('smart_fridge.mood.quick.title')}</Text>
                                <Text style={styles.moodDesc}>{t('smart_fridge.mood.quick.desc')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.moodCard, styles.moodBalanced]}
                                onPress={() => handleMoodSelect('balanced')}
                                accessibilityLabel={t('smart_fridge.mood.balanced.accessibility')}
                                accessibilityRole="button"
                            >
                                <View style={styles.moodCardHeader}>
                                    <Text style={styles.moodEmoji}>🍳</Text>
                                    <View style={styles.moodTimeBadge}>
                                        <Text style={styles.moodTimeText}>{t('smart_fridge.mood.balanced.time')}</Text>
                                    </View>
                                </View>
                                <Text style={styles.moodTitle}>{t('smart_fridge.mood.balanced.title')}</Text>
                                <Text style={styles.moodDesc}>{t('smart_fridge.mood.balanced.desc')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.moodCard, styles.moodGourmet]}
                                onPress={() => handleMoodSelect('gourmet')}
                                accessibilityLabel={t('smart_fridge.mood.gourmet.accessibility')}
                                accessibilityRole="button"
                            >
                                <View style={styles.moodCardHeader}>
                                    <Text style={styles.moodEmoji}>👨‍🍳</Text>
                                    <View style={styles.moodTimeBadge}>
                                        <Text style={styles.moodTimeText}>{t('smart_fridge.mood.gourmet.time')}</Text>
                                    </View>
                                </View>
                                <Text style={styles.moodTitle}>{t('smart_fridge.mood.gourmet.title')}</Text>
                                <Text style={styles.moodDesc}>{t('smart_fridge.mood.gourmet.desc')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Results */}
                {fridgeState === 'results' && (
                    <View style={styles.resultsSection}>
                        <Text style={styles.sectionTitle}>{t('smart_fridge.results.title')}</Text>

                        {renderRecipes.map((recipe, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={styles.recipeCard}
                                onPress={() => {
                                    analytics.logEvent('fridge_recipe_opened', { source: 'results' });
                                    navigation.navigate('Recipe', { kind: 'fridge', recipe });
                                }}
                            >
                                <View style={styles.recipeHeader}>
                                    <Text style={styles.recipeTitle}>{recipe.name}</Text>
                                    <View style={styles.calorieBadge}>
                                        <Text style={styles.calorieText}>{t('smart_fridge.recipe.calories_short', { calories: recipe.calories })}</Text>
                                    </View>
                                </View>

                                <View style={styles.recipeInfo}>
                                    <Text style={styles.recipeInfoText}>{t('smart_fridge.recipe.prep_short', { time: recipe.prepTime })}</Text>
                                    <Text style={styles.recipeInfoText}>{t('smart_fridge.recipe.protein_short', { protein: recipe.protein })}</Text>
                                </View>

                                {Array.isArray(recipe.missingIngredients) && recipe.missingIngredients.length > 0 && (
                                    <Text style={styles.missingSmall}>
                                        {t('smart_fridge.results.missing', { ingredients: recipe.missingIngredients.join(', ') })}
                                    </Text>
                                )}

                                <Text style={styles.viewRecipe}>{t('smart_fridge.results.view')}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>

            <PermissionModal
                visible={showPermissionModal}
                permissionType="camera"
                canAskAgain={permission?.canAskAgain ?? true}
                onGranted={() => {
                    setShowPermissionModal(false);
                    requestPermission(); // Sync state
                }}
                onDenied={() => {
                    setShowPermissionModal(false);
                    // Optionally show a "limited feature" toast or just let them use gallery
                }}
                onClose={() => setShowPermissionModal(false)}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#064e3b',
    },
    backText: {
        color: 'rgba(255,255,255,0.6)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#064e3b',
    },
    backBtn: {
        color: '#10b981',
        fontSize: 16,
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
    },
    cameraWrapper: { flex: 1, width: '100%', position: 'relative' },
    camera: {
        flex: 1,
    },
    cameraOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        padding: 16,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    overlayTopRow: { width: '100%', flexDirection: 'row', justifyContent: 'flex-start' },
    closeButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeText: {
        color: '#ffffff',
        fontSize: 24,
    },
    fridgeFrame: {
        position: 'absolute',
        top: '15%',
        left: '8%',
        right: '8%',
        height: '55%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    frameText: {
        color: '#ffffff',
        fontSize: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    corner: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderColor: '#10b981',
    },
    topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
    topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
    bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
    bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
    controlsContainer: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    captureButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#10b981',
    },
    captureInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureIcon: {
        fontSize: 28,
    },
    imageContainer: {
        height: 200,
        backgroundColor: '#000',
    },
    capturedImage: {
        flex: 1,
        resizeMode: 'cover',
    },
    videoPreview: {
        flex: 1,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoPreviewText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#ffffff',
        marginTop: 12,
        fontSize: 16,
    },
    contentScroll: {
        flex: 1,
        backgroundColor: '#020617',
    },
    contentContainer: {
        padding: 20,
        paddingBottom: 40,
    },
    moodSection: {},
    sectionTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    ingredientCount: {
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 16,
    },
    ingredientTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 24,
    },
    ingredientTag: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
        marginBottom: 8,
    },
    ingredientTagText: {
        color: '#10b981',
        fontSize: 13,
    },
    moodOptions: {
        gap: 12,
    },
    moodCard: {
        padding: 20,
        borderRadius: 16,
        marginBottom: 0,
    },
    moodQuick: {
        backgroundColor: 'rgba(249, 115, 22, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(249, 115, 22, 0.3)',
    },
    moodBalanced: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    moodGourmet: {
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    moodCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    moodEmoji: {
        fontSize: 28,
    },
    moodTimeBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    moodTimeText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
    },
    moodTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
    },
    moodDesc: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        marginTop: 4,
    },
    resultsSection: {},
    recipeCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    recipeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    recipeTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
        marginRight: 8,
    },
    calorieBadge: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    calorieText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
    },
    recipeInfo: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 8,
    },
    recipeInfoText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
    },
    missingSmall: {
        color: '#ef4444',
        fontSize: 12,
        marginBottom: 8,
    },
    viewRecipe: {
        color: '#10b981',
        fontSize: 14,
        fontWeight: '600',
    },
    // Recipe Detail
    recipeDetail: {
        flex: 1,
        backgroundColor: '#020617',
    },
    recipeDetailContent: {
        padding: 20,
        paddingBottom: 40,
    },
    recipeName: {
        fontSize: 28,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 16,
    },
    chefNoteBox: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    chefNoteLabel: {
        color: '#818cf8',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 6,
    },
    chefNoteText: {
        color: '#c7d2fe',
        fontSize: 14,
        fontStyle: 'italic',
    },
    recipeStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    recipeStat: {
        alignItems: 'center',
    },
    recipeStatValue: {
        color: '#10b981',
        fontSize: 20,
        fontWeight: '700',
    },
    recipeStatLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        marginTop: 4,
    },
    missingBox: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
    },
    missingLabel: {
        color: '#ef4444',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
    },
    missingText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
    },
    instructionsBox: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 12,
        padding: 16,
    },
    instructionsLabel: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 16,
    },
    instructionStep: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    stepNumberText: {
        color: '#10b981',
        fontWeight: '700',
    },
    stepText: {
        flex: 1,
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        lineHeight: 22,
    },
    galleryButton: {
        position: 'absolute',
        right: 40,
        top: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    galleryIcon: { fontSize: 20 },
    savedButton: {
        position: 'absolute',
        left: 40,
        top: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    savedIcon: { fontSize: 20 },
    bookmarkHeader: { fontSize: 24 },
    emptyState: { alignItems: 'center', marginTop: 40 },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
    cameraPaused: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#020617',
    },
    permissionContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    permissionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
        textAlign: 'center',
    },
    permissionSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 20,
        textAlign: 'center',
    },
    permissionButton: {
        width: '100%',
        backgroundColor: '#06b6d4',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 12,
    },
    permissionButtonText: {
        color: '#0f172a',
        fontWeight: '700',
    },
    permissionSecondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#334155',
    },
    permissionSecondaryText: {
        color: '#ffffff',
    },
    permissionBack: {
        color: 'rgba(255,255,255,0.6)',
        marginTop: 8,
    },
});

export default SmartFridgeScreen;
