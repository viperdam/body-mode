// Bottom Tab Navigation for main app screens
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import AICoachScreen from '../screens/AICoachScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';

export type TabParamList = {
    DashboardTab: { action?: 'log_water' | 'start_wrap_up' } | undefined;
    CoachTab: undefined;
    ProfileTab: undefined;
    SettingsTab: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const TabNavigator: React.FC = () => {
    const insets = useSafeAreaInsets();
    const { t } = useLanguage();
    const bottomPad = Platform.OS === 'ios' ? Math.max(insets.bottom, 16) + 12 : Math.max(insets.bottom, 12) + 8;
    const barHeight = Platform.OS === 'ios' ? 80 + insets.bottom : 68 + insets.bottom * 0.6;

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#0f172a',
                    borderTopColor: 'rgba(255, 255, 255, 0.1)',
                    borderTopWidth: 1,
                    height: barHeight,
                    paddingBottom: bottomPad,
                    paddingTop: 10,
                    elevation: 0,
                    shadowOpacity: 0,
                },
                tabBarActiveTintColor: '#06b6d4',
                tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '600',
                    marginTop: -5,
                },
                tabBarIconStyle: {
                    marginTop: 5,
                },
            }}
        >
            <Tab.Screen
                name="DashboardTab"
                component={DashboardScreen}
                options={{
                    tabBarLabel: t('nav.home'),
                    tabBarAccessibilityLabel: t('nav.home'),
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="home" size={size} color={color} />
                    ),
                }}
            />
            <Tab.Screen
                name="CoachTab"
                component={AICoachScreen}
                options={{
                    tabBarLabel: t('nav.coach'),
                    tabBarAccessibilityLabel: t('nav.coach'),
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="chatbubbles" size={size} color={color} />
                    ),
                }}
            />
            <Tab.Screen
                name="ProfileTab"
                component={ProfileScreen}
                options={{
                    tabBarLabel: t('nav.profile'),
                    tabBarAccessibilityLabel: t('nav.profile'),
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="person" size={size} color={color} />
                    ),
                }}
            />
            <Tab.Screen
                name="SettingsTab"
                component={SettingsScreen}
                options={{
                    tabBarLabel: t('nav.settings'),
                    tabBarAccessibilityLabel: t('nav.settings'),
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="settings" size={size} color={color} />
                    ),
                }}
            />
        </Tab.Navigator>
    );
};

export default TabNavigator;
