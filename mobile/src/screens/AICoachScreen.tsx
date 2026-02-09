// AI Coach Chat Screen with streaming responses
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    ScrollView, SafeAreaView, KeyboardAvoidingView, Platform,
    ActivityIndicator, Keyboard
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { FoodLogEntry, MoodLog, WeightLogEntry } from '../types';
import { createChatSession, isRateLimited, getRateLimitRemainingMs } from '../services/geminiService';
import { llmQueueService } from '../services/llmQueueService';
import { useLanguage } from '../contexts/LanguageContext';
import storage from '../services/storageService';
import * as Speech from 'expo-speech';
import { buildLLMContextSnapshot } from '../services/llmContextService';
import { analytics } from '../services/analyticsService';
import { useFeatureGate } from '../hooks/useFeatureGate';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'AICoach'>;

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

const AICoachScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { language, t } = useLanguage();
    const [chatSession, setChatSession] = useState<any>(null);
    const [chatMode, setChatMode] = useState<'personal' | 'general'>('personal');
    const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
    const [historySummary, setHistorySummary] = useState<string>('');
    const scrollViewRef = useRef<ScrollView>(null);
    const coachGate = useFeatureGate('ai_coach');

    useEffect(() => {
        initChatSession();
        loadChatHistory();
    }, []);

    const loadChatHistory = async () => {
        const history = await storage.get<Message[]>(storage.keys.CHAT_HISTORY);
        if (history && history.length > 0) {
            setMessages(history);
        } else {
            // Add welcome message if no history
            setMessages([{
                id: 'welcome',
                role: 'assistant',
                content: t('coach.welcome'),
                timestamp: Date.now(),
            }]);
        }
    };

    const saveChatHistory = async (newMessages: Message[]) => {
        await storage.set(storage.keys.CHAT_HISTORY, newMessages);

        // Check for infinite memory trigger
        if (newMessages.length > 20) {
            triggerSummarization(newMessages);
        }
    };

    const triggerSummarization = async (_currentMessages: Message[]) => {
        console.log('Triggering infinite memory summarization...');
        try {
            const foodLogs = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
            const moodLogs = await storage.get<MoodLog[]>(storage.keys.MOOD) || [];
            const weightLogs = await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT) || [];

            // Use queue for rate limit protection
            const newSummary = await llmQueueService.addJobAndWait<string>('SUMMARIZE_HISTORY', {
                existingSummary: historySummary,
                oldFoodLogs: foodLogs,
                oldMoodLogs: moodLogs,
                oldWeightLogs: weightLogs,
                language
            }, 'low');

            setHistorySummary(newSummary);
            await storage.set('history_summary', newSummary);
            console.log('Summary updated:', newSummary);
        } catch (e) {
            console.error('Summarization failed', e);
        }
    };

    const clearHistory = async () => {
        setMessages([]);
        await storage.remove(storage.keys.CHAT_HISTORY);
        analytics.logEvent('coach_history_cleared', {});
        // Reload welcome
        setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: t('coach.cleared_message'),
            timestamp: Date.now(),
        }]);
    };

    const initChatSession = async () => {
        try {
            const snapshot = await buildLLMContextSnapshot();
            if (snapshot.historySummary) setHistorySummary(snapshot.historySummary);

            if (snapshot.userProfile) {
                const session = createChatSession(
                    snapshot.userProfile,
                    snapshot.foodHistory,
                    snapshot.moodHistory,
                    snapshot.weightHistory,
                    snapshot.appContext,
                    snapshot.currentPlan,
                    chatMode,
                    language,
                    snapshot.historySummary || undefined
                );
                setChatSession(session);
            }
        } catch (error) {
            console.error('Failed to init chat session:', error);
        }
    };

    const sendMessage = async () => {
        if (!inputText.trim() || isLoading) return;

        if (!coachGate.checkOnly()) {
            coachGate.showPaywall();
            return;
        }

        // Check rate limit before sending (non-blocking warning)
        if (isRateLimited()) {
            const remainingMs = getRateLimitRemainingMs();
            const errorMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: t('coach.rate_limit', { seconds: Math.ceil(remainingMs / 1000) }),
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, errorMessage]);
            analytics.logEvent('coach_rate_limited', { mode: chatMode });
            return;
        }

        if (!coachGate.consume()) {
            coachGate.showPaywall();
            return;
        }

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputText.trim(),
            timestamp: Date.now(),
        };

        analytics.logEvent('coach_message_sent', { mode: chatMode });

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        saveChatHistory(newMessages);
        setInputText('');
        Keyboard.dismiss();
        setIsLoading(true);

        // Scroll to bottom
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);

        try {
            let responseText = '';

            if (chatSession) {
                // Use the chat session for streaming
                const response = await chatSession.sendMessage({ message: userMessage.content });
                responseText = response.text || t('coach.response_failed');
            } else {
                // Fallback to simple response if no session
                responseText = t('coach.profile_required');
            }

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: responseText,
                timestamp: Date.now(),
            };

            analytics.logEvent('coach_message_received', { mode: chatMode });

            const finalMessages = [...messages, userMessage, assistantMessage];
            setMessages(finalMessages);
            saveChatHistory(finalMessages);
            if (isSpeechEnabled) {
                Speech.speak(responseText, { pitch: 1.0, rate: 0.9 });
            }
        } catch (error) {
            console.error('Chat error:', error);
            analytics.logEvent('coach_message_failed', { mode: chatMode });
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: t('coach.error'),
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    };

    const handleQuickAction = (action: string) => {
        analytics.logEvent('coach_quick_action', { action });
        setInputText(action);
    };

    const quickActions = useMemo(() => ([
        t('coach.quick_actions.eat'),
        t('coach.quick_actions.sleep'),
        t('coach.quick_actions.workout'),
        t('coach.quick_actions.progress'),
    ]), [t, language]);

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel={t('accessibility.go_back')}
                    accessibilityRole="button"
                    style={styles.backBtnRow}
                >
                    <Ionicons name="chevron-back" size={20} color="#06b6d4" />
                    <Text style={styles.backBtnText}>{t('back')}</Text>
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} accessibilityRole="header">{t('coach.title')}</Text>
                    <TouchableOpacity
                        onPress={clearHistory}
                        accessibilityLabel={t('accessibility.clear_chat')}
                        accessibilityRole="button"
                    >
                        <Text style={styles.headerSubtitle}>{t('coach.clear_chat')}</Text>
                    </TouchableOpacity>
                </View>
                <TouchableOpacity
                    onPress={() => {
                        if (isSpeechEnabled) Speech.stop();
                        const nextValue = !isSpeechEnabled;
                        setIsSpeechEnabled(nextValue);
                        analytics.logEvent('coach_speech_toggle', { enabled: nextValue });
                    }}
                    style={{ padding: 8 }}
                    accessibilityLabel={isSpeechEnabled ? t('accessibility.speech_disable') : t('accessibility.speech_enable')}
                    accessibilityRole="button"
                >
                    <Ionicons
                        name={isSpeechEnabled ? 'volume-high' : 'volume-mute'}
                        size={20}
                        color="#ffffff"
                    />
                </TouchableOpacity>
                <View style={styles.modeToggle} accessibilityRole="radiogroup" accessibilityLabel={t('accessibility.chat_mode')}>
                    <TouchableOpacity
                        style={[styles.modeBtn, chatMode === 'personal' && styles.modeBtnActive]}
                        onPress={() => {
                            setChatMode('personal');
                            initChatSession();
                            analytics.logEvent('coach_mode_changed', { mode: 'personal' });
                        }}
                        accessibilityLabel={t('accessibility.personal_mode')}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: chatMode === 'personal' }}
                    >
                        <Text style={[styles.modeBtnText, chatMode === 'personal' && styles.modeBtnTextActive]}>{t('coach.mode.personal')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeBtn, chatMode === 'general' && styles.modeBtnActive]}
                        onPress={() => {
                            setChatMode('general');
                            initChatSession();
                            analytics.logEvent('coach_mode_changed', { mode: 'general' });
                        }}
                        accessibilityLabel={t('accessibility.general_mode')}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: chatMode === 'general' }}
                    >
                        <Text style={[styles.modeBtnText, chatMode === 'general' && styles.modeBtnTextActive]}>{t('coach.mode.general')}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.disclaimerBanner}>
                <Text style={styles.disclaimerText}>{t('legal.ai_disclaimer_short')}</Text>
            </View>

            <KeyboardAvoidingView
                style={styles.chatContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            >
                {/* Messages */}
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {messages.map((message) => (
                        <MessageBubble key={message.id} message={message} />
                    ))}

                    {isLoading && (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color="#06b6d4" />
                            <Text style={styles.loadingText}>{t('coach.thinking')}</Text>
                        </View>
                    )}
                </ScrollView>

                {/* Quick Actions */}
                {messages.length <= 1 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.quickActions}
                        contentContainerStyle={styles.quickActionsContent}
                    >
                        {quickActions.map((action, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={styles.quickActionBtn}
                                onPress={() => handleQuickAction(action)}
                                accessibilityLabel={t('accessibility.quick_action', { action })}
                                accessibilityRole="button"
                            >
                                <Text style={styles.quickActionText}>{action}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                {/* Input */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder={t('coach.placeholder')}
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        maxLength={1000}
                        returnKeyType="send"
                        onSubmitEditing={sendMessage}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
                        onPress={sendMessage}
                        disabled={!inputText.trim() || isLoading}
                        accessibilityLabel={t('accessibility.send_message')}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !inputText.trim() || isLoading }}
                    >
                        <Ionicons name="arrow-up" size={22} color="#020617" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView >
    );
};

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
    const { language } = useLanguage();
    const isUser = message.role === 'user';

    return (
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
            {!isUser && <Ionicons name="sparkles" size={20} color="#06b6d4" style={styles.botAvatar} />}
            <View style={[styles.messageContent, isUser ? styles.userContent : styles.assistantContent]}>
                <Text style={[styles.messageText, isUser && styles.userText]}>
                    {message.content}
                </Text>
                <Text style={styles.messageTime}>
                    {new Date(message.timestamp).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        </View>
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    backBtnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    backBtnText: {
        color: '#06b6d4',
        fontSize: 16,
    },
    headerCenter: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ffffff',
    },
    headerSubtitle: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    disclaimerBanner: {
        backgroundColor: 'rgba(148, 163, 184, 0.12)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(148, 163, 184, 0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    disclaimerText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.75)',
        textAlign: 'center',
    },
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        padding: 2,
    },
    modeBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
    },
    modeBtnActive: {
        backgroundColor: '#06b6d4',
    },
    modeBtnText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    modeBtnTextActive: {
        color: '#020617',
        fontWeight: '600',
    },
    chatContainer: {
        flex: 1,
    },
    messagesList: {
        flex: 1,
    },
    messagesContent: {
        padding: 16,
        paddingBottom: 20,
    },
    messageBubble: {
        flexDirection: 'row',
        marginBottom: 16,
        alignItems: 'flex-start',
    },
    userBubble: {
        justifyContent: 'flex-end',
    },
    assistantBubble: {
        justifyContent: 'flex-start',
    },
    botAvatar: {
        marginRight: 8,
        marginTop: 4,
    },
    messageContent: {
        maxWidth: '80%',
        borderRadius: 16,
        padding: 14,
    },
    userContent: {
        backgroundColor: '#06b6d4',
        borderBottomRightRadius: 4,
        marginLeft: 'auto',
    },
    assistantContent: {
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    messageText: {
        fontSize: 15,
        color: '#ffffff',
        lineHeight: 22,
    },
    userText: {
        color: '#020617',
    },
    messageTime: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.4)',
        marginTop: 6,
        textAlign: 'right',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
    },
    loadingText: {
        color: 'rgba(255, 255, 255, 0.5)',
        marginLeft: 8,
        fontSize: 14,
    },
    quickActions: {
        maxHeight: 50,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    quickActionsContent: {
        padding: 10,
        gap: 8,
        flexDirection: 'row',
    },
    quickActionBtn: {
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#06b6d4',
        marginRight: 8,
    },
    quickActionText: {
        color: '#06b6d4',
        fontSize: 13,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        paddingBottom: 24,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 12,
        fontSize: 16,
        color: '#ffffff',
        maxHeight: 100,
        marginRight: 10,
    },
    sendBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#06b6d4',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendBtnDisabled: {
        opacity: 0.5,
    },
    sendBtnText: {
        fontSize: 22,
        color: '#020617',
        fontWeight: '700',
    },
});

export default AICoachScreen;
