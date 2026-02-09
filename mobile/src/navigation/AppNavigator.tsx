// Navigation setup for BioSync AI React Native app
import React from 'react';
import { NavigationContainer, type LinkingOptions, type NavigatorScreenParams, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as QuickActions from 'expo-quick-actions';
import { QuickActionsService } from '../services/quickActionsService';
import * as Linking from 'expo-linking';
import { Platform, NativeModules } from 'react-native';
import type { MealRecipe, Recipe } from '../types';

// Screens
import {
    WelcomeScreen,
    OnboardingScreen,
    FoodAnalyzerScreen,
    SleepTrackerScreen,
    SleepEditScreen,
    SmartFridgeScreen,
    RecipeScreen,
    PaywallScreen,
    AuthScreen,
    PermissionDisclosureScreen,
    BioDetailScreen,
    HealthConnectDiagnosticsScreen,
    ContextDiagnosticsScreen,
    AgeVerificationScreen,
    BodyProgressScreen,
    BodyScanCameraScreen,
    BodyProgressReportScreen,
} from '../screens';
import PermissionsScreen from '../screens/PermissionsScreen';
import ActionScreen from '../screens/ActionScreen';
import BackgroundHealthScreen from '../screens/BackgroundHealthScreen';
import { OfflineBanner } from '../components';
import { analytics } from '../services/analyticsService';

// Tab Navigator
import TabNavigator, { type TabParamList } from './TabNavigator';

export type RootStackParamList = {
    AgeVerification: undefined;
    Welcome: undefined;
    Permissions: undefined;
    PermissionDisclosure: { type: 'foreground' | 'background' };
    Onboarding: undefined;
    MainTabs: NavigatorScreenParams<TabParamList> | undefined; // Bottom Tabs
    FoodAnalyzer: {
        replacePlanItemId?: string;
        replacePlanDateKey?: string;
        sourceMealTitle?: string;
    } | undefined;
    SleepTracker: { autoStop?: boolean } | undefined;
    SleepEdit: {
        draftId?: string;
        sessionId?: string;
        sleepStartTime?: string;
        wakeTime?: string;
        dateKey?: string;
    } | undefined;
    SmartFridge: undefined;
    Recipe: { kind: 'meal'; recipe: MealRecipe; sourceTitle?: string; planDateKey?: string; planItemId?: string }
    | { kind: 'fridge'; recipe: Recipe };
    Dashboard: undefined;
    Profile: undefined;
    AICoach: undefined;
    Settings: undefined;
    Auth: { source?: 'settings' | 'welcome'; action?: 'reauth_delete' } | undefined;
    Paywall: { source?: string } | undefined;
    BackgroundHealth: undefined;
    BioDetail: undefined;
    HealthConnectDiagnostics: undefined;
    ContextDiagnostics: undefined;
    BodyProgress: undefined;
    BodyScanCamera: undefined;
    BodyProgressReport: { scanId: string };
    Action: {
        id?: string;
        type?: string;
        planDate?: string;
        planItemId?: string;
        initialMode?: 'main' | 'weight_check' | 'unplanned_fork' | 'log_water_input' | 'log_activity_input' | 'log_food_select' | 'log_food_text';
    } | undefined;
};



const linking: LinkingOptions<RootStackParamList> = {
    prefixes: [Linking.createURL('/'), 'bodymode://'],
    config: {
        screens: {
            MainTabs: {
                screens: {
                    DashboardTab: 'dashboard',
                    ProfileTab: 'profile',
                    CoachTab: 'coach',
                    SettingsTab: 'settings',
                }
            },
            FoodAnalyzer: 'food',
            SleepTracker: 'sleep',
            SleepEdit: {
                path: 'sleep-edit',
                parse: {
                    draftId: (draftId: string) => draftId,
                    sessionId: (sessionId: string) => sessionId,
                    sleepStartTime: (sleepStartTime: string) => sleepStartTime,
                    wakeTime: (wakeTime: string) => wakeTime,
                    dateKey: (dateKey: string) => dateKey,
                },
            },
            SmartFridge: 'fridge',
            Recipe: 'recipe',
            Paywall: 'paywall',
            Auth: 'auth',
            BioDetail: 'bio',
            ContextDiagnostics: 'context-diagnostics',
            BodyProgress: 'body-progress',
            Action: {
                path: 'action',
                parse: {
                    id: (id: string) => id,
                    type: (type: string) => type,
                    planDate: (planDate: string) => planDate,
                    planItemId: (planItemId: string) => planItemId,
                    initialMode: (initialMode: string) => initialMode,
                },
            },
        },
    },
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
    initialRoute: 'Welcome' | 'MainTabs' | 'AgeVerification';
}

// Services
import * as Notifications from 'expo-notifications';
import { sleepService } from '../services/sleepService';
import { snoozeHydrationReminder, snoozeWrapUpReminder } from '../services/notificationService';
import { confirmSleepDraft, discardSleepDraft } from '../services/sleepEventService';
import storage from '../services/storageService';
import { DailyPlan, PlanItem } from '../types';
import { scheduleOverlay } from '../services/overlayService';
import {
    completeItemWithSync,
    skipItemWithSync,
    snoozeItemWithSync,
    cancelRelatedOverlay,
    storeFailedAction,
} from '../services/actionSyncService';

// Helper functions for handling plan item actions from notification buttons
// Now use actionSyncService for safe modifications with mutex and cross-channel sync
async function handlePlanItemComplete(planDate: string, planItemId: string): Promise<void> {
    try {
        // Also cancel overlay since user acted on notification
        await cancelRelatedOverlay(planItemId);

        const success = await completeItemWithSync(planDate, planItemId);
        if (success) {
            console.log(`[AppNavigator] Plan item ${planItemId} marked complete via notification`);
        }
    } catch (error) {
        console.error('[AppNavigator] Failed to complete plan item:', error);
        // Store for recovery
        await storeFailedAction({ planDate, planItemId, actionType: 'complete' });
    }
}

async function handlePlanItemSnooze(planDate: string, planItemId: string, minutes: number): Promise<void> {
    try {
        // Also cancel overlay since user acted on notification
        await cancelRelatedOverlay(planItemId);

        const success = await snoozeItemWithSync(planDate, planItemId, minutes);
        if (success) {
            // === PHASE 4 FIX: Trigger reconcile instead of direct overlay scheduling ===
            // This makes ReconcileWorker the single owner of AlarmManager state
            if (Platform.OS === 'android') {
                const { ReconcileBridge } = NativeModules;
                ReconcileBridge?.triggerReconcile?.();
            }
            console.log(`[AppNavigator] Plan item ${planItemId} snoozed ${minutes} min via notification, reconcile triggered`);
        }
    } catch (error) {
        console.error('[AppNavigator] Failed to snooze plan item:', error);
        await storeFailedAction({ planDate, planItemId, actionType: 'snooze' });
    }
}

async function handlePlanItemSkip(planDate: string, planItemId: string): Promise<void> {
    try {
        // Also cancel overlay since user acted on notification
        await cancelRelatedOverlay(planItemId);

        const success = await skipItemWithSync(planDate, planItemId);
        if (success) {
            console.log(`[AppNavigator] Plan item ${planItemId} skipped via notification`);
        }
    } catch (error) {
        console.error('[AppNavigator] Failed to skip plan item:', error);
        await storeFailedAction({ planDate, planItemId, actionType: 'skip' });
    }
}

const AppNavigator: React.FC<AppNavigatorProps> = ({ initialRoute }) => {
    const navigation = React.useRef<any>(null);
    const routeNameRef = React.useRef<string | null>(null);

    const buildNotificationResponseId = React.useCallback(
        (response: Notifications.NotificationResponse): string => {
            const requestId = response.notification.request.identifier || 'unknown';
            const actionId = response.actionIdentifier || Notifications.DEFAULT_ACTION_IDENTIFIER;
            return `${requestId}:${actionId}`;
        },
        []
    );

    const handleNotificationResponse = React.useCallback(
        async (response: Notifications.NotificationResponse) => {
            const actionId = response.actionIdentifier;
            const content = response.notification.request.content;
            const data = content.data as any;
            const categoryIdentifier = content.categoryIdentifier || data?.categoryIdentifier;

            console.log(`[Notification] Action: ${actionId}, Data:`, data);

            // Handle Sleep Probe
            if (actionId === 'YES_SLEEP' || (data.type === 'SLEEP_PROBE' && actionId === Notifications.DEFAULT_ACTION_IDENTIFIER)) {
                await sleepService.acceptSleepProbe();
                navigation.current?.navigate('SleepTracker');
                return;
            }

            if (actionId === 'NO_SLEEP') {
                await sleepService.declineSleepProbe();
                return;
            }

            // Handle Wake Confirmation
            if (actionId === 'YES_AWAKE' || (data.type === 'WAKE_CONFIRMATION' && actionId === Notifications.DEFAULT_ACTION_IDENTIFIER)) {
                await sleepService.confirmGhostWakeup();
                navigation.current?.navigate('SleepTracker', { autoStop: true });
                return;
            }

            if (actionId === 'DIDNT_SLEEP') {
                await sleepService.markDidntSleep();
                return;
            }

            if (actionId === 'NO_SNOOZE') {
                await sleepService.snoozeWakeConfirmation();
                return;
            }

            if (categoryIdentifier === 'SLEEP_REVIEW' || data?.type === 'SLEEP_REVIEW') {
                const draftId = data?.draftId;
                if (actionId === 'CONFIRM_SLEEP' && draftId) {
                    await confirmSleepDraft(draftId);
                    return;
                }

                if (actionId === 'DISCARD_SLEEP' && draftId) {
                    await discardSleepDraft(draftId);
                    return;
                }

                if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
                    navigation.current?.navigate('MainTabs', { screen: 'DashboardTab' });
                    return;
                }
            }

            // Hydration / Wrap-up actions
            if (actionId === 'LOG_WATER') {
                navigation.current?.navigate('MainTabs', { screen: 'DashboardTab', params: { action: 'log_water' } });
                return;
            }

            if (actionId === 'START_WRAP_UP') {
                navigation.current?.navigate('MainTabs', { screen: 'DashboardTab', params: { action: 'start_wrap_up' } });
                return;
            }

            // Snooze actions for notification categories
            if (actionId === 'SNOOZE') {
                if (categoryIdentifier === 'HYDRATION_REMINDER') {
                    await snoozeHydrationReminder(15, { planDate: data?.planDate, planItemId: data?.planItemId });
                    return;
                }
                if (categoryIdentifier === 'WRAP_UP_REMINDER') {
                    await snoozeWrapUpReminder(30);
                    return;
                }
                return;
            }

            // ============ PLAN_ITEM_REMINDER action buttons ============
            // These handle iOS notification action buttons

            // DONE - mark plan item complete
            if (actionId === 'DONE' && data?.planDate && data?.planItemId) {
                await handlePlanItemComplete(data.planDate, data.planItemId);
                return;
            }

            // SNOOZE_15 - snooze plan item 15 minutes
            if (actionId === 'SNOOZE_15' && data?.planDate && data?.planItemId) {
                await handlePlanItemSnooze(data.planDate, data.planItemId, 15);
                return;
            }

            // SKIP - skip plan item
            if (actionId === 'SKIP' && data?.planDate && data?.planItemId) {
                await handlePlanItemSkip(data.planDate, data.planItemId);
                return;
            }

            // MORE_OPTIONS - open ActionScreen for complex actions
            if (actionId === 'MORE_OPTIONS') {
                navigation.current?.navigate('Action', {
                    id: data?.planItemId,
                    type: data?.itemType || data?.type,
                    planDate: data?.planDate,
                    planItemId: data?.planItemId,
                });
                return;
            }

            // Default tap behavior (notification body)
            if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
                if (categoryIdentifier === 'WRAP_UP_REMINDER') {
                    navigation.current?.navigate('MainTabs', { screen: 'DashboardTab', params: { action: 'start_wrap_up' } });
                    return;
                }
                if (categoryIdentifier === 'HYDRATION_REMINDER') {
                    navigation.current?.navigate('MainTabs', { screen: 'DashboardTab' });
                    return;
                }
                if (data?.type === 'PLAN_ITEM') {
                    navigation.current?.navigate('MainTabs', { screen: 'DashboardTab' });
                    return;
                }
            }
        },
        []
    );

    React.useEffect(() => {
        let isMounted = true;

        const handleIfUnseen = async (response: Notifications.NotificationResponse) => {
            const responseId = buildNotificationResponseId(response);
            const lastHandled = await storage.get<string>(storage.keys.LAST_NOTIFICATION_RESPONSE_ID);
            if (responseId && responseId === lastHandled) {
                return;
            }
            await handleNotificationResponse(response);
            await storage.set(storage.keys.LAST_NOTIFICATION_RESPONSE_ID, responseId);
        };

        const syncLastResponse = async () => {
            try {
                const lastResponse = await Notifications.getLastNotificationResponseAsync();
                if (!isMounted || !lastResponse) return;
                await handleIfUnseen(lastResponse);
            } catch (error) {
                console.warn('[Notification] Failed to read last response:', error);
            }
        };

        syncLastResponse();

        const subscription = Notifications.addNotificationResponseReceivedListener(async response => {
            await handleIfUnseen(response);
        });

        return () => {
            isMounted = false;
            subscription.remove();
        };
    }, [buildNotificationResponseId, handleNotificationResponse]);

    // Quick Actions Handling
    React.useEffect(() => {
        try {
            QuickActionsService.init();
        } catch (e) {
            console.warn('QuickActions init failed', e);
        }

        const subscription = QuickActions.addListener((action) => {
            if (action.id === 'scan_food') {
                navigation.current?.navigate('FoodAnalyzer');
            } else if (action.id === 'log_water') {
                navigation.current?.navigate('MainTabs', { screen: 'DashboardTab', params: { action: 'log_water' } });
            }
        });

        return () => subscription.remove();
    }, []);

    return (
        <NavigationContainer
            linking={linking}
            ref={navigation}
            onReady={() => {
                const current = navigation.current?.getCurrentRoute?.();
                if (current?.name) {
                    routeNameRef.current = current.name;
                    analytics.logScreenView(current.name);
                }
            }}
            onStateChange={() => {
                const current = navigation.current?.getCurrentRoute?.();
                const currentName = current?.name;
                if (currentName && routeNameRef.current !== currentName) {
                    routeNameRef.current = currentName;
                    analytics.logScreenView(currentName);
                }
            }}
        >
            <OfflineBanner />
            <StatusBar style="light" />
            <Stack.Navigator
                initialRouteName={initialRoute}
                screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: '#020617' },
                }}
            >
                {/* Onboarding Flow */}
                <Stack.Screen name="AgeVerification" component={AgeVerificationScreen} />
                <Stack.Screen name="Welcome" component={WelcomeScreen} />
                <Stack.Screen name="Permissions" component={PermissionsScreen} />
                <Stack.Screen
                    name="PermissionDisclosure"
                    component={PermissionDisclosureScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen name="Onboarding" component={OnboardingScreen} />

                {/* Main App with Bottom Tabs */}
                <Stack.Screen
                    name="MainTabs"
                    component={TabNavigator}
                    options={{
                        gestureEnabled: false, // Prevent swipe back from main app
                    }}
                />
                <Stack.Screen name="BioDetail" component={BioDetailScreen} />
                <Stack.Screen name="HealthConnectDiagnostics" component={HealthConnectDiagnosticsScreen} />
                <Stack.Screen name="ContextDiagnostics" component={ContextDiagnosticsScreen} />
                <Stack.Screen name="BodyProgress" component={BodyProgressScreen} />
                <Stack.Screen
                    name="BodyScanCamera"
                    component={BodyScanCameraScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen name="BodyProgressReport" component={BodyProgressReportScreen} />

                {/* Modal/Feature Screens */}
                <Stack.Screen
                    name="FoodAnalyzer"
                    component={FoodAnalyzerScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="SleepTracker"
                    component={SleepTrackerScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="SleepEdit"
                    component={SleepEditScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="SmartFridge"
                    component={SmartFridgeScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="Recipe"
                    component={RecipeScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="Paywall"
                    component={PaywallScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="Auth"
                    component={AuthScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="Action"
                    component={ActionScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="BackgroundHealth"
                    component={BackgroundHealthScreen}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default AppNavigator;
