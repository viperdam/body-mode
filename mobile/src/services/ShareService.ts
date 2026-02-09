import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { analytics } from './analyticsService';
import i18n from '../i18n';

const APP_STORE_URL = 'https://bodymode.ai/download'; // Update with actual store links

export type ShareServiceAPI = {
    shareText: (message: string, url?: string) => Promise<void>;
    shareView: (viewRef: any) => Promise<void>;
    shareAppInvite: (userName?: string) => Promise<void>;
    shareAchievement: (achievementText: string) => Promise<void>;
};

/**
 * Share a text message with an optional URL.
 */
export const shareText: ShareServiceAPI['shareText'] = async (message, url) => {
    const payload = url ? `${message}\n${url}` : message;
    try {
        await Share.share({ message: payload });
    } catch (error) {
        console.warn('[ShareService] Failed to share text:', error);
    }
};

/**
 * Share a view snapshot as an image.
 */
export const shareView: ShareServiceAPI['shareView'] = async (viewRef) => {
    if (!viewRef) return;
    try {
        const uri = await captureRef(viewRef, {
            format: 'png',
            quality: 0.9,
        });
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri);
        } else {
            await Share.share({ url: uri });
        }
    } catch (error) {
        console.warn('[ShareService] Failed to share view:', error);
    }
};

/**
 * Share app invite link with personalized message.
 */
export const shareAppInvite: ShareServiceAPI['shareAppInvite'] = async (userName) => {
    const personalizedMessage = userName
        ? i18n.t('share.invite.with_name', { name: userName })
        : i18n.t('share.invite.generic');

    await shareText(
        `${personalizedMessage}

${i18n.t('share.invite.cta')}`,
        APP_STORE_URL
    );
};

/**
 * Share a specific achievement/milestone.
 */
export const shareAchievement: ShareServiceAPI['shareAchievement'] = async (achievementText) => {
    analytics.logEvent('share_achievement', { achievement: achievementText.substring(0, 50) });

    await shareText(
        i18n.t('share.achievement.message', { achievement: achievementText }),
        APP_STORE_URL
    );
};

export const ShareService: ShareServiceAPI = {
    shareText,
    shareView,
    shareAppInvite,
    shareAchievement,
};
