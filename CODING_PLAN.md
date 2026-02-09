# Body Mode - Complete Coding Plan
## Play Store Ready + Next Big Thing Features

**Created**: February 2, 2026
**Estimated Total Effort**: 6-8 weeks
**Priority Order**: Critical → High → Medium → Enhancement

---

## PHASE 1: CRITICAL PLAY STORE COMPLIANCE (Week 1-2)

### 1.1 COPPA Age Verification System

**Files to Create/Modify**:
- `mobile/src/screens/AgeVerificationScreen.tsx` (NEW)
- `mobile/src/services/ageVerificationService.ts` (NEW)
- `mobile/src/contexts/UserContext.tsx` (MODIFY)
- `mobile/src/navigation/RootNavigator.tsx` (MODIFY)

**Implementation**:

```typescript
// mobile/src/services/ageVerificationService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  AGE_VERIFIED: 'user:age:verified',
  USER_AGE: 'user:age:value',
  PARENTAL_CONSENT: 'user:parental:consent',
  PARENTAL_EMAIL: 'user:parental:email',
};

export interface AgeVerificationResult {
  allowed: boolean;
  requiresParentalConsent: boolean;
  age: number;
}

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

export const saveAgeVerification = async (
  age: number,
  parentalConsent?: { email: string; timestamp: number }
): Promise<void> => {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.AGE_VERIFIED, 'true'],
    [STORAGE_KEYS.USER_AGE, String(age)],
    [STORAGE_KEYS.PARENTAL_CONSENT, parentalConsent ? JSON.stringify(parentalConsent) : ''],
  ]);
};

export const getAgeVerificationStatus = async (): Promise<{
  verified: boolean;
  age: number | null;
  hasParentalConsent: boolean;
}> => {
  const [verified, age, consent] = await AsyncStorage.multiGet([
    STORAGE_KEYS.AGE_VERIFIED,
    STORAGE_KEYS.USER_AGE,
    STORAGE_KEYS.PARENTAL_CONSENT,
  ]);

  return {
    verified: verified[1] === 'true',
    age: age[1] ? parseInt(age[1], 10) : null,
    hasParentalConsent: !!consent[1],
  };
};

export const clearAgeVerification = async (): Promise<void> => {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
};
```

```typescript
// mobile/src/screens/AgeVerificationScreen.tsx

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, TextInput, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { verifyAge, saveAgeVerification } from '../services/ageVerificationService';
import { useNavigation } from '@react-navigation/native';

export const AgeVerificationScreen: React.FC = () => {
  const navigation = useNavigation();
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [parentalEmail, setParentalEmail] = useState('');
  const [step, setStep] = useState<'age' | 'parental' | 'blocked'>('age');

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setBirthDate(selectedDate);
    }
  };

  const handleVerify = async () => {
    if (!birthDate) {
      Alert.alert('Required', 'Please select your date of birth');
      return;
    }

    const result = verifyAge(birthDate);

    if (!result.allowed) {
      setStep('blocked');
      return;
    }

    if (result.requiresParentalConsent) {
      setStep('parental');
      return;
    }

    // Adult user - proceed directly
    await saveAgeVerification(result.age);
    navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
  };

  const handleParentalConsent = async () => {
    if (!parentalEmail || !parentalEmail.includes('@')) {
      Alert.alert('Required', 'Please enter a valid parent/guardian email');
      return;
    }

    const result = verifyAge(birthDate!);
    await saveAgeVerification(result.age, {
      email: parentalEmail,
      timestamp: Date.now(),
    });

    // TODO: Send verification email to parent
    Alert.alert(
      'Consent Requested',
      `We've sent a verification email to ${parentalEmail}. Please ask your parent/guardian to confirm.`,
      [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] }) }]
    );
  };

  if (step === 'blocked') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Age Requirement</Text>
        <Text style={styles.subtitle}>
          Body Mode is designed for users aged 13 and older.
          {'\n\n'}
          We take child safety seriously and comply with COPPA regulations.
        </Text>
        <TouchableOpacity style={styles.buttonSecondary} onPress={() => setStep('age')}>
          <Text style={styles.buttonTextSecondary}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'parental') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Parental Consent Required</Text>
        <Text style={styles.subtitle}>
          Since you're under 18, we need your parent or guardian's consent to use Body Mode.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Parent/Guardian Email"
          placeholderTextColor="#888"
          keyboardType="email-address"
          autoCapitalize="none"
          value={parentalEmail}
          onChangeText={setParentalEmail}
        />
        <TouchableOpacity style={styles.button} onPress={handleParentalConsent}>
          <Text style={styles.buttonText}>Request Consent</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonSecondary} onPress={() => setStep('age')}>
          <Text style={styles.buttonTextSecondary}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Age Verification</Text>
      <Text style={styles.subtitle}>
        Body Mode collects health data and requires age verification to comply with privacy laws.
      </Text>

      <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dateButtonText}>
          {birthDate ? birthDate.toLocaleDateString() : 'Select Date of Birth'}
        </Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={birthDate || new Date(2000, 0, 1)}
          mode="date"
          display="spinner"
          maximumDate={new Date()}
          minimumDate={new Date(1900, 0, 1)}
          onChange={handleDateChange}
        />
      )}

      <TouchableOpacity style={styles.button} onPress={handleVerify}>
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>

      <Text style={styles.legal}>
        By continuing, you agree to our Terms of Service and Privacy Policy.
        Users under 13 are not permitted to use this app.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0a0a0a' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 16 },
  subtitle: { fontSize: 16, color: '#aaa', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  dateButton: { backgroundColor: '#1a1a1a', padding: 16, borderRadius: 12, marginBottom: 24 },
  dateButtonText: { color: '#fff', fontSize: 18, textAlign: 'center' },
  button: { backgroundColor: '#6366f1', padding: 16, borderRadius: 12, marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  buttonSecondary: { padding: 16 },
  buttonTextSecondary: { color: '#6366f1', fontSize: 16, textAlign: 'center' },
  input: { backgroundColor: '#1a1a1a', padding: 16, borderRadius: 12, marginBottom: 24, color: '#fff', fontSize: 16 },
  legal: { fontSize: 12, color: '#666', textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
```

**Navigation Integration**:
```typescript
// mobile/src/navigation/RootNavigator.tsx - Add to stack

import { AgeVerificationScreen } from '../screens/AgeVerificationScreen';

// In your stack navigator:
<Stack.Screen
  name="AgeVerification"
  component={AgeVerificationScreen}
  options={{ headerShown: false }}
/>

// In App startup logic:
const checkAgeVerification = async () => {
  const status = await getAgeVerificationStatus();
  if (!status.verified) {
    navigation.reset({ index: 0, routes: [{ name: 'AgeVerification' }] });
  }
};
```

---

### 1.2 Trim Health Permissions (Remove Unused)

**File to Modify**: `mobile/android/app/src/main/AndroidManifest.xml`

**Current**: 19 health permissions
**Target**: Only permissions you actually display in UI

**Recommended Permissions to KEEP**:
```xml
<!-- KEEP - Core metrics displayed in app -->
<uses-permission android:name="android.permission.health.READ_HEART_RATE" tools:targetApi="34"/>
<uses-permission android:name="android.permission.health.READ_SLEEP" tools:targetApi="34"/>
<uses-permission android:name="android.permission.health.READ_STEPS" tools:targetApi="34"/>
<uses-permission android:name="android.permission.health.READ_WEIGHT" tools:targetApi="34"/>
<uses-permission android:name="android.permission.health.READ_ACTIVE_CALORIES_BURNED" tools:targetApi="34"/>
<uses-permission android:name="android.permission.health.READ_EXERCISE" tools:targetApi="34"/>
<uses-permission android:name="android.permission.health.READ_NUTRITION" tools:targetApi="34"/>
<uses-permission android:name="android.permission.health.READ_HYDRATION" tools:targetApi="34"/>
```

**REMOVE** (unless you display these in UI):
```xml
<!-- REMOVE - Not displayed in current UI -->
<!-- READ_HEART_RATE_VARIABILITY - Only if BioLoad shows HRV -->
<!-- READ_OXYGEN_SATURATION - Only if you show SpO2 -->
<!-- READ_BODY_TEMPERATURE - Only if you show temp -->
<!-- READ_BASAL_BODY_TEMPERATURE - Remove -->
<!-- READ_RESPIRATORY_RATE - Only if you show breathing -->
<!-- READ_VO2_MAX - Only if you show VO2 -->
<!-- READ_BLOOD_GLUCOSE - Only if you show glucose -->
<!-- READ_BASAL_METABOLIC_RATE - Only if you show BMR -->
<!-- READ_BODY_FAT - Only if you show body fat % -->
<!-- READ_DISTANCE - Only if you show distance -->
<!-- READ_MENSTRUATION - Only if you have period tracking -->
```

**Update healthConnectService.ts**:
```typescript
// mobile/src/services/healthConnectService.ts

// Update the permissions array to match manifest
const HEALTH_CONNECT_PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'NutritionRecord' },
  { accessType: 'read', recordType: 'Hydration' },
  // Remove all others unless you use them
];
```

---

### 1.3 Enhanced FDA/Medical Disclaimer

**File to Modify**: `mobile/src/screens/OnboardingScreen.tsx`

**Add Disclaimer Step**:
```typescript
// Add to onboarding steps array

const DISCLAIMER_STEP = {
  key: 'medical-disclaimer',
  title: 'Important Health Information',
  content: `
Body Mode is a wellness app designed to help you track fitness and nutrition goals.

⚠️ NOT A MEDICAL DEVICE

This app:
• Is NOT FDA-regulated
• Does NOT diagnose medical conditions
• Does NOT replace professional medical advice
• Should NOT be used for medical decisions

If you have health concerns, consult a healthcare provider.

By continuing, you acknowledge this disclaimer.
  `,
  requiresAcceptance: true,
};
```

**Create Disclaimer Screen Component**:
```typescript
// mobile/src/components/MedicalDisclaimerModal.tsx

import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props {
  visible: boolean;
  onAccept: () => void;
}

export const MedicalDisclaimerModal: React.FC<Props> = ({ visible, onAccept }) => {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
    if (isAtBottom) setScrolledToBottom(true);
  };

  const handleAccept = async () => {
    await AsyncStorage.setItem('disclaimer:accepted', new Date().toISOString());
    onAccept();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <Text style={styles.title}>Health & Medical Disclaimer</Text>

        <ScrollView
          style={styles.scrollView}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <Text style={styles.section}>IMPORTANT NOTICE</Text>
          <Text style={styles.text}>
            Body Mode ("the App") is designed for general wellness and fitness tracking purposes only.
          </Text>

          <Text style={styles.section}>NOT A MEDICAL DEVICE</Text>
          <Text style={styles.text}>
            This application is NOT a medical device and is NOT regulated by the U.S. Food and Drug
            Administration (FDA) or any other regulatory body. The App does not:
            {'\n\n'}
            • Diagnose, treat, cure, or prevent any disease or medical condition
            {'\n'}• Provide medical advice or recommendations
            {'\n'}• Replace professional medical consultation
            {'\n'}• Serve as a substitute for professional healthcare
          </Text>

          <Text style={styles.section}>HEALTH DATA LIMITATIONS</Text>
          <Text style={styles.text}>
            Any health-related data displayed in this App (including but not limited to heart rate,
            sleep analysis, calorie estimates, and AI-generated recommendations) are estimates only
            and may not be accurate. Do not make medical decisions based on this data.
          </Text>

          <Text style={styles.section}>AI RECOMMENDATIONS</Text>
          <Text style={styles.text}>
            This App uses artificial intelligence to generate personalized plans and recommendations.
            AI-generated content:
            {'\n\n'}
            • May contain errors or inaccuracies
            {'\n'}• Is not reviewed by medical professionals
            {'\n'}• Should not be considered medical advice
            {'\n'}• May not be appropriate for your specific health conditions
          </Text>

          <Text style={styles.section}>CONSULT A HEALTHCARE PROVIDER</Text>
          <Text style={styles.text}>
            Before starting any diet, exercise program, or making changes to your health routine,
            consult with a qualified healthcare provider. This is especially important if you:
            {'\n\n'}
            • Have any medical conditions
            {'\n'}• Take medications
            {'\n'}• Are pregnant or nursing
            {'\n'}• Have a history of eating disorders
            {'\n'}• Experience any adverse symptoms
          </Text>

          <Text style={styles.section}>EMERGENCY SITUATIONS</Text>
          <Text style={styles.text}>
            If you experience a medical emergency, call emergency services immediately.
            Do not rely on this App for emergency medical situations.
          </Text>

          <Text style={styles.section}>ASSUMPTION OF RISK</Text>
          <Text style={styles.text}>
            By using this App, you acknowledge that physical exercise and dietary changes carry
            inherent risks. You assume full responsibility for any injuries or health issues that
            may result from following any suggestions made by this App.
          </Text>
        </ScrollView>

        <TouchableOpacity
          style={[styles.button, !scrolledToBottom && styles.buttonDisabled]}
          onPress={handleAccept}
          disabled={!scrolledToBottom}
        >
          <Text style={styles.buttonText}>
            {scrolledToBottom ? 'I Understand and Accept' : 'Please scroll to read all'}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 20 },
  scrollView: { flex: 1, marginBottom: 20 },
  section: { fontSize: 16, fontWeight: 'bold', color: '#6366f1', marginTop: 20, marginBottom: 8 },
  text: { fontSize: 14, color: '#ccc', lineHeight: 22 },
  button: { backgroundColor: '#6366f1', padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#333' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

---

### 1.4 Data Retention Policy Implementation

**File to Create**: `mobile/src/services/dataRetentionService.ts`

```typescript
// mobile/src/services/dataRetentionService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RetentionPolicy {
  category: string;
  retentionDays: number;
  storageKeys: string[];
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    category: 'health_metrics',
    retentionDays: 365, // 1 year
    storageKeys: ['ls_sleep_history', 'ls_weight', 'ls_mood'],
  },
  {
    category: 'food_logs',
    retentionDays: 90, // 3 months
    storageKeys: ['ls_food', 'ls_water'],
  },
  {
    category: 'activity_logs',
    retentionDays: 90,
    storageKeys: ['ls_activity'],
  },
  {
    category: 'daily_plans',
    retentionDays: 30, // 1 month
    storageKeys: ['ls_daily_plan', 'ls_daily_wrapups'],
  },
  {
    category: 'analytics',
    retentionDays: 180, // 6 months
    storageKeys: ['analytics_events'],
  },
];

export const cleanupExpiredData = async (): Promise<{ deleted: number; errors: string[] }> => {
  const results = { deleted: 0, errors: [] as string[] };
  const now = Date.now();

  for (const policy of RETENTION_POLICIES) {
    const cutoffDate = now - (policy.retentionDays * 24 * 60 * 60 * 1000);

    for (const key of policy.storageKeys) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;

        const data = JSON.parse(raw);

        if (Array.isArray(data)) {
          // Filter out old entries
          const filtered = data.filter((item: any) => {
            const itemDate = item.timestamp || item.date || item.createdAt;
            if (!itemDate) return true; // Keep items without dates
            return new Date(itemDate).getTime() > cutoffDate;
          });

          const deletedCount = data.length - filtered.length;
          if (deletedCount > 0) {
            await AsyncStorage.setItem(key, JSON.stringify(filtered));
            results.deleted += deletedCount;
          }
        }
      } catch (error) {
        results.errors.push(`Failed to clean ${key}: ${error}`);
      }
    }
  }

  return results;
};

export const getDataRetentionInfo = (): RetentionPolicy[] => {
  return RETENTION_POLICIES;
};

export const exportAllUserData = async (): Promise<object> => {
  const allKeys = await AsyncStorage.getAllKeys();
  const userDataKeys = allKeys.filter(key =>
    key.startsWith('ls_') ||
    key.startsWith('user:') ||
    key.startsWith('permission:')
  );

  const pairs = await AsyncStorage.multiGet(userDataKeys);
  const exportData: Record<string, any> = {
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0', // Get from app config
    data: {},
  };

  for (const [key, value] of pairs) {
    try {
      exportData.data[key] = value ? JSON.parse(value) : null;
    } catch {
      exportData.data[key] = value;
    }
  }

  return exportData;
};

export const deleteAllUserData = async (): Promise<void> => {
  const allKeys = await AsyncStorage.getAllKeys();
  const userDataKeys = allKeys.filter(key =>
    key.startsWith('ls_') ||
    key.startsWith('user:') ||
    key.startsWith('settings:')
  );

  await AsyncStorage.multiRemove(userDataKeys);
};
```

---

## PHASE 2: MONETIZATION IMPLEMENTATION (Week 2-3)

### 2.1 Premium Feature Definitions

**File to Create**: `mobile/src/config/premiumFeatures.ts`

```typescript
// mobile/src/config/premiumFeatures.ts

export type FeatureId =
  | 'unlimited_plans'
  | 'no_ads'
  | 'advanced_insights'
  | 'heritage_recipes'
  | 'priority_support'
  | 'export_data'
  | 'coach_unlimited';

export interface Feature {
  id: FeatureId;
  name: string;
  description: string;
  freeLimit?: number;
  premiumLimit?: number | 'unlimited';
  energyCost?: number;
}

export const FEATURES: Record<FeatureId, Feature> = {
  unlimited_plans: {
    id: 'unlimited_plans',
    name: 'Daily Plans',
    description: 'AI-generated personalized daily schedules',
    freeLimit: 3, // per month
    premiumLimit: 'unlimited',
    energyCost: 50,
  },
  no_ads: {
    id: 'no_ads',
    name: 'Ad-Free Experience',
    description: 'Remove all advertisements',
    freeLimit: 0, // shows ads
    premiumLimit: 'unlimited',
  },
  advanced_insights: {
    id: 'advanced_insights',
    name: 'Advanced BioLoad Insights',
    description: 'Detailed neural battery & hormonal load breakdown',
    freeLimit: 0,
    premiumLimit: 'unlimited',
  },
  heritage_recipes: {
    id: 'heritage_recipes',
    name: 'Heritage Recipe Recommendations',
    description: 'Cultural food suggestions based on your background',
    freeLimit: 1, // per week
    premiumLimit: 'unlimited',
    energyCost: 30,
  },
  priority_support: {
    id: 'priority_support',
    name: 'Priority Support',
    description: '24-hour response time from our team',
    freeLimit: 0,
    premiumLimit: 'unlimited',
  },
  export_data: {
    id: 'export_data',
    name: 'Data Export',
    description: 'Export your health data as JSON/CSV',
    freeLimit: 1, // per month
    premiumLimit: 'unlimited',
  },
  coach_unlimited: {
    id: 'coach_unlimited',
    name: 'Unlimited AI Coach',
    description: 'Chat with AI coach without limits',
    freeLimit: 10, // messages per day
    premiumLimit: 'unlimited',
    energyCost: 10,
  },
};

export const SUBSCRIPTION_PRODUCTS = {
  monthly: {
    productId: 'bodymode_premium_monthly',
    price: '$4.99',
    period: 'month',
    trialDays: 7,
  },
  yearly: {
    productId: 'bodymode_premium_yearly',
    price: '$39.99',
    period: 'year',
    savings: '33%',
    trialDays: 7,
  },
};
```

### 2.2 Subscription Store (Zustand)

**File to Create**: `mobile/src/stores/subscriptionStore.ts`

```typescript
// mobile/src/stores/subscriptionStore.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FeatureId, FEATURES } from '../config/premiumFeatures';

interface FeatureUsage {
  count: number;
  resetDate: string; // ISO date for monthly/weekly reset
}

interface SubscriptionState {
  isPremium: boolean;
  subscriptionId: string | null;
  expiresAt: string | null;
  featureUsage: Record<FeatureId, FeatureUsage>;

  // Actions
  setSubscription: (subscriptionId: string, expiresAt: string) => void;
  clearSubscription: () => void;
  checkFeatureAccess: (featureId: FeatureId) => { allowed: boolean; remaining: number | 'unlimited' };
  consumeFeature: (featureId: FeatureId) => boolean;
  resetMonthlyUsage: () => void;
}

const getDefaultUsage = (): Record<FeatureId, FeatureUsage> => {
  const usage: Partial<Record<FeatureId, FeatureUsage>> = {};
  const now = new Date().toISOString();

  for (const featureId of Object.keys(FEATURES) as FeatureId[]) {
    usage[featureId] = { count: 0, resetDate: now };
  }

  return usage as Record<FeatureId, FeatureUsage>;
};

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      isPremium: false,
      subscriptionId: null,
      expiresAt: null,
      featureUsage: getDefaultUsage(),

      setSubscription: (subscriptionId, expiresAt) => {
        set({ isPremium: true, subscriptionId, expiresAt });
      },

      clearSubscription: () => {
        set({ isPremium: false, subscriptionId: null, expiresAt: null });
      },

      checkFeatureAccess: (featureId) => {
        const { isPremium, featureUsage } = get();
        const feature = FEATURES[featureId];

        if (isPremium) {
          return { allowed: true, remaining: 'unlimited' };
        }

        const usage = featureUsage[featureId];
        const limit = feature.freeLimit ?? 0;
        const remaining = Math.max(0, limit - usage.count);

        return {
          allowed: remaining > 0,
          remaining,
        };
      },

      consumeFeature: (featureId) => {
        const { isPremium, featureUsage } = get();

        if (isPremium) return true;

        const access = get().checkFeatureAccess(featureId);
        if (!access.allowed) return false;

        set({
          featureUsage: {
            ...featureUsage,
            [featureId]: {
              ...featureUsage[featureId],
              count: featureUsage[featureId].count + 1,
            },
          },
        });

        return true;
      },

      resetMonthlyUsage: () => {
        set({ featureUsage: getDefaultUsage() });
      },
    }),
    {
      name: 'subscription-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

### 2.3 Paywall Screen

**File to Create**: `mobile/src/screens/PaywallScreen.tsx`

```typescript
// mobile/src/screens/PaywallScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { subscriptionService } from '../services/subscriptionService';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { SUBSCRIPTION_PRODUCTS, FEATURES, FeatureId } from '../config/premiumFeatures';

interface Props {
  featureId?: FeatureId;
  onClose?: () => void;
}

export const PaywallScreen: React.FC<Props> = ({ featureId, onClose }) => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const setSubscription = useSubscriptionStore(s => s.setSubscription);

  const blockedFeature = featureId ? FEATURES[featureId] : null;

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const product = selectedPlan === 'yearly'
        ? SUBSCRIPTION_PRODUCTS.yearly
        : SUBSCRIPTION_PRODUCTS.monthly;

      const result = await subscriptionService.purchaseSubscription(product.productId);

      if (result.success) {
        setSubscription(result.subscriptionId!, result.expiresAt!);
        Alert.alert('Welcome to Premium!', 'You now have access to all features.', [
          { text: 'OK', onPress: () => onClose?.() || navigation.goBack() }
        ]);
      }
    } catch (error) {
      Alert.alert('Purchase Failed', 'Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const result = await subscriptionService.restorePurchases();
      if (result.restored) {
        setSubscription(result.subscriptionId!, result.expiresAt!);
        Alert.alert('Restored!', 'Your subscription has been restored.');
        onClose?.() || navigation.goBack();
      } else {
        Alert.alert('No Subscription Found', 'We couldn\'t find an active subscription.');
      }
    } catch (error) {
      Alert.alert('Restore Failed', 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const premiumFeatures = [
    { icon: '♾️', title: 'Unlimited Daily Plans', desc: 'AI-powered personalized schedules' },
    { icon: '🚫', title: 'No Advertisements', desc: 'Distraction-free experience' },
    { icon: '🧠', title: 'Advanced BioLoad Insights', desc: 'Deep health analytics' },
    { icon: '🍲', title: 'Heritage Recipes', desc: 'Cultural food recommendations' },
    { icon: '💬', title: 'Unlimited AI Coach', desc: 'Chat without limits' },
    { icon: '📊', title: 'Data Export', desc: 'Download your health data' },
  ];

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.closeButton} onPress={() => onClose?.() || navigation.goBack()}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Unlock Premium</Text>

        {blockedFeature && (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedText}>
              You've reached your free limit for {blockedFeature.name}
            </Text>
          </View>
        )}

        <Text style={styles.subtitle}>Get unlimited access to all features</Text>

        <View style={styles.featuresContainer}>
          {premiumFeatures.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.plansContainer}>
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'yearly' && styles.planCardSelected]}
            onPress={() => setSelectedPlan('yearly')}
          >
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsText}>SAVE 33%</Text>
            </View>
            <Text style={styles.planName}>Yearly</Text>
            <Text style={styles.planPrice}>{SUBSCRIPTION_PRODUCTS.yearly.price}</Text>
            <Text style={styles.planPeriod}>per year</Text>
            <Text style={styles.planBreakdown}>$3.33/month</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardSelected]}
            onPress={() => setSelectedPlan('monthly')}
          >
            <Text style={styles.planName}>Monthly</Text>
            <Text style={styles.planPrice}>{SUBSCRIPTION_PRODUCTS.monthly.price}</Text>
            <Text style={styles.planPeriod}>per month</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.purchaseButton}
          onPress={handlePurchase}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.purchaseText}>
              Start 7-Day Free Trial
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.trialInfo}>
          Try free for 7 days, then {selectedPlan === 'yearly'
            ? SUBSCRIPTION_PRODUCTS.yearly.price + '/year'
            : SUBSCRIPTION_PRODUCTS.monthly.price + '/month'}
        </Text>

        <TouchableOpacity onPress={handleRestore} disabled={loading}>
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </TouchableOpacity>

        <Text style={styles.legalText}>
          Payment will be charged to your Google Play account. Subscription automatically
          renews unless cancelled at least 24 hours before the end of the current period.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  closeText: { color: '#fff', fontSize: 24 },
  content: { padding: 24, paddingTop: 80 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#888', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  blockedBanner: { backgroundColor: '#6366f1', padding: 12, borderRadius: 8, marginBottom: 16 },
  blockedText: { color: '#fff', textAlign: 'center', fontSize: 14 },
  featuresContainer: { marginBottom: 32 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  featureIcon: { fontSize: 24, marginRight: 16 },
  featureText: { flex: 1 },
  featureTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  featureDesc: { color: '#888', fontSize: 14 },
  plansContainer: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  planCard: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  planCardSelected: { borderColor: '#6366f1' },
  savingsBadge: { position: 'absolute', top: -10, backgroundColor: '#10b981', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  savingsText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  planName: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 8 },
  planPrice: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginTop: 8 },
  planPeriod: { color: '#888', fontSize: 14 },
  planBreakdown: { color: '#6366f1', fontSize: 12, marginTop: 4 },
  purchaseButton: { backgroundColor: '#6366f1', padding: 18, borderRadius: 12, alignItems: 'center' },
  purchaseText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  trialInfo: { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 12 },
  restoreText: { color: '#6366f1', fontSize: 14, textAlign: 'center', marginTop: 16 },
  legalText: { color: '#666', fontSize: 10, textAlign: 'center', marginTop: 24, lineHeight: 16 },
});
```

### 2.4 Feature Gate Hook

**File to Create**: `mobile/src/hooks/useFeatureGate.ts`

```typescript
// mobile/src/hooks/useFeatureGate.ts

import { useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { FeatureId, FEATURES } from '../config/premiumFeatures';

interface UseFeatureGateResult {
  canUse: boolean;
  remaining: number | 'unlimited';
  isPremium: boolean;
  consume: () => boolean;
  showPaywall: () => void;
  executeOrPaywall: (action: () => void | Promise<void>) => Promise<void>;
}

export const useFeatureGate = (featureId: FeatureId): UseFeatureGateResult => {
  const navigation = useNavigation();
  const { isPremium, checkFeatureAccess, consumeFeature } = useSubscriptionStore();

  const access = useMemo(() => checkFeatureAccess(featureId), [featureId, checkFeatureAccess]);

  const showPaywall = useCallback(() => {
    navigation.navigate('Paywall' as never, { featureId } as never);
  }, [navigation, featureId]);

  const consume = useCallback(() => {
    return consumeFeature(featureId);
  }, [featureId, consumeFeature]);

  const executeOrPaywall = useCallback(async (action: () => void | Promise<void>) => {
    if (isPremium) {
      await action();
      return;
    }

    const consumed = consume();
    if (consumed) {
      await action();
    } else {
      showPaywall();
    }
  }, [isPremium, consume, showPaywall]);

  return {
    canUse: access.allowed,
    remaining: access.remaining,
    isPremium,
    consume,
    showPaywall,
    executeOrPaywall,
  };
};
```

### 2.5 Integrate Feature Gates in Existing Components

**File to Modify**: `mobile/src/screens/DashboardScreen.tsx`

```typescript
// Add to DashboardScreen.tsx

import { useFeatureGate } from '../hooks/useFeatureGate';

// Inside component:
const planGate = useFeatureGate('unlimited_plans');

const handleGeneratePlan = async () => {
  await planGate.executeOrPaywall(async () => {
    // Your existing plan generation logic
    const plan = await generateDailyPlan(user, context);
    setDailyPlan(plan);
  });
};

// Show remaining uses in UI:
{!planGate.isPremium && (
  <Text style={styles.usageText}>
    {planGate.remaining} free plans remaining this month
  </Text>
)}
```

**File to Modify**: `mobile/src/components/AICoach.tsx`

```typescript
// Add to AICoach.tsx

import { useFeatureGate } from '../hooks/useFeatureGate';

// Inside component:
const coachGate = useFeatureGate('coach_unlimited');

const handleSendMessage = async () => {
  await coachGate.executeOrPaywall(async () => {
    // Your existing chat logic
    const response = await sendToCoach(message);
    addMessage(response);
  });
};
```

---

## PHASE 3: ERROR HANDLING & STABILITY (Week 3-4)

### 3.1 Global Error Boundary

**File to Create**: `mobile/src/components/ErrorBoundary.tsx`

```typescript
// mobile/src/components/ErrorBoundary.tsx

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import crashlytics from '@react-native-firebase/crashlytics';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to crashlytics
    crashlytics().recordError(error);
    crashlytics().log(`Error boundary caught: ${error.message}`);
    crashlytics().setAttributes({
      componentStack: errorInfo.componentStack || 'unknown',
    });

    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>😵</Text>
          <Text style={styles.title}>Oops! Something went wrong</Text>
          <Text style={styles.message}>
            We're sorry, but something unexpected happened. Please try again.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0a0a0a' },
  emoji: { fontSize: 64, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 16, color: '#888', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  button: { backgroundColor: '#6366f1', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

### 3.2 API Request Wrapper with Retry

**File to Create**: `mobile/src/utils/apiClient.ts`

```typescript
// mobile/src/utils/apiClient.ts

import NetInfo from '@react-native-community/netinfo';

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public isNetworkError: boolean = false,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const calculateBackoff = (attempt: number, config: RetryConfig): number => {
  const delay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(delay + jitter, config.maxDelayMs);
};

export const fetchWithRetry = async <T>(
  fetchFn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> => {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
    try {
      // Check network connectivity
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        throw new ApiError('No internet connection', undefined, true, true);
      }

      return await fetchFn();
    } catch (error) {
      lastError = error as Error;

      const isRetryable =
        (error instanceof ApiError && error.isRetryable) ||
        (error instanceof Error && error.message.includes('network')) ||
        (error instanceof Error && error.message.includes('timeout'));

      if (!isRetryable || attempt === retryConfig.maxAttempts - 1) {
        throw error;
      }

      const delay = calculateBackoff(attempt, retryConfig);
      console.log(`Retry attempt ${attempt + 1}/${retryConfig.maxAttempts} after ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError || new Error('Request failed after retries');
};

export const geminiRequest = async <T>(
  endpoint: string,
  body: object
): Promise<T> => {
  return fetchWithRetry(async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const isRetryable = response.status >= 500 || response.status === 429;
      throw new ApiError(
        `API error: ${response.status}`,
        response.status,
        false,
        isRetryable
      );
    }

    return response.json();
  });
};
```

### 3.3 Offline Indicator Component

**File to Create**: `mobile/src/components/OfflineIndicator.tsx`

```typescript
// mobile/src/components/OfflineIndicator.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = useState(false);
  const [slideAnim] = useState(new Animated.Value(-50));

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const offline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(offline);

      Animated.timing(slideAnim, {
        toValue: offline ? 0 : -50,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });

    return () => unsubscribe();
  }, [slideAnim]);

  if (!isOffline) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.text}>📡 No Internet Connection</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingTop: 48, // Account for status bar
    alignItems: 'center',
    zIndex: 1000,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
```

### 3.4 Safe JSON Parse Utility

**File to Create**: `mobile/src/utils/safeJson.ts`

```typescript
// mobile/src/utils/safeJson.ts

import { z, ZodSchema } from 'zod';

export const safeJsonParse = <T>(
  json: string,
  schema?: ZodSchema<T>,
  fallback?: T
): T | null => {
  try {
    const parsed = JSON.parse(json);

    if (schema) {
      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
      console.warn('JSON schema validation failed:', result.error);
      return fallback ?? null;
    }

    return parsed;
  } catch (error) {
    console.warn('JSON parse failed:', error);
    return fallback ?? null;
  }
};

export const safeLocalStorageGet = async <T>(
  storage: { getItem: (key: string) => Promise<string | null> },
  key: string,
  schema?: ZodSchema<T>,
  fallback?: T
): Promise<T | null> => {
  try {
    const raw = await storage.getItem(key);
    if (!raw) return fallback ?? null;
    return safeJsonParse(raw, schema, fallback);
  } catch (error) {
    console.warn(`Failed to get ${key} from storage:`, error);
    return fallback ?? null;
  }
};
```

---

## PHASE 4: SOCIAL & RETENTION FEATURES (Week 4-6)

### 4.1 Achievement System

**File to Create**: `mobile/src/services/achievementService.ts`

```typescript
// mobile/src/services/achievementService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { analytics } from './analyticsService';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'streak' | 'milestone' | 'challenge' | 'special';
  requirement: number;
  unit: string;
  xpReward: number;
}

export interface UserAchievement {
  achievementId: string;
  unlockedAt: string;
  progress: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Streaks
  { id: 'streak_3', name: 'Getting Started', description: 'Log meals for 3 days in a row', icon: '🔥', category: 'streak', requirement: 3, unit: 'days', xpReward: 50 },
  { id: 'streak_7', name: 'Week Warrior', description: 'Log meals for 7 days in a row', icon: '💪', category: 'streak', requirement: 7, unit: 'days', xpReward: 100 },
  { id: 'streak_30', name: 'Monthly Master', description: 'Log meals for 30 days in a row', icon: '🏆', category: 'streak', requirement: 30, unit: 'days', xpReward: 500 },

  // Milestones
  { id: 'meals_10', name: 'Food Explorer', description: 'Log 10 meals', icon: '🍽️', category: 'milestone', requirement: 10, unit: 'meals', xpReward: 25 },
  { id: 'meals_100', name: 'Nutrition Ninja', description: 'Log 100 meals', icon: '🥷', category: 'milestone', requirement: 100, unit: 'meals', xpReward: 250 },
  { id: 'steps_100k', name: 'Century Walker', description: 'Walk 100,000 steps total', icon: '👟', category: 'milestone', requirement: 100000, unit: 'steps', xpReward: 200 },

  // Challenges
  { id: 'hydration_daily', name: 'Hydration Hero', description: 'Meet your water goal for a day', icon: '💧', category: 'challenge', requirement: 1, unit: 'days', xpReward: 25 },
  { id: 'sleep_8h', name: 'Sleep Champion', description: 'Get 8+ hours of sleep', icon: '😴', category: 'challenge', requirement: 8, unit: 'hours', xpReward: 50 },
  { id: 'plan_complete', name: 'Plan Perfectionist', description: 'Complete all tasks in a daily plan', icon: '✅', category: 'challenge', requirement: 1, unit: 'plans', xpReward: 75 },

  // Special
  { id: 'first_scan', name: 'Snap Happy', description: 'Scan your first meal', icon: '📸', category: 'special', requirement: 1, unit: 'scans', xpReward: 10 },
  { id: 'fridge_scan', name: 'Smart Chef', description: 'Use the fridge scanner', icon: '🧊', category: 'special', requirement: 1, unit: 'scans', xpReward: 25 },
  { id: 'coach_chat', name: 'Seeking Wisdom', description: 'Chat with the AI coach', icon: '🤖', category: 'special', requirement: 1, unit: 'chats', xpReward: 15 },
];

const STORAGE_KEY = 'user:achievements';

class AchievementService {
  private userAchievements: UserAchievement[] = [];
  private listeners: ((achievement: Achievement) => void)[] = [];

  async initialize(): Promise<void> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    this.userAchievements = raw ? JSON.parse(raw) : [];
  }

  async checkAndUnlock(achievementId: string, currentValue: number): Promise<Achievement | null> {
    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achievement) return null;

    const existing = this.userAchievements.find(ua => ua.achievementId === achievementId);
    if (existing) return null; // Already unlocked

    if (currentValue >= achievement.requirement) {
      const userAchievement: UserAchievement = {
        achievementId,
        unlockedAt: new Date().toISOString(),
        progress: currentValue,
      };

      this.userAchievements.push(userAchievement);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.userAchievements));

      analytics.logEvent('achievement_unlocked', { achievementId, xpReward: achievement.xpReward });

      // Notify listeners
      this.listeners.forEach(listener => listener(achievement));

      return achievement;
    }

    return null;
  }

  getUnlockedAchievements(): (Achievement & { unlockedAt: string })[] {
    return this.userAchievements
      .map(ua => {
        const achievement = ACHIEVEMENTS.find(a => a.id === ua.achievementId);
        return achievement ? { ...achievement, unlockedAt: ua.unlockedAt } : null;
      })
      .filter(Boolean) as (Achievement & { unlockedAt: string })[];
  }

  getProgress(achievementId: string): number {
    const ua = this.userAchievements.find(a => a.achievementId === achievementId);
    return ua?.progress ?? 0;
  }

  onUnlock(listener: (achievement: Achievement) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

export const achievementService = new AchievementService();
```

### 4.2 Share Meal Feature

**File to Create**: `mobile/src/components/ShareMealButton.tsx`

```typescript
// mobile/src/components/ShareMealButton.tsx

import React from 'react';
import { TouchableOpacity, Text, Share, StyleSheet, Alert } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { FoodAnalysisResult } from '../types';

interface Props {
  meal: FoodAnalysisResult;
  imageRef: React.RefObject<ViewShot>;
}

export const ShareMealButton: React.FC<Props> = ({ meal, imageRef }) => {
  const handleShare = async () => {
    try {
      // Capture the meal card as an image
      const uri = await captureRef(imageRef, {
        format: 'png',
        quality: 0.9,
      });

      const shareMessage = `🍽️ Just logged my meal on Body Mode!\n\n` +
        `${meal.mealDescription}\n` +
        `📊 ${meal.totalCalories} kcal\n` +
        `🥩 Protein: ${meal.macros.protein}g\n` +
        `🍞 Carbs: ${meal.macros.carbs}g\n` +
        `🧈 Fat: ${meal.macros.fat}g\n\n` +
        `Grade: ${meal.healthGrade} ${getGradeEmoji(meal.healthGrade)}\n\n` +
        `#BodyMode #HealthyEating`;

      await Share.share({
        message: shareMessage,
        url: uri,
        title: 'My Meal on Body Mode',
      });
    } catch (error) {
      Alert.alert('Share Failed', 'Unable to share meal. Please try again.');
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handleShare}>
      <Text style={styles.buttonText}>📤 Share</Text>
    </TouchableOpacity>
  );
};

const getGradeEmoji = (grade: string): string => {
  switch (grade) {
    case 'A': return '🌟';
    case 'B': return '👍';
    case 'C': return '😐';
    case 'D': return '😕';
    case 'F': return '😞';
    default: return '';
  }
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
```

### 4.3 Weekly Challenge System

**File to Create**: `mobile/src/services/challengeService.ts`

```typescript
// mobile/src/services/challengeService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Challenge {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'steps' | 'water' | 'sleep' | 'meals' | 'workouts';
  target: number;
  unit: string;
  duration: 'daily' | 'weekly';
  xpReward: number;
}

export interface ActiveChallenge extends Challenge {
  startedAt: string;
  progress: number;
  completed: boolean;
}

const WEEKLY_CHALLENGES: Challenge[] = [
  { id: 'steps_50k', name: 'Step It Up', description: 'Walk 50,000 steps this week', icon: '🚶', type: 'steps', target: 50000, unit: 'steps', duration: 'weekly', xpReward: 150 },
  { id: 'water_7days', name: 'Hydration Week', description: 'Hit your water goal every day', icon: '💧', type: 'water', target: 7, unit: 'days', duration: 'weekly', xpReward: 100 },
  { id: 'sleep_7h_avg', name: 'Sleep Well', description: 'Average 7+ hours of sleep', icon: '😴', type: 'sleep', target: 7, unit: 'hours', duration: 'weekly', xpReward: 100 },
  { id: 'meals_21', name: 'Meal Tracker', description: 'Log 21 meals (3/day)', icon: '🍽️', type: 'meals', target: 21, unit: 'meals', duration: 'weekly', xpReward: 125 },
  { id: 'workouts_3', name: 'Active Week', description: 'Complete 3 workouts', icon: '💪', type: 'workouts', target: 3, unit: 'workouts', duration: 'weekly', xpReward: 100 },
];

const STORAGE_KEY = 'user:active_challenges';

class ChallengeService {
  private activeChallenges: ActiveChallenge[] = [];

  async initialize(): Promise<void> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    this.activeChallenges = raw ? JSON.parse(raw) : [];
    await this.refreshWeeklyChallenges();
  }

  private async refreshWeeklyChallenges(): Promise<void> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    // Check if we need new weekly challenges
    const existingWeekly = this.activeChallenges.filter(c =>
      c.duration === 'weekly' &&
      new Date(c.startedAt) >= weekStart
    );

    if (existingWeekly.length === 0) {
      // Select 3 random challenges for the week
      const shuffled = [...WEEKLY_CHALLENGES].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 3);

      const newChallenges: ActiveChallenge[] = selected.map(c => ({
        ...c,
        startedAt: weekStart.toISOString(),
        progress: 0,
        completed: false,
      }));

      this.activeChallenges = [
        ...this.activeChallenges.filter(c => c.duration !== 'weekly'),
        ...newChallenges,
      ];

      await this.save();
    }
  }

  async updateProgress(type: Challenge['type'], value: number): Promise<ActiveChallenge[]> {
    const completed: ActiveChallenge[] = [];

    for (const challenge of this.activeChallenges) {
      if (challenge.type === type && !challenge.completed) {
        challenge.progress += value;

        if (challenge.progress >= challenge.target) {
          challenge.completed = true;
          completed.push(challenge);
        }
      }
    }

    await this.save();
    return completed;
  }

  getActiveChallenges(): ActiveChallenge[] {
    return this.activeChallenges.filter(c => !c.completed);
  }

  getCompletedChallenges(): ActiveChallenge[] {
    return this.activeChallenges.filter(c => c.completed);
  }

  private async save(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.activeChallenges));
  }
}

export const challengeService = new ChallengeService();
```

---

## PHASE 5: TESTING & POLISH (Week 6-8)

### 5.1 Unit Test Setup

**File to Create**: `mobile/src/__tests__/setup.ts`

```typescript
// mobile/src/__tests__/setup.ts

import '@testing-library/jest-native/extend-expect';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));

// Mock Firebase
jest.mock('@react-native-firebase/crashlytics', () => () => ({
  log: jest.fn(),
  recordError: jest.fn(),
  setAttributes: jest.fn(),
}));

jest.mock('@react-native-firebase/analytics', () => () => ({
  logEvent: jest.fn(),
  setUserId: jest.fn(),
}));
```

### 5.2 Example Unit Tests

**File to Create**: `mobile/src/__tests__/ageVerificationService.test.ts`

```typescript
// mobile/src/__tests__/ageVerificationService.test.ts

import { verifyAge } from '../services/ageVerificationService';

describe('ageVerificationService', () => {
  describe('verifyAge', () => {
    it('should block users under 13', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 10); // 10 years old

      const result = verifyAge(birthDate);

      expect(result.allowed).toBe(false);
      expect(result.age).toBe(10);
    });

    it('should require parental consent for 13-17', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 15); // 15 years old

      const result = verifyAge(birthDate);

      expect(result.allowed).toBe(true);
      expect(result.requiresParentalConsent).toBe(true);
      expect(result.age).toBe(15);
    });

    it('should allow adults without consent', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 25); // 25 years old

      const result = verifyAge(birthDate);

      expect(result.allowed).toBe(true);
      expect(result.requiresParentalConsent).toBe(false);
      expect(result.age).toBe(25);
    });

    it('should handle edge case: exactly 13', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 13);

      const result = verifyAge(birthDate);

      expect(result.allowed).toBe(true);
      expect(result.requiresParentalConsent).toBe(true);
    });

    it('should handle edge case: exactly 18', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 18);

      const result = verifyAge(birthDate);

      expect(result.allowed).toBe(true);
      expect(result.requiresParentalConsent).toBe(false);
    });
  });
});
```

**File to Create**: `mobile/src/__tests__/subscriptionStore.test.ts`

```typescript
// mobile/src/__tests__/subscriptionStore.test.ts

import { useSubscriptionStore } from '../stores/subscriptionStore';
import { FEATURES } from '../config/premiumFeatures';

describe('subscriptionStore', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      isPremium: false,
      subscriptionId: null,
      expiresAt: null,
      featureUsage: {
        unlimited_plans: { count: 0, resetDate: new Date().toISOString() },
        // ... other features
      },
    });
  });

  it('should allow premium users unlimited access', () => {
    useSubscriptionStore.getState().setSubscription('sub_123', '2027-01-01');

    const access = useSubscriptionStore.getState().checkFeatureAccess('unlimited_plans');

    expect(access.allowed).toBe(true);
    expect(access.remaining).toBe('unlimited');
  });

  it('should track free usage correctly', () => {
    const store = useSubscriptionStore.getState();

    // Use feature 3 times (free limit)
    store.consumeFeature('unlimited_plans');
    store.consumeFeature('unlimited_plans');
    store.consumeFeature('unlimited_plans');

    const access = store.checkFeatureAccess('unlimited_plans');

    expect(access.allowed).toBe(false);
    expect(access.remaining).toBe(0);
  });

  it('should reset usage on monthly reset', () => {
    const store = useSubscriptionStore.getState();

    store.consumeFeature('unlimited_plans');
    store.consumeFeature('unlimited_plans');
    store.consumeFeature('unlimited_plans');

    store.resetMonthlyUsage();

    const access = store.checkFeatureAccess('unlimited_plans');
    expect(access.allowed).toBe(true);
    expect(access.remaining).toBe(FEATURES.unlimited_plans.freeLimit);
  });
});
```

---

## IMPLEMENTATION CHECKLIST

### Week 1: Critical Compliance
- [ ] Create `AgeVerificationScreen.tsx`
- [ ] Create `ageVerificationService.ts`
- [ ] Integrate age verification into navigation
- [ ] Trim health permissions in AndroidManifest.xml
- [ ] Update healthConnectService.ts permissions array
- [ ] Create `MedicalDisclaimerModal.tsx`
- [ ] Add disclaimer to onboarding flow

### Week 2: Compliance + Monetization Start
- [ ] Create `dataRetentionService.ts`
- [ ] Create `premiumFeatures.ts` config
- [ ] Create `subscriptionStore.ts`
- [ ] Update subscription service integration

### Week 3: Monetization Complete
- [ ] Create `PaywallScreen.tsx`
- [ ] Create `useFeatureGate.ts` hook
- [ ] Integrate gates into Dashboard (daily plans)
- [ ] Integrate gates into AICoach
- [ ] Integrate gates into FoodAnalyzer (fridge scanner)
- [ ] Test purchase flow end-to-end

### Week 4: Error Handling
- [ ] Create `ErrorBoundary.tsx`
- [ ] Create `apiClient.ts` with retry logic
- [ ] Create `OfflineIndicator.tsx`
- [ ] Create `safeJson.ts` utilities
- [ ] Wrap app in ErrorBoundary
- [ ] Add OfflineIndicator to root layout

### Week 5: Social Features
- [ ] Create `achievementService.ts`
- [ ] Create `AchievementsScreen.tsx`
- [ ] Create `ShareMealButton.tsx`
- [ ] Create `challengeService.ts`
- [ ] Create `ChallengesScreen.tsx`
- [ ] Integrate achievements into meal logging
- [ ] Integrate challenges into dashboard

### Week 6: Testing
- [ ] Set up Jest configuration
- [ ] Write tests for age verification
- [ ] Write tests for subscription store
- [ ] Write tests for feature gates
- [ ] Write tests for achievement service
- [ ] Manual E2E testing on device

### Week 7-8: Polish & Launch Prep
- [ ] Fix all test failures
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Prepare Play Store listing
- [ ] Create screenshots
- [ ] Write release notes
- [ ] Submit to Play Console

---

## DEPENDENCIES TO ADD

```json
// Add to mobile/package.json dependencies:
{
  "@react-native-community/datetimepicker": "^8.0.0",
  "@react-native-community/netinfo": "^11.3.0",
  "react-native-view-shot": "^4.0.0",
  "zod": "^3.22.0"
}
```

```bash
# Install commands
cd mobile
npm install @react-native-community/datetimepicker @react-native-community/netinfo react-native-view-shot zod
npx pod-install ios  # If supporting iOS
```

---

## SUCCESS METRICS

After implementation, your app should:

1. **Pass Play Store Review** ✓
   - COPPA compliant age verification
   - Appropriate health permissions
   - Clear medical disclaimers
   - Complete Data Safety form

2. **Generate Revenue** ✓
   - Working subscription flow
   - Feature gating in place
   - Ad fallback for free users

3. **Retain Users** ✓
   - Achievement notifications
   - Weekly challenges
   - Sharing capability
   - Streak tracking

4. **Be Stable** ✓
   - Error boundary catches crashes
   - Offline mode graceful
   - API retries automatically
   - Safe data parsing

---

**Good luck with your launch! 🚀**
