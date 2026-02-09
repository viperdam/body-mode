import * as QuickActions from 'expo-quick-actions';
import { Platform } from 'react-native';
import i18n from '../i18n';

const buildQuickActionItems = () => [
    {
        id: 'scan_food',
        title: i18n.t('quick_actions.scan_food.title'),
        subtitle: i18n.t('quick_actions.scan_food.subtitle'),
        icon: 'compose', // systematic icon name (iOS) or drawable (Android)
        params: { href: '/food' },
    },
    {
        id: 'log_water',
        title: i18n.t('quick_actions.log_water.title'),
        subtitle: i18n.t('quick_actions.log_water.subtitle', { amount: 250, unit: i18n.t('units.ml') }),
        icon: 'add',
        params: { href: '/water-log' }, // We'll handle this path/action in listener
    },
];

export const QuickActionsService = {
    /**
     * Initialize Quick Actions
     * Should be called in App.tsx
     */
    init: () => {
        if (Platform.OS === 'web') return;

        try {
            QuickActions.setItems(buildQuickActionItems());
        } catch (error) {
            console.warn('[QuickActions] Failed to set items', error);
        }
    },

    /**
     * Refresh localized labels after language changes.
     */
    refreshLocalizedItems: () => {
        if (Platform.OS === 'web') return;
        try {
            QuickActions.setItems(buildQuickActionItems());
        } catch (error) {
            console.warn('[QuickActions] Failed to refresh localized items', error);
        }
    },

    /**
     * Handle the action when app is opened via shortcut
     */
    useQuickActionListener: (callback: (action: QuickActions.Action) => void) => {
        // Use the hook provided by the library or manual listener
        // The library provides `useQuickAction` hook but let's see typically:
        // We can just check initial and listen.
        // For simplicity in the service we can expose a setup function or just a hook usage guide.
    }
};
