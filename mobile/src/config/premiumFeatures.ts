/**
 * Premium Features Configuration
 * Defines what's free vs premium and usage limits
 */

export type FeatureId =
  | 'daily_plans'
  | 'food_scan'
  | 'fridge_scan'
  | 'ai_coach'
  | 'sleep_analysis'
  | 'advanced_insights'
  | 'no_ads'
  | 'data_export';

export interface Feature {
  id: FeatureId;
  name: string;
  description: string;
  icon: string;
  freeLimit: number | null; // null = unlimited, 0 = premium only
  freePeriod: 'day' | 'week' | 'month';
  energyCost: number;
}

export const FEATURES: Record<FeatureId, Feature> = {
  daily_plans: {
    id: 'daily_plans',
    name: 'Daily Plans',
    description: 'AI-generated personalized daily schedules',
    icon: '📋',
    freeLimit: 3,
    freePeriod: 'month',
    energyCost: 50,
  },
  food_scan: {
    id: 'food_scan',
    name: 'Food Scanner',
    description: 'Analyze meals with your camera',
    icon: '📸',
    freeLimit: 10,
    freePeriod: 'day',
    energyCost: 25,
  },
  fridge_scan: {
    id: 'fridge_scan',
    name: 'Smart Fridge Scanner',
    description: 'Get recipe suggestions from fridge photos',
    icon: '🧊',
    freeLimit: 2,
    freePeriod: 'week',
    energyCost: 30,
  },
  ai_coach: {
    id: 'ai_coach',
    name: 'AI Coach',
    description: 'Chat with your personal health coach',
    icon: '🤖',
    freeLimit: 10,
    freePeriod: 'day',
    energyCost: 10,
  },
  sleep_analysis: {
    id: 'sleep_analysis',
    name: 'Sleep Analysis',
    description: 'Detailed sleep stage analysis',
    icon: '😴',
    freeLimit: null, // Free unlimited
    freePeriod: 'day',
    energyCost: 20,
  },
  advanced_insights: {
    id: 'advanced_insights',
    name: 'Advanced Insights',
    description: 'BioLoad breakdown and trends',
    icon: '📊',
    freeLimit: 0, // Premium only
    freePeriod: 'month',
    energyCost: 0,
  },
  no_ads: {
    id: 'no_ads',
    name: 'Ad-Free',
    description: 'Remove all advertisements',
    icon: '🚫',
    freeLimit: 0, // Premium only
    freePeriod: 'month',
    energyCost: 0,
  },
  data_export: {
    id: 'data_export',
    name: 'Data Export',
    description: 'Export your health data',
    icon: '💾',
    freeLimit: 1,
    freePeriod: 'month',
    energyCost: 0,
  },
};

// Subscription Products (must match Google Play Console)
export const SUBSCRIPTION_PRODUCTS = {
  monthly: {
    productId: 'bodymode_premium_monthly',
    price: '$4.99',
    priceAmount: 4.99,
    period: 'month' as const,
    trialDays: 7,
  },
  yearly: {
    productId: 'bodymode_premium_yearly',
    price: '$39.99',
    priceAmount: 39.99,
    period: 'year' as const,
    trialDays: 7,
    savings: '33%',
  },
};

// Premium benefits for paywall display
export const PREMIUM_BENEFITS = [
  { icon: '♾️', title: 'Unlimited Daily Plans', description: 'No more limits on AI planning' },
  { icon: '🚫', title: 'No Advertisements', description: 'Distraction-free experience' },
  { icon: '📊', title: 'Advanced BioLoad Insights', description: 'Deep health analytics' },
  { icon: '🧊', title: 'Unlimited Fridge Scanner', description: 'Recipe ideas anytime' },
  { icon: '🤖', title: 'Unlimited AI Coach', description: 'Chat without daily limits' },
  { icon: '💾', title: 'Unlimited Data Export', description: 'Download all your data' },
];
