// Sleep Tracker Screen with Motion Detection and AI Analysis
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
    Alert, Vibration, ActivityIndicator, DeviceEventEmitter, TextInput, Switch
} from 'react-native';
import { PermissionModal } from '../components/PermissionModal';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Accelerometer, AccelerometerMeasurement } from 'expo-sensors';
import storage from '../services/storageService';
import { llmQueueService } from '../services/llmQueueService';
import { useEnergy } from '../contexts/EnergyContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ENERGY_COSTS, type AutoSleepSettings, type SleepScheduleSuggestion, type UserProfile } from '../types';
import { sleepService } from '../services/sleepService';
import { soundService } from '../services/soundService';
import { subscribe } from '../services/planEventService';
import { sleepScheduleService } from '../services/sleepScheduleService';
import { analytics } from '../services/analyticsService';


import { RouteProp, useRoute } from '@react-navigation/native';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'SleepTracker'>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'SleepTracker'>;

interface SleepSession {
    id: string;
    startTime: number;
    endTime?: number;
    duration: number;
    quality: 'poor' | 'fair' | 'good' | 'excellent';
    motionEvents: number;
    deepSleepPercentage: number;
    aiAnalysis?: string;
    sleepScore?: number;
}

type DiagnosticsState = {
    lastContext?: any;
    autoSleepSettings?: AutoSleepSettings | null;
    isSleeping: boolean;
    isGhost: boolean;
    sleepStartTime?: number | null;
    sleepProbeTime?: number | null;
    lastWakeTime?: number | null;
};

const SleepTrackerScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<ScreenRouteProp>();
    const [isTracking, setIsTracking] = useState(false);
    const [sleepStartTime, setSleepStartTime] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [motionLevel, setMotionLevel] = useState(0);
    const [motionEvents, setMotionEvents] = useState(0);
    const [recentSessions, setRecentSessions] = useState<SleepSession[]>([]);

    const [showPermissionModal, setShowPermissionModal] = useState(false);

    // Alarm state
    const [alarmTime, setAlarmTime] = useState<Date | null>(null);
    const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);

    const [activeTab, setActiveTab] = useState<'tracker' | 'diagnostics'>('tracker');
    const [scheduleSuggestion, setScheduleSuggestion] = useState<SleepScheduleSuggestion | null>(null);
    const [scheduleBedTime, setScheduleBedTime] = useState('');
    const [scheduleWakeTime, setScheduleWakeTime] = useState('');
    const [autoScheduleEnabled, setAutoScheduleEnabled] = useState(false);
    const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({
        isSleeping: false,
        isGhost: false,
    });

    // ... refs ...
    const subscriptionRef = useRef<{ remove: () => void } | null>(null);
    const motionDataRef = useRef<number[]>([]);
    const motionLogRef = useRef<{ timestamp: number; intensity: number }[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const stopInProgressRef = useRef(false);


    // Smart Alarm Constants
    const SMART_WINDOW_MS = 30 * 60 * 1000; // 30 mins
    const WAKE_THRESHOLD = 1.2; // G-force variance threshold for "Light Sleep/Awake"

    // Energy context
    const { energy, canAfford } = useEnergy();
    const { language, t } = useLanguage();

    useEffect(() => {
        checkTrackingStatus();
        loadRecentSessions();

        // Listen for background AI analysis completion
        const unsubscribeAnalysis = subscribe('SLEEP_ANALYZED', () => {
            console.log('[SleepTracker] Received AI analysis, reloading sessions');
            loadRecentSessions();
        });

        // Listen for native overlay events (sleep/wake detection)
        const onOverlayAction = DeviceEventEmitter.addListener('onOverlayAction', (event) => {
            console.log('[SleepTracker] Received overlay action:', event);

            const { action, type } = event;

            if (action === 'SLEEP_CONFIRMED' && type === 'sleep') {
                // User confirmed sleep from overlay
                console.log('[SleepTracker] Sleep confirmed via overlay');
                setIsTracking(true);
                setSleepStartTime(event.sleepStartTime || Date.now());
                loadRecentSessions();
            } else if (action === 'WAKE_CONFIRMED' && type === 'wake') {
                // User confirmed wake from overlay
                console.log('[SleepTracker] Wake confirmed via overlay');
                setIsTracking(false);
                setSleepStartTime(null);
                loadRecentSessions();
            } else if (action === 'SNOOZED') {
                // User snoozed the overlay
                console.log('[SleepTracker] Overlay snoozed');
            } else if (action === 'DISMISSED') {
                // User dismissed the overlay
                console.log('[SleepTracker] Overlay dismissed');
            }
        });

        return () => {
            unsubscribeAnalysis();
            onOverlayAction.remove();
            if (subscriptionRef.current) {
                subscriptionRef.current.remove();
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            soundService.stopAlarm().catch(() => undefined);
        };
    }, []);

    useEffect(() => {
        if (isTracking && activeTab === 'diagnostics') {
            setActiveTab('tracker');
        }
    }, [isTracking, activeTab]);

    useEffect(() => {
        if (activeTab === 'diagnostics') {
            void loadDiagnostics();
        }
    }, [activeTab]);

    const checkTrackingStatus = async () => {
        const tracking = await sleepService.isTracking();
        if (tracking) {
            const startTime = await storage.get<number>('sleep_start_time');
            if (startTime) {
                setSleepStartTime(startTime);
                setIsTracking(true);
                // Resume foreground monitoring
                startForegroundMonitoring(startTime);

                // Handle Auto-Stop (Ghost Wakeup Confirmation)
                if (route.params?.autoStop) {
                    console.log("Auto-stopping sleep session from notification");
                    setTimeout(() => {
                        stopTracking();
                    }, 1000); // Small delay to ensure refs are set
                }
            }
        }
    };

    const loadRecentSessions = async () => {
        const history = await storage.get<SleepSession[]>(storage.keys.SLEEP_HISTORY) || [];
        setRecentSessions(history.slice(-5).reverse());
    };

    const loadDiagnostics = async () => {
        try {
            const [
                profile,
                autoSleep,
                lastContext,
                isSleeping,
                isGhost,
                sleepStartTimeValue,
                sleepProbeTimeValue,
                lastWakeTime,
                prefs,
                suggestion,
            ] = await Promise.all([
                storage.get<UserProfile>(storage.keys.USER),
                storage.get<AutoSleepSettings>(storage.keys.AUTO_SLEEP_SETTINGS),
                storage.get<any>(storage.keys.LAST_CONTEXT_SNAPSHOT),
                storage.get<boolean>('is_sleeping'),
                storage.get<boolean>('sleep_ghost_mode'),
                storage.get<number>('sleep_start_time'),
                storage.get<number>('sleep_probe_time'),
                storage.get<number>(storage.keys.LAST_WAKE_TIME),
                storage.get<any>(storage.keys.APP_PREFERENCES),
                sleepScheduleService.getScheduleSuggestion(),
            ]);

            setScheduleSuggestion(suggestion);
            setScheduleBedTime(profile?.sleepRoutine?.targetBedTime || '');
            setScheduleWakeTime(profile?.sleepRoutine?.targetWakeTime || '');
            setAutoScheduleEnabled(!!prefs?.sleepScheduleAutoEnabled);
            setDiagnostics({
                lastContext,
                autoSleepSettings: autoSleep,
                isSleeping: !!isSleeping,
                isGhost: !!isGhost,
                sleepStartTime: typeof sleepStartTimeValue === 'number' ? sleepStartTimeValue : null,
                sleepProbeTime: typeof sleepProbeTimeValue === 'number' ? sleepProbeTimeValue : null,
                lastWakeTime: typeof lastWakeTime === 'number' ? lastWakeTime : null,
            });
        } catch (error) {
            console.warn('[SleepTracker] Diagnostics load failed:', error);
        }
    };

    const formatTimestamp = (value?: number | null): string => {
        if (!value) return t('common.not_applicable');
        return new Date(value).toLocaleString();
    };

    const handleSaveSchedule = async () => {
        const normalizedBed = sleepScheduleService.normalizeTimeInput(scheduleBedTime);
        const normalizedWake = sleepScheduleService.normalizeTimeInput(scheduleWakeTime);
        if (!normalizedBed || !normalizedWake) {
            Alert.alert(t('sleep.schedule.invalid_title'), t('sleep.schedule.invalid_body'));
            return;
        }
        const result = await sleepScheduleService.updateScheduleManually(normalizedBed, normalizedWake);
        if (!result) {
            Alert.alert(t('sleep.schedule.update_failed_title'), t('sleep.schedule.update_failed_body'));
            return;
        }
        await loadDiagnostics();
        Alert.alert(t('sleep.schedule.saved_title'), t('sleep.schedule.saved_body'));
    };

    const handleApplySuggestion = async () => {
        const result = await sleepScheduleService.applySuggestion('suggested');
        if (!result) {
            Alert.alert(t('sleep.schedule.not_applied_title'), t('sleep.schedule.not_applied_body'));
            return;
        }
        await loadDiagnostics();
        Alert.alert(t('sleep.schedule.applied_title'), t('sleep.schedule.applied_body'));
    };

    const handleToggleAutoSchedule = async (value: boolean) => {
        setAutoScheduleEnabled(value);
        await sleepScheduleService.setAutoApplyEnabled(value);
    };

    const handleStartPress = async () => {
        const { status } = await Accelerometer.getPermissionsAsync();
        if (status !== 'granted') {
            setShowPermissionModal(true);
        } else {
            startTracking();
        }
    };

    const startTracking = async () => {
        await sleepService.startTracking();
        const startTime = Date.now();
        setSleepStartTime(startTime);
        setIsTracking(true);
        analytics.logEvent('sleep_tracking_started', { source: 'manual' });
        startForegroundMonitoring(startTime);
    };

    const triggerAlarm = async (message: string) => {
        if (!isAlarmPlaying) {
            setIsAlarmPlaying(true);
            await soundService.playAlarm('gentle');
            Alert.alert(t('alert.alarm'), message, [{ text: t('alert.ok'), onPress: stopTracking }]);
        }
    };

    const startForegroundMonitoring = async (startTime: number) => {
        const { status } = await Accelerometer.getPermissionsAsync();
        if (status !== 'granted') {
            const { status: newStatus } = await Accelerometer.requestPermissionsAsync();
            if (newStatus !== 'granted') {
                return;
            }
        }



        setElapsedTime(Date.now() - startTime);
        setMotionEvents(0);
        motionDataRef.current = [];
        motionLogRef.current = [];

        Accelerometer.setUpdateInterval(500);

        subscriptionRef.current = Accelerometer.addListener((data: AccelerometerMeasurement) => {
            const magnitude = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
            const movement = Math.abs(magnitude - 1) * 100;

            // Store motion log for AI analysis
            motionLogRef.current.push({ timestamp: Date.now(), intensity: movement });
            if (motionLogRef.current.length > 1000) motionLogRef.current.shift();

            motionDataRef.current.push(movement);
            if (motionDataRef.current.length > 20) motionDataRef.current.shift();

            const avgMotion = motionDataRef.current.reduce((a, b) => a + b, 0) / motionDataRef.current.length;
            setMotionLevel(Math.min(100, avgMotion * 10));

            if (movement > 5) setMotionEvents(prev => prev + 1);
        });

        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(async () => {
            const now = Date.now();
            setElapsedTime(Math.floor((now - startTime) / 1000));

            // Smart Alarm Logic
            if (alarmTime && !isAlarmPlaying) {
                const timeUntilAlarm = alarmTime.getTime() - now;

                // If within window (e.g. 30 mins before) AND movement is high (Light sleep)
                if (timeUntilAlarm > 0 && timeUntilAlarm <= SMART_WINDOW_MS) {
                    // Get recent motion avg
                    const recent = motionDataRef.current.slice(-10); // Last ~1 sec (assuming 10hz push)
                    // Simple variance calculation or max
                    const maxMotion = Math.max(...recent, 0);

                    if (maxMotion > WAKE_THRESHOLD) {
                        console.log("Smart Alarm Triggered! Motion:", maxMotion);
                        triggerAlarm(t('sleep.alarm.smart_wake'));
                    }
                } else if (now >= alarmTime.getTime()) {
                    triggerAlarm(t('sleep.alarm.time_to_wake'));
                }
            }



        }, 1000);

        Vibration.vibrate(100);
    };

    const stopTracking = async () => {
        if (stopInProgressRef.current) return;
        stopInProgressRef.current = true;

        try {
        if (subscriptionRef.current) {
            subscriptionRef.current.remove();
            subscriptionRef.current = null;
        }

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Always stop alarm and release audio focus so other apps (VoIP/music) behave normally
        await soundService.stopAlarm();
        setIsAlarmPlaying(false);

        // Stop background service
        await sleepService.stopTracking();

        if (sleepStartTime && isTracking) {
            const endTime = Date.now();
            const durationMs = endTime - sleepStartTime;
            analytics.logEvent('sleep_tracking_stopped', {
                source: 'manual',
                duration_minutes: Math.round(durationMs / 60000),
            });
            const durationHours = durationMs / (1000 * 60 * 60);

            const motionPerHour = motionEvents / Math.max(durationHours, 0.1);
            let quality: SleepSession['quality'];
            if (motionPerHour < 10) quality = 'excellent';
            else if (motionPerHour < 30) quality = 'good';
            else if (motionPerHour < 60) quality = 'fair';
            else quality = 'poor';

            const deepSleepPercentage = Math.max(20, Math.min(60, 60 - motionPerHour));

            let session: SleepSession = {
                id: Date.now().toString(),
                startTime: sleepStartTime,
                endTime,
                duration: durationHours,
                quality,
                motionEvents,
                deepSleepPercentage,
            };

            // AI Analysis if enough energy
            if (canAfford(ENERGY_COSTS.SLEEP_ANALYSIS) && durationHours >= 1) {
                try {
                    // Queue for background analysis
                    void llmQueueService.addJob('ANALYZE_SLEEP', {
                        sessionId: session.id,
                        movementLog: motionLogRef.current,
                        language
                    }).catch((error) => {
                        console.warn('[SleepTracker] Failed to queue sleep analysis:', error);
                    });
                } catch (error) {
                    console.error('Queue sleep analysis failed:', error);
                }
            }

            const history = await storage.get<SleepSession[]>(storage.keys.SLEEP_HISTORY) || [];
            await storage.set(storage.keys.SLEEP_HISTORY, [...history, session]);

            const simpleSleep = { date: new Date().toDateString(), hours: durationHours };
            await storage.set('ls_last_sleep', simpleSleep);

            setRecentSessions([session, ...recentSessions.slice(0, 4)]);

            Alert.alert(
                t('alert.sleep_complete'),
                t('sleep.summary', { duration: formatDuration(durationHours), quality: getQualityLabel(quality) }),
                [{ text: t('alert.done') }]
            );
        }

        setIsTracking(false);
        setSleepStartTime(null);
        setMotionLevel(0);
        Vibration.vibrate(200);
        } finally {
            stopInProgressRef.current = false;
        }
    };

    const formatDuration = (hours: number): string => {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return t('sleep.duration', { hours: h, minutes: m });
    };

    const formatTime = (ms: number): string => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const getQualityColor = (quality: SleepSession['quality']): string => {
        switch (quality) {
            case 'excellent': return '#22c55e';
            case 'good': return '#84cc16';
            case 'fair': return '#eab308';
            case 'poor': return '#ef4444';
        }
    };

    const getQualityLabel = (quality: SleepSession['quality']) => {
        const key = `sleep.quality.${quality}`;
        const label = t(key);
        return label === key ? quality : label;
    };

    const getScheduleConfidenceLabel = (confidence?: string) => {
        const normalized = (confidence || 'unknown').toLowerCase();
        const key = `sleep.schedule.confidence.${normalized}`;
        const label = t(key);
        return label === key ? (confidence || t('common.unknown')) : label;
    };



    return (
        <SafeAreaView style={styles.container}>
            {/* Energy Badge */}
            <View style={styles.energyBadge}>
                <Text style={styles.energyText}>⚡ {energy}</Text>
            </View>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.backBtn}>← {t('back')}</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('sleep.title')}</Text>
                <View style={{ width: 50 }} />
            </View>

            {/* Main Content */}
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.tabRow}>
                    <TouchableOpacity
                        style={[styles.tabButton, activeTab === 'tracker' && styles.tabButtonActive]}
                        onPress={() => setActiveTab('tracker')}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activeTab === 'tracker' }}
                    >
                        <Text style={[styles.tabButtonText, activeTab === 'tracker' && styles.tabButtonTextActive]}>
                            {t('sleep.tab.tracker')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.tabButton,
                            activeTab === 'diagnostics' && styles.tabButtonActive,
                            isTracking && styles.tabButtonDisabled,
                        ]}
                        onPress={() => {
                            if (!isTracking) setActiveTab('diagnostics');
                        }}
                        disabled={isTracking}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activeTab === 'diagnostics', disabled: isTracking }}
                    >
                        <Text style={[styles.tabButtonText, activeTab === 'diagnostics' && styles.tabButtonTextActive]}>
                            {t('sleep.tab.diagnostics')}
                        </Text>
                    </TouchableOpacity>
                </View>

                {activeTab === 'tracker' ? (
                    <>
                {isTracking ? (
                    <View style={styles.trackingView}>
                        <Text style={styles.trackingEmoji}>😴</Text>
                        <Text style={styles.trackingTitle}>{t('sleep.tracking.title')}</Text>
                        <Text style={styles.timer}>{formatTime(elapsedTime)}</Text>

                        <View style={styles.motionContainer}>
                            <Text style={styles.motionLabel}>{t('sleep.tracking.motion_level')}</Text>
                            <View style={styles.motionBar}>
                                <View style={[styles.motionFill, { width: `${motionLevel}%` }]} />
                            </View>
                            <Text style={styles.motionValue}>
                                {motionLevel < 20 ? t('sleep.tracking.deep_sleep') :
                                    motionLevel < 50 ? t('sleep.tracking.light_sleep') : t('sleep.tracking.awake')}
                            </Text>
                        </View>

                        <View style={styles.statsRow}>
                            <View style={styles.statBox}>
                                <Text style={styles.statValue}>{motionEvents}</Text>
                                <Text style={styles.statLabel}>{t('sleep.tracking.motion_events')}</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statValue}>{formatDuration(elapsedTime / (1000 * 60 * 60))}</Text>
                                <Text style={styles.statLabel}>{t('sleep.tracking.duration')}</Text>
                            </View>
                        </View>

                        {/* Alarm Info */}
                        {alarmTime && (
                            <View style={styles.alarmBadge}>
                                <Text style={styles.alarmText}>
                                    {t('sleep.alarm.badge', {
                                        time: alarmTime.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }),
                                    })}
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.stopBtn, isAlarmPlaying && styles.alarmActiveBtn]}
                            onPress={stopTracking}
                            accessibilityRole="button"
                            accessibilityLabel={isAlarmPlaying ? t('sleep.alarm.stop_accessibility') : t('sleep.wake.accessibility')}
                        >
                            <Text style={styles.stopBtnText}>{isAlarmPlaying ? t('sleep.alarm.stop_button') : t('sleep.wake.button')}</Text>
                        </TouchableOpacity>

                        <Text style={styles.tip}>{t('sleep.tracking.tip')}</Text>
                        {canAfford(ENERGY_COSTS.SLEEP_ANALYSIS) && (
                            <Text style={styles.aiLabel}>{t('sleep.tracking.ai_hint')}</Text>
                        )}
                    </View>
                ) : (
                    <View style={styles.startView}>
                        <Text style={styles.moonEmoji}>🌙</Text>
                        <Text style={styles.title}>{t('sleep.start.title')}</Text>
                        <Text style={styles.subtitle}>
                            {t('sleep.start.subtitle')}
                        </Text>

                        {/* Simple Alarm Setter */}
                        <View style={styles.alarmSetter}>
                            <Text style={styles.alarmLabel}>{t('sleep.alarm.label')}</Text>
                            <View style={styles.timeButtons}>
                                {[6, 7, 8, 9].map(hour => (
                                    <TouchableOpacity
                                        key={hour}
                                        style={[styles.timeBtn, alarmTime?.getHours() === hour && styles.timeBtnActive]}
                                        onPress={() => {
                                            const d = new Date();
                                            if (d.getHours() >= hour) d.setDate(d.getDate() + 1);
                                            d.setHours(hour, 0, 0, 0);
                                            setAlarmTime(d);
                                        }}
                                    >
                                        <Text style={[styles.timeBtnText, alarmTime?.getHours() === hour && styles.timeBtnTextActive]}>{hour}:00</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity
                                    style={[styles.timeBtn, alarmTime === null && styles.timeBtnActive]}
                                    onPress={() => setAlarmTime(null)}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('sleep.alarm.off_accessibility')}
                                    accessibilityState={{ selected: alarmTime === null }}
                                >
                                    <Text style={[styles.timeBtnText, alarmTime === null && styles.timeBtnTextActive]}>{t('sleep.alarm.off')}</Text>
                                </TouchableOpacity>
                            </View>
                            {alarmTime && (
                                <Text style={styles.alarmConfirm}>
                                    {t('sleep.alarm.set', {
                                        time: alarmTime.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }),
                                    })}
                                </Text>
                            )}
                        </View>

                        <TouchableOpacity
                            style={styles.startBtn}
                            onPress={handleStartPress}
                            accessibilityRole="button"
                            accessibilityLabel={t('sleep.start.accessibility_label')}
                            accessibilityHint={t('sleep.start.accessibility_hint')}
                        >
                            <Text style={styles.startBtnText}>{t('sleep.start.button')}</Text>
                        </TouchableOpacity>

                        <View style={styles.infoCard}>
                            <Text style={styles.infoTitle}>{t('sleep.info.title')}</Text>
                            <InfoItem icon="📱" text={t('sleep.info.item1')} />
                            <InfoItem icon="🎯" text={t('sleep.info.item2')} />
                            <InfoItem icon="🤖" text={t('sleep.info.item3')} />
                            <InfoItem icon="⏰" text={t('sleep.info.item4')} />
                        </View>
                    </View>
                )}

                {/* Recent Sessions */}
                {!isTracking && recentSessions.length > 0 && (
                    <View style={styles.historySection}>
                        <Text style={styles.historyTitle}>{t('sleep.history.title')}</Text>
                        {recentSessions.map((session) => (
                            <View key={session.id} style={styles.historyItem}>
                                <View style={styles.historyLeft}>
                                    <Text style={styles.historyDate}>
                                        {new Date(session.startTime).toLocaleDateString(language)}
                                    </Text>
                                    {session.sleepScore && (
                                        <Text style={styles.sleepScore}>{t('sleep.history.score', { score: session.sleepScore })}</Text>
                                    )}
                                </View>
                                <View style={styles.historyCenter}>
                                    <Text style={styles.historyDuration}>{formatDuration(session.duration)}</Text>
                                </View>
                                <View style={[styles.qualityBadge, { backgroundColor: getQualityColor(session.quality) }]}>
                                    <Text style={styles.qualityText}>{getQualityLabel(session.quality)}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
                    </>
                ) : (
                    <View style={styles.diagnosticsSection}>
                        <View style={styles.diagCard}>
                            <Text style={styles.diagTitle}>{t('sleep.schedule.title')}</Text>
                            <Text style={styles.diagText}>
                                {t('sleep.schedule.current', { bed: scheduleBedTime || t('common.not_set'), wake: scheduleWakeTime || t('common.not_set') })}
                            </Text>
                            {scheduleSuggestion && (
                                <Text style={styles.diagSubtle}>
                                    {t('sleep.schedule.suggested', { bed: scheduleSuggestion.bedTime, wake: scheduleSuggestion.wakeTime, confidence: getScheduleConfidenceLabel(scheduleSuggestion.confidence), nights: scheduleSuggestion.sampleSize })}
                                </Text>
                            )}
                            {scheduleSuggestion && scheduleSuggestion.confidence !== 'low' && (
                                <TouchableOpacity style={styles.secondaryBtn} onPress={handleApplySuggestion}>
                                    <Text style={styles.secondaryBtnText}>{t('sleep.schedule.apply')}</Text>
                                </TouchableOpacity>
                            )}
                            <View style={styles.scheduleInputs}>
                                <TextInput
                                    value={scheduleBedTime}
                                    onChangeText={setScheduleBedTime}
                                    placeholder={t('sleep.schedule.bed_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    style={styles.scheduleInput}
                                />
                                <TextInput
                                    value={scheduleWakeTime}
                                    onChangeText={setScheduleWakeTime}
                                    placeholder={t('sleep.schedule.wake_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    style={styles.scheduleInput}
                                />
                                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveSchedule}>
                                    <Text style={styles.primaryBtnText}>{t('sleep.schedule.save')}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.toggleRow}>
                                <Text style={styles.toggleLabel}>{t('sleep.schedule.auto_adjust')}</Text>
                                <Switch
                                    value={autoScheduleEnabled}
                                    onValueChange={handleToggleAutoSchedule}
                                    trackColor={{ true: '#06b6d4', false: '#1f2937' }}
                                    thumbColor={autoScheduleEnabled ? '#e2e8f0' : '#9ca3af'}
                                />
                            </View>
                        </View>

                        <View style={styles.diagCard}>
                            <Text style={styles.diagTitle}>{t('sleep.diagnostics.sleep_detection_title')}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.sleeping', { value: diagnostics.isSleeping ? t('yes') : t('no') })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.ghost', { value: diagnostics.isGhost ? t('yes') : t('no') })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.sleep_start', { value: formatTimestamp(diagnostics.sleepStartTime) })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.probe_time', { value: formatTimestamp(diagnostics.sleepProbeTime) })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.last_wake', { value: formatTimestamp(diagnostics.lastWakeTime) })}</Text>
                        </View>

                        <View style={styles.diagCard}>
                            <Text style={styles.diagTitle}>{t('sleep.diagnostics.auto_settings_title')}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.auto_enabled', { value: diagnostics.autoSleepSettings?.enabled ? t('yes') : t('no') })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.auto_anytime', { value: diagnostics.autoSleepSettings?.anytimeMode ? t('yes') : t('no') })}</Text>
                            <Text style={styles.diagText}>
                                {t('sleep.diagnostics.auto_window', { start: diagnostics.autoSleepSettings?.nightStartHour ?? t('common.not_applicable'), end: diagnostics.autoSleepSettings?.nightEndHour ?? t('common.not_applicable') })}
                            </Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.auto_charging', { value: diagnostics.autoSleepSettings?.requireCharging ? t('yes') : t('no') })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.auto_stillness', { value: diagnostics.autoSleepSettings?.stillnessThresholdMinutes ?? t('common.not_applicable') })}</Text>
                        </View>

                        <View style={styles.diagCard}>
                            <Text style={styles.diagTitle}>{t('sleep.diagnostics.context_title')}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.context_state', { value: diagnostics.lastContext?.state || t('common.unknown') })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.context_activity', { value: diagnostics.lastContext?.activity || t('common.not_applicable') })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.context_location', { value: diagnostics.lastContext?.locationLabel || t('common.unknown') })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.context_source', { value: diagnostics.lastContext?.source || t('common.not_applicable') })}</Text>
                            <Text style={styles.diagText}>{t('sleep.diagnostics.context_updated', { value: formatTimestamp(diagnostics.lastContext?.updatedAt) })}</Text>
                        </View>
                    </View>
                )}
            </ScrollView>

            <PermissionModal
                visible={showPermissionModal}
                permissionType="motion"
                onGranted={() => {
                    setShowPermissionModal(false);
                    startTracking();
                }}
                onDenied={() => setShowPermissionModal(false)}
                onClose={() => setShowPermissionModal(false)}
            />
        </SafeAreaView>
    );
};

const InfoItem: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
    <View style={styles.infoItem}>
        <Text style={styles.infoIcon}>{icon}</Text>
        <Text style={styles.infoText}>{text}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    energyBadge: { position: 'absolute', top: 50, right: 16, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, zIndex: 100 },
    energyText: { color: '#eab308', fontWeight: '600', fontSize: 14 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
    backBtn: { color: '#06b6d4', fontSize: 16 },
    headerTitle: { fontSize: 18, fontWeight: '600', color: '#ffffff' },
    content: { flexGrow: 1, padding: 20, paddingBottom: 32 },
    tabRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    tabButton: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(15, 23, 42, 0.7)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', alignItems: 'center' },
    tabButtonActive: { backgroundColor: 'rgba(6, 182, 212, 0.2)', borderColor: '#06b6d4' },
    tabButtonDisabled: { opacity: 0.5 },
    tabButtonText: { color: 'rgba(255, 255, 255, 0.7)', fontWeight: '600' },
    tabButtonTextActive: { color: '#06b6d4' },
    analyzingView: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    analyzingText: { color: '#ffffff', fontSize: 20, fontWeight: '600', marginTop: 20 },
    analyzingSubtext: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 8 },
    startView: { alignItems: 'center', paddingTop: 40 },
    moonEmoji: { fontSize: 80, marginBottom: 24 },
    title: { fontSize: 28, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center', marginBottom: 32 },
    startBtn: { backgroundColor: '#8b5cf6', paddingHorizontal: 40, paddingVertical: 18, borderRadius: 16, shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
    startBtnText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
    infoCard: { backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 16, padding: 20, marginTop: 32, width: '100%', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    infoTitle: { fontSize: 16, fontWeight: '600', color: '#ffffff', marginBottom: 16 },
    infoItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    infoIcon: { fontSize: 20, marginRight: 12 },
    infoText: { fontSize: 14, color: 'rgba(255, 255, 255, 0.7)' },
    trackingView: { alignItems: 'center', paddingTop: 20 },
    trackingEmoji: { fontSize: 60, marginBottom: 16 },
    trackingTitle: { fontSize: 20, color: 'rgba(255, 255, 255, 0.6)', marginBottom: 24 },
    timer: { fontSize: 56, fontWeight: '200', color: '#8b5cf6', marginBottom: 32, fontVariant: ['tabular-nums'] },
    motionContainer: { width: '100%', alignItems: 'center', marginBottom: 32 },
    motionLabel: { fontSize: 14, color: 'rgba(255, 255, 255, 0.5)', marginBottom: 8 },
    motionBar: { width: '80%', height: 12, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
    motionFill: { height: '100%', backgroundColor: '#8b5cf6', borderRadius: 6 },
    motionValue: { fontSize: 16, color: '#ffffff', fontWeight: '500' },
    statsRow: { flexDirection: 'row', gap: 20, marginBottom: 32 },
    statBox: { backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 12, padding: 16, alignItems: 'center', minWidth: 120, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    statValue: { fontSize: 24, fontWeight: '700', color: '#ffffff' },
    statLabel: { fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginTop: 4 },
    stopBtn: { backgroundColor: '#f97316', paddingHorizontal: 40, paddingVertical: 18, borderRadius: 16, marginBottom: 24 },
    stopBtnText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
    tip: { fontSize: 14, color: 'rgba(255, 255, 255, 0.4)', textAlign: 'center' },
    aiLabel: { fontSize: 12, color: '#8b5cf6', marginTop: 8 },
    historySection: { marginTop: 32 },
    historyTitle: { fontSize: 18, fontWeight: '600', color: '#ffffff', marginBottom: 16 },
    historyItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    historyLeft: { flex: 1 },
    historyDate: { fontSize: 14, fontWeight: '500', color: '#ffffff' },
    sleepScore: { fontSize: 12, color: '#8b5cf6' },
    historyCenter: { flex: 1, alignItems: 'center' },
    historyDuration: { fontSize: 16, fontWeight: '600', color: '#8b5cf6' },
    qualityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    qualityText: { color: '#ffffff', fontSize: 11, fontWeight: '600' },
    diagnosticsSection: { gap: 16 },
    diagCard: { backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)' },
    diagTitle: { fontSize: 16, fontWeight: '600', color: '#ffffff', marginBottom: 8 },
    diagText: { fontSize: 13, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 6 },
    diagSubtle: { fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginBottom: 8 },
    scheduleInputs: { gap: 10, marginTop: 10 },
    scheduleInput: { backgroundColor: 'rgba(2, 6, 23, 0.6)', borderRadius: 10, padding: 12, color: '#ffffff', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
    primaryBtn: { backgroundColor: '#06b6d4', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    primaryBtnText: { color: '#020617', fontWeight: '600' },
    secondaryBtn: { marginTop: 10, backgroundColor: 'rgba(6, 182, 212, 0.15)', borderWidth: 1, borderColor: '#06b6d4', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    secondaryBtnText: { color: '#06b6d4', fontWeight: '600' },
    toggleRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggleLabel: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 13 },
    // Alarm Styles
    alarmSetter: { width: '100%', marginBottom: 24, padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16 },
    alarmLabel: { color: '#ffffff', marginBottom: 12, fontWeight: '600' },
    timeButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    timeBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
    timeBtnActive: { backgroundColor: '#8b5cf6' },
    timeBtnText: { color: 'rgba(255,255,255,0.6)' },
    timeBtnTextActive: { color: '#ffffff', fontWeight: 'bold' },
    alarmConfirm: { color: '#8b5cf6', marginTop: 12, fontSize: 13 },
    alarmBadge: { backgroundColor: 'rgba(139, 92, 246, 0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: '#8b5cf6' },
    alarmText: { color: '#8b5cf6', fontWeight: '600' },
    alarmActiveBtn: { backgroundColor: '#ef4444' },
});

export default SleepTrackerScreen;
