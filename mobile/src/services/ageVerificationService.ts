/**
 * Age Verification Service - COPPA Compliance
 * Required for Google Play Store health apps
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const KEYS = {
  VERIFIED: 'age:verified',
  BIRTH_DATE: 'age:birthDate',
  AGE: 'age:value',
  PARENTAL_EMAIL: 'age:parentalEmail',
  CONSENT_DATE: 'age:consentDate',
};

export const AGE_VERIFICATION_EVENT = 'ageVerificationUpdated';

const emitAgeVerificationUpdated = () => {
  try {
    DeviceEventEmitter.emit(AGE_VERIFICATION_EVENT);
  } catch {
    // no-op
  }
};

export interface AgeVerificationResult {
  allowed: boolean;
  requiresParentalConsent: boolean;
  age: number;
}

export interface AgeStatus {
  verified: boolean;
  age: number | null;
  hasParentalConsent: boolean;
}

/**
 * Calculate age and determine access level
 */
export const verifyAge = (birthDate: Date): AgeVerificationResult => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return {
    allowed: age >= 13,
    requiresParentalConsent: age >= 13 && age < 18,
    age,
  };
};

/**
 * Save verified age to storage
 */
export const saveAgeVerification = async (
  birthDate: Date,
  age: number,
  parentalEmail?: string
): Promise<void> => {
  const pairs: [string, string][] = [
    [KEYS.VERIFIED, 'true'],
    [KEYS.BIRTH_DATE, birthDate.toISOString()],
    [KEYS.AGE, String(age)],
  ];

  if (parentalEmail) {
    pairs.push([KEYS.PARENTAL_EMAIL, parentalEmail]);
    pairs.push([KEYS.CONSENT_DATE, new Date().toISOString()]);
  }

  await AsyncStorage.multiSet(pairs);
  emitAgeVerificationUpdated();
};

/**
 * Check if user has completed age verification
 */
export const getAgeStatus = async (): Promise<AgeStatus> => {
  try {
    const results = await AsyncStorage.multiGet([
      KEYS.VERIFIED,
      KEYS.AGE,
      KEYS.PARENTAL_EMAIL,
    ]);

    const verified = results[0][1] === 'true';
    const age = results[1][1] ? parseInt(results[1][1], 10) : null;
    const hasParentalConsent = !!results[2][1];

    return { verified, age, hasParentalConsent };
  } catch {
    return { verified: false, age: null, hasParentalConsent: false };
  }
};

/**
 * Clear age verification (for logout/reset)
 */
export const clearAgeVerification = async (): Promise<void> => {
  await AsyncStorage.multiRemove(Object.values(KEYS));
  emitAgeVerificationUpdated();
};
