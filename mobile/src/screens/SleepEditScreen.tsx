import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useLanguage } from '../contexts/LanguageContext';
import { getLocalDateKey, getLocalTime, buildLocalDateTimeFromKey } from '../utils/dateUtils';
import { getSleepDrafts, confirmSleepDraft, discardSleepDraft, updateSleepDraftTimes, upsertSleepDraftFromTimes } from '../services/sleepEventService';
import { type SleepDraft } from '../services/sleepDraftService';
import sleepHoursService from '../services/sleepHoursService';
import { sleepSessionService, type SleepSession } from '../services/sleepSessionService';
import { emit as emitPlanEvent } from '../services/planEventService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'SleepEdit'>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'SleepEdit'>;

type EditMode = 'list' | 'draft' | 'session';

const parseTimestampParam = (value?: string): number | null => {
    if (!value) return null;
    if (/^\d+$/.test(value.trim())) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatDateField = (timestamp: number): string => getLocalDateKey(new Date(timestamp));
const formatTimeField = (timestamp: number): string => getLocalTime(new Date(timestamp));

const SleepEditScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<ScreenRouteProp>();
    const { t } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<EditMode>('list');
    const [activeDateKey, setActiveDateKey] = useState<string>(route.params?.dateKey || getLocalDateKey(new Date()));
    const [drafts, setDrafts] = useState<SleepDraft[]>([]);
    const [sessions, setSessions] = useState<SleepSession[]>([]);
    const [selectedDraft, setSelectedDraft] = useState<SleepDraft | null>(null);
    const [selectedSession, setSelectedSession] = useState<SleepSession | null>(null);
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('');
    const [saving, setSaving] = useState(false);

    const shouldAutoClose = useMemo(() => {
        return Boolean(route.params?.draftId || route.params?.sessionId || route.params?.sleepStartTime || route.params?.wakeTime);
    }, [route.params?.draftId, route.params?.sessionId, route.params?.sleepStartTime, route.params?.wakeTime]);

    const applyFieldsFromTimes = useCallback((sleepStart: number, wakeTime?: number | null) => {
        setStartDate(formatDateField(sleepStart));
        setStartTime(formatTimeField(sleepStart));
        if (typeof wakeTime === 'number' && Number.isFinite(wakeTime)) {
            setEndDate(formatDateField(wakeTime));
            setEndTime(formatTimeField(wakeTime));
        } else {
            setEndDate('');
            setEndTime('');
        }
    }, []);

    const buildTimestamp = useCallback((dateValue: string, timeValue: string): number | null => {
        if (!dateValue || !timeValue) return null;
        const date = buildLocalDateTimeFromKey(dateValue.trim(), timeValue.trim());
        return date ? date.getTime() : null;
    }, []);

    const resolveStartTimestamp = useCallback(() => buildTimestamp(startDate, startTime), [buildTimestamp, startDate, startTime]);
    const resolveEndTimestamp = useCallback(() => buildTimestamp(endDate, endTime), [buildTimestamp, endDate, endTime]);

    const durationLabel = useMemo(() => {
        const startTs = resolveStartTimestamp();
        const endTs = resolveEndTimestamp();
        if (!startTs || !endTs) return null;
        const durationMs = endTs - startTs;
        if (durationMs <= 0) return null;
        const hours = Math.round((durationMs / (1000 * 60 * 60)) * 10) / 10;
        return t('progress_detail.sleep.hours', { hours: hours.toFixed(1) });
    }, [resolveStartTimestamp, resolveEndTimestamp, t]);

    const loadSessionsForDate = useCallback(async (dateKey: string) => {
        const record = await sleepSessionService.getSessionsForDate(dateKey);
        return record?.sessions || [];
    }, []);

    const refreshList = useCallback(async (dateKey: string) => {
        const [allDrafts, daySessions] = await Promise.all([
            getSleepDrafts(),
            loadSessionsForDate(dateKey),
        ]);
        const filteredDrafts = allDrafts.filter(draft => getLocalDateKey(new Date(draft.sleepStartTime)) === dateKey);
        setDrafts(filteredDrafts);
        setSessions(daySessions);
    }, [loadSessionsForDate]);

    const selectDraft = useCallback((draft: SleepDraft) => {
        setSelectedDraft(draft);
        setSelectedSession(null);
        setMode('draft');
        applyFieldsFromTimes(draft.sleepStartTime, draft.wakeTime);
    }, [applyFieldsFromTimes]);

    const selectSession = useCallback((session: SleepSession) => {
        setSelectedSession(session);
        setSelectedDraft(null);
        setMode('session');
        applyFieldsFromTimes(session.startTime, session.endTime);
    }, [applyFieldsFromTimes]);

    const loadInitialState = useCallback(async () => {
        setLoading(true);
        const dateKeyParam = route.params?.dateKey;
        const resolvedDateKey = dateKeyParam || getLocalDateKey(new Date());
        setActiveDateKey(resolvedDateKey);

        const draftId = route.params?.draftId;
        const sessionId = route.params?.sessionId;
        const sleepStartParam = parseTimestampParam(route.params?.sleepStartTime);
        const wakeParam = parseTimestampParam(route.params?.wakeTime);

        if (typeof sleepStartParam === 'number') {
            const draft = await upsertSleepDraftFromTimes({
                sleepStartTime: sleepStartParam,
                wakeTime: typeof wakeParam === 'number' ? wakeParam : undefined,
            });
            selectDraft(draft);
            setLoading(false);
            return;
        }

        if (draftId) {
            const allDrafts = await getSleepDrafts();
            const found = allDrafts.find(item => item.id === draftId);
            if (found) {
                selectDraft(found);
                setLoading(false);
                return;
            }
        }

        if (sessionId) {
            let foundSession: SleepSession | null = null;
            for (let i = 0; i < 30; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateKey = getLocalDateKey(date);
                const record = await sleepSessionService.getSessionsForDate(dateKey);
                const match = record?.sessions?.find(session => session.id === sessionId) || null;
                if (match) {
                    foundSession = match;
                    break;
                }
            }
            if (foundSession) {
                selectSession(foundSession);
                setLoading(false);
                return;
            }
        }

        setMode('list');
        await refreshList(resolvedDateKey);
        setLoading(false);
    }, [refreshList, route.params?.dateKey, route.params?.draftId, route.params?.sessionId, route.params?.sleepStartTime, route.params?.wakeTime, selectDraft, selectSession]);

    useEffect(() => {
        let isActive = true;
        const run = async () => {
            try {
                await loadInitialState();
            } finally {
                if (!isActive) return;
                setLoading(false);
            }
        };
        run();
        return () => {
            isActive = false;
        };
    }, [loadInitialState]);

    const adjustTimestamp = useCallback((target: 'start' | 'end', deltaMinutes: number) => {
        const currentStart = resolveStartTimestamp() ?? Date.now();
        const currentEnd = resolveEndTimestamp();
        const base = target === 'start'
            ? currentStart
            : (currentEnd ?? currentStart);
        const next = base + deltaMinutes * 60 * 1000;
        if (target === 'start') {
            setStartDate(formatDateField(next));
            setStartTime(formatTimeField(next));
        } else {
            setEndDate(formatDateField(next));
            setEndTime(formatTimeField(next));
        }
    }, [resolveStartTimestamp, resolveEndTimestamp]);

    const handleEndNow = useCallback(() => {
        const now = Date.now();
        setEndDate(formatDateField(now));
        setEndTime(formatTimeField(now));
    }, []);

    const validateDraftTimes = useCallback(() => {
        const startTs = resolveStartTimestamp();
        if (!startTs) {
            Alert.alert(t('alert.error'), t('validation.invalid_date'));
            return null;
        }
        const endTs = resolveEndTimestamp();
        if (endTs && endTs <= startTs) {
            Alert.alert(t('alert.error'), t('sleep_edit.invalid_range'));
            return null;
        }
        return { startTs, endTs };
    }, [resolveStartTimestamp, resolveEndTimestamp, t]);

    const validateSessionTimes = useCallback(() => {
        const startTs = resolveStartTimestamp();
        const endTs = resolveEndTimestamp();
        if (!startTs || !endTs) {
            Alert.alert(t('alert.error'), t('sleep_edit.end_required'));
            return null;
        }
        if (endTs <= startTs) {
            Alert.alert(t('alert.error'), t('sleep_edit.invalid_range'));
            return null;
        }
        return { startTs, endTs };
    }, [resolveStartTimestamp, resolveEndTimestamp, t]);

    const recomputeDates = useCallback(async (dateKeys: string[]) => {
        for (const dateKey of dateKeys) {
            if (!dateKey) continue;
            const hours = await sleepHoursService.recomputeForDate(dateKey);
            await emitPlanEvent('SLEEP_ANALYZED', { date: dateKey, hours });
        }
    }, []);

    const handleSaveDraft = useCallback(async () => {
        if (!selectedDraft) return;
        const validated = validateDraftTimes();
        if (!validated) return;
        setSaving(true);
        try {
            const updated = await updateSleepDraftTimes(selectedDraft.id, validated.startTs, validated.endTs ?? undefined);
            if (!updated) {
                Alert.alert(t('alert.error'), t('alert.failed'));
                return;
            }
            setSelectedDraft(updated);
            applyFieldsFromTimes(updated.sleepStartTime, updated.wakeTime);
            if (shouldAutoClose) {
                navigation.goBack();
            } else {
                await refreshList(activeDateKey);
            }
        } finally {
            setSaving(false);
        }
    }, [activeDateKey, applyFieldsFromTimes, navigation, refreshList, selectedDraft, shouldAutoClose, t, validateDraftTimes]);

    const handleConfirmDraft = useCallback(async () => {
        if (!selectedDraft) return;
        setSaving(true);
        try {
            const success = await confirmSleepDraft(selectedDraft.id);
            if (!success) {
                Alert.alert(t('alert.error'), t('alert.failed'));
                return;
            }
            if (shouldAutoClose) {
                navigation.goBack();
            } else {
                setMode('list');
                setSelectedDraft(null);
                await refreshList(activeDateKey);
            }
        } finally {
            setSaving(false);
        }
    }, [activeDateKey, navigation, refreshList, selectedDraft, shouldAutoClose, t]);

    const handleDiscardDraft = useCallback(async () => {
        if (!selectedDraft) return;
        setSaving(true);
        try {
            await discardSleepDraft(selectedDraft.id);
            if (shouldAutoClose) {
                navigation.goBack();
            } else {
                setMode('list');
                setSelectedDraft(null);
                await refreshList(activeDateKey);
            }
        } finally {
            setSaving(false);
        }
    }, [activeDateKey, navigation, refreshList, selectedDraft, shouldAutoClose]);

    const handleSaveSession = useCallback(async () => {
        if (!selectedSession) return;
        const validated = validateSessionTimes();
        if (!validated) return;
        setSaving(true);
        try {
            const result = await sleepSessionService.updateSessionTimes(
                selectedSession.id,
                validated.startTs,
                validated.endTs
            );
            if (!result.updated) {
                Alert.alert(t('alert.error'), t('alert.failed'));
                return;
            }
            const datesToRecompute = Array.from(new Set([result.previousDate, result.nextDate].filter(Boolean))) as string[];
            await recomputeDates(datesToRecompute);
            if (result.session) {
                setSelectedSession(result.session);
                applyFieldsFromTimes(result.session.startTime, result.session.endTime);
            }
            if (shouldAutoClose) {
                navigation.goBack();
            } else {
                await refreshList(activeDateKey);
            }
        } finally {
            setSaving(false);
        }
    }, [activeDateKey, applyFieldsFromTimes, navigation, recomputeDates, refreshList, selectedSession, shouldAutoClose, t, validateSessionTimes]);

    const handleDeleteSession = useCallback(async () => {
        if (!selectedSession) return;
        Alert.alert(
            t('sleep_edit.delete_action'),
            t('sleep_draft.discard_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('sleep_edit.delete_action'),
                    style: 'destructive',
                    onPress: async () => {
                        setSaving(true);
                        try {
                            const result = await sleepSessionService.removeSession(selectedSession.id);
                            if (result.removed && result.dateKey) {
                                await recomputeDates([result.dateKey]);
                            }
                            if (shouldAutoClose) {
                                navigation.goBack();
                            } else {
                                setMode('list');
                                setSelectedSession(null);
                                await refreshList(activeDateKey);
                            }
                        } finally {
                            setSaving(false);
                        }
                    },
                },
            ]
        );
    }, [activeDateKey, navigation, recomputeDates, refreshList, selectedSession, shouldAutoClose, t]);

    const renderList = () => (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('sleep_edit.pending_title')}</Text>
            {drafts.length === 0 ? (
                <Text style={styles.emptyText}>{t('progress_detail.sleep.empty')}</Text>
            ) : (
                drafts.map(draft => {
                    const endLabel = draft.wakeTime ? formatTimeField(draft.wakeTime) : t('sleep_draft.in_progress');
                    const range = `${formatTimeField(draft.sleepStartTime)} -> ${endLabel}`;
                    return (
                        <View key={draft.id} style={styles.entryRow}>
                            <View style={styles.entryMain}>
                                <Text style={styles.entryTitle}>{t(`sleep_draft.${draft.state}`)}</Text>
                                <Text style={styles.entrySubtitle}>{range}</Text>
                            </View>
                            <TouchableOpacity onPress={() => selectDraft(draft)}>
                                <Text style={styles.entryAction}>{t('sleep_draft.edit_action')}</Text>
                            </TouchableOpacity>
                        </View>
                    );
                })
            )}

            <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{t('sleep_edit.sessions_title')}</Text>
            {sessions.length === 0 ? (
                <Text style={styles.emptyText}>{t('progress_detail.sleep.empty')}</Text>
            ) : (
                sessions.map(session => {
                    const range = `${formatTimeField(session.startTime)} -> ${formatTimeField(session.endTime)}`;
                    return (
                        <View key={session.id} style={styles.entryRow}>
                            <View style={styles.entryMain}>
                                <Text style={styles.entryTitle}>{t('progress_detail.sleep.hours', { hours: session.durationHours.toFixed(1) })}</Text>
                                <Text style={styles.entrySubtitle}>{range}</Text>
                            </View>
                            <TouchableOpacity onPress={() => selectSession(session)}>
                                <Text style={styles.entryAction}>{t('sleep_draft.edit_action')}</Text>
                            </TouchableOpacity>
                        </View>
                    );
                })
            )}
        </View>
    );

    const renderEditor = () => (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('sleep_edit.subtitle')}</Text>
            <View style={styles.card}>
                <Text style={styles.fieldLabel}>{t('sleep_edit.start_label')}</Text>
                <View style={styles.fieldRow}>
                    <TextInput
                        style={styles.input}
                        placeholder={t('sleep_edit.date_placeholder')}
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={startDate}
                        onChangeText={setStartDate}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder={t('sleep_edit.time_placeholder')}
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={startTime}
                        onChangeText={setStartTime}
                    />
                </View>
                <View style={styles.adjustRow}>
                    <TouchableOpacity style={styles.adjustButton} onPress={() => adjustTimestamp('start', -15)}>
                        <Text style={styles.adjustText}>-15m</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.adjustButton} onPress={() => adjustTimestamp('start', 15)}>
                        <Text style={styles.adjustText}>+15m</Text>
                    </TouchableOpacity>
                </View>

                <Text style={[styles.fieldLabel, styles.fieldSpacing]}>{t('sleep_edit.end_label')}</Text>
                <View style={styles.fieldRow}>
                    <TextInput
                        style={styles.input}
                        placeholder={t('sleep_edit.date_placeholder')}
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={endDate}
                        onChangeText={setEndDate}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder={t('sleep_edit.time_placeholder')}
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={endTime}
                        onChangeText={setEndTime}
                    />
                </View>
                <View style={styles.adjustRow}>
                    <TouchableOpacity style={styles.adjustButton} onPress={() => adjustTimestamp('end', -15)}>
                        <Text style={styles.adjustText}>-15m</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.adjustButton} onPress={() => adjustTimestamp('end', 15)}>
                        <Text style={styles.adjustText}>+15m</Text>
                    </TouchableOpacity>
                    {mode === 'draft' && (
                        <TouchableOpacity style={styles.adjustButton} onPress={handleEndNow}>
                            <Text style={styles.adjustText}>{t('sleep_draft.end_now')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {durationLabel && (
                    <Text style={styles.durationText}>{t('sleep_edit.duration_label')}: {durationLabel}</Text>
                )}
            </View>

            <View style={styles.actionRow}>
                {mode === 'draft' && (
                    <>
                        <TouchableOpacity style={styles.primaryButton} onPress={handleSaveDraft} disabled={saving}>
                            <Text style={styles.primaryButtonText}>{t('save')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleConfirmDraft} disabled={saving}>
                            <Text style={styles.secondaryButtonText}>{t('sleep_draft.confirm_action')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ghostButton} onPress={handleDiscardDraft} disabled={saving}>
                            <Text style={styles.ghostButtonText}>{t('sleep_draft.discard_action')}</Text>
                        </TouchableOpacity>
                    </>
                )}
                {mode === 'session' && (
                    <>
                        <TouchableOpacity style={styles.primaryButton} onPress={handleSaveSession} disabled={saving}>
                            <Text style={styles.primaryButtonText}>{t('save')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ghostButton} onPress={handleDeleteSession} disabled={saving}>
                            <Text style={styles.ghostButtonText}>{t('sleep_edit.delete_action')}</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>{t('back')}</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('sleep_edit.title')}</Text>
                <View style={styles.headerSpacer} />
            </View>

            {loading ? (
                <View style={styles.loading}>
                    <ActivityIndicator color="#06b6d4" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.dateBadge}>{activeDateKey}</Text>
                    {mode === 'list' ? renderList() : renderEditor()}
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    backText: { color: '#06b6d4', fontWeight: '600' },
    headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
    headerSpacer: { width: 40 },
    content: { padding: 20, paddingBottom: 40 },
    dateBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: 'rgba(6,182,212,0.15)',
        color: '#06b6d4',
        fontWeight: '600',
        marginBottom: 16,
    },
    section: { gap: 12 },
    sectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
    sectionSpacing: { marginTop: 12 },
    emptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
    entryRow: {
        backgroundColor: 'rgba(15,23,42,0.7)',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    entryMain: { flex: 1, paddingRight: 12 },
    entryTitle: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
    entrySubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 },
    entryAction: { color: '#06b6d4', fontWeight: '600', fontSize: 13 },
    card: {
        backgroundColor: 'rgba(15,23,42,0.8)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    fieldLabel: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
    fieldSpacing: { marginTop: 16 },
    fieldRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
    input: {
        flex: 1,
        backgroundColor: 'rgba(2,6,23,0.6)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#ffffff',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    adjustRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
    adjustButton: {
        backgroundColor: 'rgba(6,182,212,0.15)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    adjustText: { color: '#06b6d4', fontWeight: '600', fontSize: 12 },
    durationText: { color: 'rgba(255,255,255,0.7)', marginTop: 12, fontSize: 13 },
    actionRow: { marginTop: 16, gap: 10 },
    primaryButton: {
        backgroundColor: '#06b6d4',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    primaryButtonText: { color: '#020617', fontWeight: '700' },
    secondaryButton: {
        backgroundColor: 'rgba(34,197,94,0.15)',
        borderWidth: 1,
        borderColor: '#22c55e',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    secondaryButtonText: { color: '#22c55e', fontWeight: '700' },
    ghostButton: {
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.4)',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    ghostButtonText: { color: '#f87171', fontWeight: '700' },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default SleepEditScreen;
