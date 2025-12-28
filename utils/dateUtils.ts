
// Returns YYYY-MM-DD in the USER'S local timezone.
// This prevents the AI from generating plans for "UTC Today" which might be "Local Yesterday".
export const getLocalDateKey = (date: Date = new Date()): string => {
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().split('T')[0];
};

export const getLocalTime = (date: Date = new Date()): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};
