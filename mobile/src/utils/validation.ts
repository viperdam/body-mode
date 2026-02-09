// Validation utilities for onboarding and profile data

export interface ValidationError {
    field: string;
    message: string;
    messageKey: string; // i18n key for translation
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

/**
 * Validates a single onboarding field
 * Returns null if valid, error message key if invalid
 */
export const validateOnboardingField = (field: string, value: any): string | null => {
    switch (field) {
        case 'name':
            if (!value || typeof value !== 'string') {
                return 'validation.name_required';
            }
            if (value.trim().length < 2) {
                return 'validation.name_too_short';
            }
            if (value.trim().length > 50) {
                return 'validation.name_too_long';
            }
            break;

        case 'age':
            const age = typeof value === 'string' ? parseInt(value, 10) : value;
            if (isNaN(age) || age < 13) {
                return 'validation.age_too_young';
            }
            if (age > 120) {
                return 'validation.age_too_old';
            }
            break;

        case 'weight':
            const weight = typeof value === 'string' ? parseFloat(value) : value;
            if (isNaN(weight) || weight < 30) {
                return 'validation.weight_too_low';
            }
            if (weight > 300) {
                return 'validation.weight_too_high';
            }
            break;

        case 'height':
            const height = typeof value === 'string' ? parseFloat(value) : value;
            if (isNaN(height) || height < 100) {
                return 'validation.height_too_low';
            }
            if (height > 250) {
                return 'validation.height_too_high';
            }
            break;

        case 'goalWeight':
            if (value === undefined || value === null || value === '') {
                return null; // Optional field
            }
            const goalWeight = typeof value === 'string' ? parseFloat(value) : value;
            if (isNaN(goalWeight) || goalWeight < 30) {
                return 'validation.goal_weight_too_low';
            }
            if (goalWeight > 300) {
                return 'validation.goal_weight_too_high';
            }
            break;

        case 'targetDate':
            if (!value) {
                return null; // Optional field
            }
            const targetDate = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (isNaN(targetDate.getTime())) {
                return 'validation.invalid_date';
            }
            if (targetDate <= today) {
                return 'validation.date_must_be_future';
            }
            break;

        case 'childrenCount':
            const children = typeof value === 'string' ? parseInt(value, 10) : value;
            if (isNaN(children) || children < 0) {
                return 'validation.children_invalid';
            }
            if (children > 20) {
                return 'validation.children_too_many';
            }
            break;
        case 'mealsPerDay':
            const meals = typeof value === 'string' ? parseInt(value, 10) : value;
            if (isNaN(meals) || meals < 1 || meals > 12) {
                return 'validation.meals_per_day_invalid';
            }
            break;
    }

    return null;
};

/**
 * Validates all fields for a specific onboarding step
 */
export const validateOnboardingStep = (
    step: string,
    formData: Record<string, any>
): ValidationResult => {
    const errors: ValidationError[] = [];

    switch (step) {
        case 'basics':
            const nameError = validateOnboardingField('name', formData.name);
            if (nameError) {
                errors.push({ field: 'name', message: nameError, messageKey: nameError });
            }
            const ageError = validateOnboardingField('age', formData.age);
            if (ageError) {
                errors.push({ field: 'age', message: ageError, messageKey: ageError });
            }
            break;

        case 'body':
            const heightError = validateOnboardingField('height', formData.height);
            if (heightError) {
                errors.push({ field: 'height', message: heightError, messageKey: heightError });
            }
            const weightError = validateOnboardingField('weight', formData.weight);
            if (weightError) {
                errors.push({ field: 'weight', message: weightError, messageKey: weightError });
            }
            const goalWeightError = validateOnboardingField('goalWeight', formData.goalWeight);
            if (goalWeightError) {
                errors.push({ field: 'goalWeight', message: goalWeightError, messageKey: goalWeightError });
            }
            break;

        case 'goals':
            // Goal and planIntensity have defaults, so no validation needed
            break;

        case 'diet':
            // All dietary preferences are optional
            break;

        case 'fitness':
            // All fitness fields are optional except experienceLevel which has default
            break;

        case 'lifestyle':
            // All lifestyle fields are optional or have defaults
            break;

        case 'routine':
            const mealsPerDayError = validateOnboardingField('mealsPerDay', formData.mealsPerDay);
            if (mealsPerDayError) {
                errors.push({ field: 'mealsPerDay', message: mealsPerDayError, messageKey: mealsPerDayError });
            }
            break;

        case 'sleep':
            // All sleep fields are optional or have defaults
            break;

        case 'medical':
            const childrenError = validateOnboardingField('childrenCount', formData.childrenCount);
            if (childrenError) {
                errors.push({ field: 'childrenCount', message: childrenError, messageKey: childrenError });
            }
            break;
    }

    return {
        isValid: errors.length === 0,
        errors,
    };
};

/**
 * Validates profile update data
 */
export const validateProfileUpdate = (
    updates: Record<string, any>
): ValidationResult => {
    const errors: ValidationError[] = [];

    // Validate each field that exists in updates
    Object.keys(updates).forEach(field => {
        const error = validateOnboardingField(field, updates[field]);
        if (error) {
            errors.push({ field, message: error, messageKey: error });
        }
    });

    return {
        isValid: errors.length === 0,
        errors,
    };
};

/**
 * Format a number input, stripping non-numeric characters
 */
export const sanitizeNumericInput = (value: string): string => {
    return value.replace(/[^0-9.]/g, '');
};

/**
 * Format weight based on unit system
 */
export const formatWeightForDisplay = (kg: number, useMetric: boolean): string => {
    if (useMetric) {
        return kg.toFixed(1);
    }
    return (kg * 2.20462).toFixed(1);
};

/**
 * Parse weight input to kg
 */
export const parseWeightToKg = (value: string, useMetric: boolean): number => {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return 0;
    return useMetric ? parsed : parsed / 2.20462;
};

/**
 * Format height based on unit system
 */
export const formatHeightForDisplay = (cm: number, useMetric: boolean): string => {
    if (useMetric) {
        return cm.toString();
    }
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}'${inches}"`;
};

/**
 * Parse height input to cm
 */
export const parseHeightToCm = (value: string, useMetric: boolean): number => {
    if (useMetric) {
        return parseInt(value, 10) || 0;
    }
    // Parse feet'inches" format
    const match = value.match(/(\d+)'(\d+)"/);
    if (match) {
        const feet = parseInt(match[1], 10);
        const inches = parseInt(match[2], 10);
        return Math.round((feet * 12 + inches) * 2.54);
    }
    // If just a number, assume feet
    const feet = parseInt(value, 10);
    if (!isNaN(feet)) {
        return Math.round(feet * 12 * 2.54);
    }
    return 0;
};
