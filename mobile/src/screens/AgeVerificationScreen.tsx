/**
 * Age Verification Screen - COPPA Compliance
 * Must be shown before any data collection
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { verifyAge, saveAgeVerification, AgeVerificationResult } from '../services/ageVerificationService';
import storage from '../services/storageService';
import { UserProfile } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

type Step = 'birthdate' | 'parental' | 'blocked';

export const AgeVerificationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t, language } = useLanguage();
  const [step, setStep] = useState<Step>('birthdate');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [parentalEmail, setParentalEmail] = useState('');
  const [verificationResult, setVerificationResult] = useState<AgeVerificationResult | null>(null);

  const parsedBirthDate = useMemo(() => {
    const year = Number(birthYear);
    const month = Number(birthMonth);
    const day = Number(birthDay);
    if (!year || !month || !day) {
      return { date: null, error: null };
    }
    if (year < 1900 || year > new Date().getFullYear()) {
      return { date: null, error: t('age_verification.errors.invalid_year') };
    }
    if (month < 1 || month > 12) {
      return { date: null, error: t('age_verification.errors.invalid_month') };
    }
    if (day < 1 || day > 31) {
      return { date: null, error: t('age_verification.errors.invalid_day') };
    }
    const candidate = new Date(year, month - 1, day);
    if (
      candidate.getFullYear() !== year ||
      candidate.getMonth() !== month - 1 ||
      candidate.getDate() !== day
    ) {
      return { date: null, error: t('age_verification.errors.invalid_date') };
    }
    if (candidate > new Date()) {
      return { date: null, error: t('age_verification.errors.future_date') };
    }
    return { date: candidate, error: null };
  }, [birthYear, birthMonth, birthDay, t]);

  const handleVerify = () => {
    if (!parsedBirthDate.date) {
      Alert.alert(
        t('age_verification.alert.required_title'),
        parsedBirthDate.error || t('age_verification.errors.birthdate_required')
      );
      return;
    }
    const selectedDate = parsedBirthDate.date;
    setBirthDate(selectedDate);

    const result = verifyAge(selectedDate);
    setVerificationResult(result);

    if (!result.allowed) {
      setStep('blocked');
      return;
    }

    if (result.requiresParentalConsent) {
      setStep('parental');
      return;
    }

    // Adult - proceed directly
    completeVerification(result.age);
  };

  const handleParentalSubmit = () => {
    if (!parentalEmail.trim() || !parentalEmail.includes('@')) {
      Alert.alert(
        t('age_verification.alert.invalid_email_title'),
        t('age_verification.alert.invalid_email_body')
      );
      return;
    }

    if (!verificationResult) return;

    completeVerification(verificationResult.age, parentalEmail.trim());
  };

  const completeVerification = async (age: number, email?: string) => {
    const effectiveDate = birthDate ?? parsedBirthDate.date;
    if (!effectiveDate) return;

    await saveAgeVerification(effectiveDate, age, email);

    if (email) {
      Alert.alert(
        t('age_verification.alert.consent_title'),
        t('age_verification.alert.consent_body', { email }),
        [{ text: t('age_verification.alert.consent_button'), onPress: () => navigateToApp() }]
      );
    } else {
      navigateToApp();
    }
  };

  const navigateToApp = async () => {
    let nextRoute: 'Welcome' | 'MainTabs' = 'Welcome';
    try {
      const savedUser = await storage.get<UserProfile>(storage.keys.USER);
      if (savedUser?.name) {
        nextRoute = 'MainTabs';
      }
    } catch (error) {
      console.warn('[AgeVerification] Failed to load user profile:', error);
    }
    navigation.reset({
      index: 0,
      routes: [{ name: nextRoute }],
    });
  };

  // BLOCKED SCREEN - Under 13
  if (step === 'blocked') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.emoji}>🚫</Text>
          <Text style={styles.title}>{t('age_verification.blocked.title')}</Text>
          <Text style={styles.description}>{t('age_verification.blocked.body')}</Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setStep('birthdate');
              setBirthDate(null);
            }}
          >
            <Text style={styles.secondaryButtonText}>{t('age_verification.blocked.button')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // PARENTAL CONSENT SCREEN - 13-17
  if (step === 'parental') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.emoji}>👨‍👩‍👧</Text>
          <Text style={styles.title}>{t('age_verification.parental.title')}</Text>
          <Text style={styles.description}>{t('age_verification.parental.body')}</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{t('age_verification.parental.email_label')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('age_verification.parental.email_placeholder')}
              placeholderTextColor="#666"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={parentalEmail}
              onChangeText={setParentalEmail}
            />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleParentalSubmit}>
            <Text style={styles.primaryButtonText}>{t('age_verification.parental.button')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep('birthdate')}
          >
            <Text style={styles.secondaryButtonText}>{t('age_verification.parental.back')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // BIRTHDATE SCREEN - Initial
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.emoji}>🎂</Text>
        <Text style={styles.title}>{t('age_verification.title')}</Text>
        <Text style={styles.description}>{t('age_verification.description')}</Text>

        <View style={styles.dateContainer}>
          <Text style={styles.inputLabel}>{t('age_verification.birthdate_label')}</Text>
          <View style={styles.dateInputRow}>
            <TextInput
              style={[styles.input, styles.dateInput]}
              placeholder={t('age_verification.birthdate_placeholder_month')}
              placeholderTextColor="#666"
              keyboardType="number-pad"
              value={birthMonth}
              maxLength={2}
              onChangeText={setBirthMonth}
            />
            <TextInput
              style={[styles.input, styles.dateInput]}
              placeholder={t('age_verification.birthdate_placeholder_day')}
              placeholderTextColor="#666"
              keyboardType="number-pad"
              value={birthDay}
              maxLength={2}
              onChangeText={setBirthDay}
            />
            <TextInput
              style={[styles.input, styles.dateInputWide]}
              placeholder={t('age_verification.birthdate_placeholder_year')}
              placeholderTextColor="#666"
              keyboardType="number-pad"
              value={birthYear}
              maxLength={4}
              onChangeText={setBirthYear}
            />
          </View>
          {parsedBirthDate.date && (
            <Text style={styles.selectedDate}>
              {t('age_verification.birthdate_selected', {
                date: parsedBirthDate.date.toLocaleDateString(language, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
              })}
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleVerify}>
          <Text style={styles.primaryButtonText}>{t('age_verification.verify_button')}</Text>
        </TouchableOpacity>

        <Text style={styles.legalText}>{t('age_verification.legal_note')}</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  emoji: {
    fontSize: 64,
    textAlign: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  dateContainer: {
    marginBottom: 24,
  },
  dateInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  selectedDate: {
    fontSize: 14,
    color: '#6366f1',
    textAlign: 'center',
    marginTop: 12,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#333',
  },
  dateInput: {
    flex: 1,
    textAlign: 'center',
  },
  dateInputWide: {
    flex: 1.5,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryButton: {
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#6366f1',
  },
  legalText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
  },
});

export default AgeVerificationScreen;
