import type { AudioPlayer } from 'expo-audio';

const ALARM_SOUNDS = {
    gentle: require('../../assets/sounds/gentle_wake.wav'),
    energetic: require('../../assets/sounds/energetic_rise.wav'),
};

export const soundService = {
    sound: null as AudioPlayer | null,

    async playAlarm(type: 'gentle' | 'energetic' = 'gentle') {
        try {
            const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
            // Release potential previous sound
            if (this.sound) {
                this.sound.pause();
                this.sound.remove();
            }

            const source = ALARM_SOUNDS[type] || ALARM_SOUNDS.gentle;

            // === PHASE 5 FIX: Better audio focus handling for VoIP safety ===
            // - shouldPlayInBackground: false → release audio when app is backgrounded
            // - interruptionModeAndroid: duckOthers → reduce volume when other audio is playing (calls)
            // This prevents echo during VoIP calls by not keeping alarm audio active
            await setAudioModeAsync({
                playsInSilentMode: true,
                shouldPlayInBackground: false,
                interruptionModeAndroid: 'duckOthers',
                interruptionMode: 'duckOthers',
            });

            const player = createAudioPlayer(source, { updateInterval: 1000 });
            player.loop = true;
            player.volume = 0.1;
            player.play();

            this.sound = player;

            // Fade in volume
            let vol = 0.1;
            const fadeInterval = setInterval(() => {
                if (!this.sound) {
                    clearInterval(fadeInterval);
                    return;
                }
                vol = Math.min(1.0, vol + 0.1);
                this.sound.volume = vol;
                if (vol >= 1.0) clearInterval(fadeInterval);
            }, 3000); // Increase every 3s

        } catch (error) {
            console.error('Failed to play alarm:', error);
        }
    },

    async stopAlarm() {
        if (this.sound) {
            try {
                const { setAudioModeAsync } = await import('expo-audio');
                this.sound.pause();
                this.sound.remove();

                // Reset audio mode to release audio focus and let other apps resume normally
                await setAudioModeAsync({
                    playsInSilentMode: false,
                    shouldPlayInBackground: false,
                    interruptionModeAndroid: 'doNotMix',
                    interruptionMode: 'mixWithOthers',
                });
            } catch (error) {
                console.error('Error stopping alarm:', error);
            }
            this.sound = null;
        }
    }
};
