
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.log("This browser does not support desktop notification");
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
};

export const sendNotification = (title: string, body: string) => {
  if (Notification.permission === 'granted') {
    // Check if we are on mobile (Service Workers are usually required for real mobile push, 
    // but this works for PWA/Local context if app is open)
    try {
        const options = {
            body: body,
            icon: '/icon.png', // Fallback or placeholder
            vibrate: [200, 100, 200],
            badge: '/badge.png'
        };
        new Notification(title, options);
    } catch (e) {
        console.error("Notification failed", e);
    }
  }
};
