import { getLocales } from 'expo-localization';
import type { Language } from '../types';
import { formatNumber } from './numberFormat';

type UnitSystem = 'metric' | 'imperial';

const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

const detectRegion = (locale?: string): string | undefined => {
    if (locale) {
        const parts = locale.replace('_', '-').split('-');
        if (parts.length > 1) return parts[1].toUpperCase();
    }
    return getLocales()[0]?.regionCode?.toUpperCase();
};

export const getUnitSystem = (locale?: Language | string): UnitSystem => {
    const region = detectRegion(locale);
    return region && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
};

export const formatDistanceMeters = (meters?: number | null, locale?: Language | string): string => {
    if (meters === undefined || meters === null || Number.isNaN(meters)) return '—';
    const system = getUnitSystem(locale);
    if (system === 'imperial') {
        const miles = meters / 1609.344;
        return `${formatNumber(miles, locale || 'en', { maximumFractionDigits: 2 })} mi`;
    }
    if (meters >= 1000) {
        const km = meters / 1000;
        return `${formatNumber(km, locale || 'en', { maximumFractionDigits: 2 })} km`;
    }
    return `${formatNumber(meters, locale || 'en', { maximumFractionDigits: 0 })} m`;
};

export const formatWeightKg = (kg?: number | null, locale?: Language | string): string => {
    if (kg === undefined || kg === null || Number.isNaN(kg)) return '—';
    const system = getUnitSystem(locale);
    if (system === 'imperial') {
        const lb = kg * 2.20462;
        return `${formatNumber(lb, locale || 'en', { maximumFractionDigits: 1 })} lb`;
    }
    return `${formatNumber(kg, locale || 'en', { maximumFractionDigits: 1 })} kg`;
};

export const formatTemperatureC = (celsius?: number | null, locale?: Language | string): string => {
    if (celsius === undefined || celsius === null || Number.isNaN(celsius)) return '—';
    const system = getUnitSystem(locale);
    if (system === 'imperial') {
        const fahrenheit = (celsius * 9) / 5 + 32;
        return `${formatNumber(fahrenheit, locale || 'en', { maximumFractionDigits: 1 })}°F`;
    }
    return `${formatNumber(celsius, locale || 'en', { maximumFractionDigits: 1 })}°C`;
};

export const formatHydrationMl = (ml?: number | null, locale?: Language | string): string => {
    if (ml === undefined || ml === null || Number.isNaN(ml)) return '—';
    const system = getUnitSystem(locale);
    if (system === 'imperial') {
        const flOz = ml / 29.5735;
        return `${formatNumber(flOz, locale || 'en', { maximumFractionDigits: 1 })} fl oz`;
    }
    if (ml >= 1000) {
        const liters = ml / 1000;
        return `${formatNumber(liters, locale || 'en', { maximumFractionDigits: 2 })} L`;
    }
    return `${formatNumber(ml, locale || 'en', { maximumFractionDigits: 0 })} ml`;
};

export const formatBloodGlucoseMgDl = (mgDl?: number | null, locale?: Language | string): string => {
    if (mgDl === undefined || mgDl === null || Number.isNaN(mgDl)) return '—';
    const system = getUnitSystem(locale);
    if (system === 'imperial') {
        return `${formatNumber(mgDl, locale || 'en', { maximumFractionDigits: 0 })} mg/dL`;
    }
    const mmolL = mgDl / 18;
    return `${formatNumber(mmolL, locale || 'en', { maximumFractionDigits: 1 })} mmol/L`;
};
