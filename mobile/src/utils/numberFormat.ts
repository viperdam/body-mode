import type { Language } from '../types';

export const formatNumber = (
    value: number,
    locale: Language | string = 'en',
    options?: Intl.NumberFormatOptions
): string => {
    if (!Number.isFinite(value)) return String(value);
    try {
        return new Intl.NumberFormat(locale, options).format(value);
    } catch {
        return String(value);
    }
};
