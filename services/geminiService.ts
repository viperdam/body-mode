
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { FoodAnalysisResult, UserProfile, FoodLogEntry, MoodLog, WeightLogEntry, AppContext, DailyPlan, SleepSession, FridgeIngredientsResult, Recipe, Language, ActivityLogEntry, DailyWrapUp, CookingMood, BioLoadAnalysis } from "../types";
import { COACH_PERSONA, FOOD_ANALYSIS_PROMPT, TEXT_FOOD_ANALYSIS_PROMPT, DAILY_PLAN_PROMPT, SLEEP_ANALYSIS_PROMPT, SUMMARIZATION_PROMPT, INGREDIENTS_DETECTION_PROMPT, RECIPE_GENERATION_PROMPT, PROFILE_CALCULATION_PROMPT, REFINED_FOOD_ANALYSIS_PROMPT, DAILY_WRAPUP_PROMPT } from "../prompts/aiPrompts";
import { getLocalDateKey, getLocalTime } from "../utils/dateUtils";
import { calculateBioLoad } from "./bioEngine"; // Import the new Bio Engine

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to clean JSON string from Markdown code blocks
const cleanAndParseJSON = (text: string): any => {
  try {
    // Remove ```json and ``` wrapping if present
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON:", text);
    throw new Error("Invalid JSON response from AI");
  }
};

const getLanguageFullName = (code: Language): string => {
    const map: Record<Language, string> = {
        'en': 'English',
        'ar': 'Arabic',
        'fr': 'French',
        'es': 'Spanish',
        'hi': 'Hindi',
        'de': 'German',
        'nl': 'Dutch',
        'zh': 'Simplified Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'tr': 'Turkish',
        'sw': 'Swahili',
        'pt': 'Portuguese'
    };
    return map[code] || 'English';
};

const generateUserContextString = (
    userProfile: UserProfile, 
    foodHistory: FoodLogEntry[], 
    activityHistory: ActivityLogEntry[], 
    moodHistory: MoodLog[], 
    weightHistory: WeightLogEntry[],
    waterLog: { date: string, amount: number }, 
    sleepHistory: {date: string, hours: number}[], // New Param
    appContext: AppContext,
    currentPlan: DailyPlan | null, 
    targetLanguage: Language = 'en'
): string => {
    const now = new Date();
    const currentTime = getLocalTime(now);
    
    // --- 1. RUN BIO-ENGINE ---
    // We calculate the deep metrics FIRST, then feed them to Gemini.
    const bioLoad = calculateBioLoad(
        userProfile,
        foodHistory,
        activityHistory,
        moodHistory,
        sleepHistory,
        { weatherCode: appContext.weather.code, currentTime }
    );

    const todayStr = getLocalDateKey(now);
    
    // Food
    const todayFoodLogs = foodHistory.filter(f => getLocalDateKey(new Date(f.timestamp)) === todayStr);
    const todayMacros = todayFoodLogs.reduce((acc, log) => ({
        calories: acc.calories + log.food.macros.calories,
        protein: acc.protein + log.food.macros.protein,
    }), { calories: 0, protein: 0 });

    const netCalories = todayMacros.calories - 0; // Simplified for prompt context

    let planAdherenceStr = "No plan active.";
    if (currentPlan && currentPlan.date === todayStr) {
        const completed = currentPlan.items.filter(i => i.completed).length;
        planAdherenceStr = `Tasks Completed: ${completed}/${currentPlan.items.length}`;
    }

    const targetLangName = getLanguageFullName(targetLanguage);

    return `
    === DEEP BIO-CONTEXT (CRITICAL) ===
    The user is NOT a machine. Use these calculated "Feeling Metrics" to adjust tone and advice:
    - Neural Battery: ${bioLoad.neuralBattery}/100 (If low < 40, user is mentally fried. Suggest rest, not focus).
    - Hormonal Load: ${bioLoad.hormonalLoad}/100 (If high > 60, cortisol is high. Suggest calming foods/activities).
    - Physical Fatigue: ${bioLoad.physicalFatigue}/100.
    - Social Drain: ${bioLoad.socialDrain} (Impact of Kids/Work).
    - Vitamin Alerts: ${bioLoad.vitaminStatus.join(', ') || 'None detected'}.
    
    === USER IDENTITY ===
    Origin: ${userProfile.culinaryIdentity.origin} (Suggest Comfort Food from here if Neural Battery is low).
    Location: ${userProfile.culinaryIdentity.residence} (Match ingredients availability).
    Work: ${userProfile.workProfile.type} (${userProfile.workProfile.intensity}).
    Family: ${userProfile.maritalStatus}, ${userProfile.childrenCount} kids.

    === REAL-TIME ===
    Time: ${currentTime}
    Weather: ${appContext.weather.temp}°C, ${appContext.weather.condition}
    Language: ${targetLangName}
    
    === ADHERENCE ===
    ${planAdherenceStr}
    `;
};

// ... (Rest of schemas) ... 
const FOOD_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    foodName: { type: Type.STRING, description: "Name of the identified dish" },
    description: { type: Type.STRING, description: "A appetizing, 1-sentence description of the meal." },
    ingredients: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of identified ingredients." },
    macros: {
      type: Type.OBJECT,
      properties: {
        calories: { type: Type.NUMBER },
        protein: { type: Type.NUMBER },
        carbs: { type: Type.NUMBER },
        fat: { type: Type.NUMBER },
        vitamins: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["calories", "protein", "carbs", "fat"]
    },
    estimatedWeightGrams: { type: Type.NUMBER },
    healthGrade: { type: Type.STRING, enum: ["A", "B", "C", "D", "F"], description: "Nutritional grade" },
    confidence: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
    advice: { type: Type.STRING, description: "Short, 1-sentence nutritional advice relevant to the user's goal." }
  },
  required: ["foodName", "description", "ingredients", "macros", "healthGrade", "confidence", "advice"]
};

export const calculateUserProfile = async (formData: Partial<UserProfile>): Promise<Partial<UserProfile>> => {
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            dailyCalorieTarget: { type: Type.NUMBER },
            calculatedIdealWeight: { type: Type.NUMBER },
            projectedWeeks: { type: Type.NUMBER },
            weeklyGoalSummary: { type: Type.STRING },
            monthlyGoalSummary: { type: Type.STRING }
        },
        required: ["dailyCalorieTarget", "calculatedIdealWeight", "projectedWeeks", "weeklyGoalSummary", "monthlyGoalSummary"]
    };

    let promptText = `${PROFILE_CALCULATION_PROMPT}\n\nUSER DATA:\n${JSON.stringify(formData, null, 2)}`;
    
    if (formData.goalWeight && formData.targetDate) {
        promptText += `\n\nCRITICAL OVERRIDE: The user wants to reach ${formData.goalWeight}kg by ${formData.targetDate}. Calculate the daily calorie deficit required to meet this deadline safely.`;
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: promptText }] },
            config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
        });
        if (response.text) return cleanAndParseJSON(response.text);
        throw new Error("No data returned from Gemini");
    } catch (e) {
        console.error("Profile Calculation Failed", e);
        return { dailyCalorieTarget: 2000, calculatedIdealWeight: 70, projectedWeeks: 12, weeklyGoalSummary: "Start tracking habits", monthlyGoalSummary: "Build consistency" };
    }
};

export const analyzeMedia = async (media: { data: string; mimeType: string }, userProfile?: UserProfile): Promise<FoodAnalysisResult> => {
  try {
    const userContext = userProfile ? `User Context: Goal is ${userProfile.goal}, Weight: ${userProfile.weight}kg. Daily Target: ${userProfile.dailyCalorieTarget}. Medical: ${userProfile.medicalProfile.conditions.join(', ')}` : "";
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ inlineData: { mimeType: media.mimeType, data: media.data } }, { text: `${FOOD_ANALYSIS_PROMPT} ${userContext}` }] },
      config: { responseMimeType: 'application/json', responseSchema: FOOD_SCHEMA, systemInstruction: COACH_PERSONA }
    });
    if (response.text) return cleanAndParseJSON(response.text) as FoodAnalysisResult;
    throw new Error("No data returned from Gemini");
  } catch (error) {
    console.error("Error analyzing media:", error);
    throw error;
  }
};

export const analyzeTextFood = async (textDescription: string, userProfile?: UserProfile, targetLanguage: Language = 'en'): Promise<FoodAnalysisResult> => {
    try {
        const targetLangName = getLanguageFullName(targetLanguage);
        const userContext = userProfile ? `User Context: Goal is ${userProfile.goal}, Weight: ${userProfile.weight}kg. Daily Target: ${userProfile.dailyCalorieTarget}.` : "";
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: `User Description: "${textDescription}". \n${TEXT_FOOD_ANALYSIS_PROMPT}\n${userContext}\nRespond strictly in ${targetLangName}.` }] },
            config: { responseMimeType: 'application/json', responseSchema: FOOD_SCHEMA, systemInstruction: COACH_PERSONA }
        });
        if (response.text) return cleanAndParseJSON(response.text) as FoodAnalysisResult;
        throw new Error("No data returned from Gemini");
    } catch (e) {
        console.error("Error analyzing text food", e);
        throw e;
    }
};

export const refineFoodAnalysis = async (originalAnalysis: FoodAnalysisResult, correction: string, userProfile?: UserProfile, originalImage?: string): Promise<FoodAnalysisResult> => {
  try {
     const userContext = userProfile ? `User Context: Goal is ${userProfile.goal}, Weight: ${userProfile.weight}kg.` : "";
     const parts = [];
     if (originalImage) {
         const match = originalImage.match(/^data:(.*);base64,(.*)$/);
         if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
     }
     parts.push({ text: `${REFINED_FOOD_ANALYSIS_PROMPT} PREVIOUS ANALYSIS: ${JSON.stringify(originalAnalysis)} USER CORRECTION: "${correction}" ${userContext}` });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: { responseMimeType: 'application/json', responseSchema: FOOD_SCHEMA, systemInstruction: COACH_PERSONA }
    });
    if (response.text) return cleanAndParseJSON(response.text) as FoodAnalysisResult;
    throw new Error("Failed to refine analysis");
  } catch (error) {
    console.error("Error refining food:", error);
    throw error;
  }
};

export const generateDailyPlan = async (userProfile: UserProfile, foodHistory: FoodLogEntry[], activityHistory: ActivityLogEntry[], moodHistory: MoodLog[], weightHistory: WeightLogEntry[], waterLog: { date: string, amount: number }, sleepHistory: {date: string, hours: number}[], appContext: AppContext, targetLanguage: Language, currentPlan: DailyPlan | null): Promise<DailyPlan> => {
    const context = generateUserContextString(userProfile, foodHistory, activityHistory, moodHistory, weightHistory, waterLog, sleepHistory, appContext, currentPlan, targetLanguage);
    const targetLangName = getLanguageFullName(targetLanguage);
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
            summary: { type: Type.STRING, description: `A highly empathetic summary in ${targetLangName}, referencing their neural/hormonal state.` },
            bioLoadSnapshot: {
                type: Type.OBJECT,
                properties: {
                    neuralBattery: { type: Type.NUMBER },
                    hormonalStress: { type: Type.STRING, enum: ['low', 'moderate', 'high'] },
                    physicalRecovery: { type: Type.NUMBER }
                }
            },
            items: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING },
                        time: { type: Type.STRING, description: "24h format HH:MM" },
                        type: { type: Type.STRING, enum: ['meal', 'workout', 'hydration', 'sleep', 'work_break'] },
                        title: { type: Type.STRING, description: `Title in ${targetLangName}` },
                        description: { type: Type.STRING, description: `Description in ${targetLangName}` },
                        completed: { type: Type.BOOLEAN },
                        linkedAction: { type: Type.STRING, enum: ['log_food', 'start_sleep', 'log_water'] },
                        priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] }
                    },
                    required: ["time", "type", "title", "description", "priority"]
                }
            }
        },
        required: ["date", "summary", "items", "bioLoadSnapshot"]
    };
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: `${DAILY_PLAN_PROMPT}\n\n${context}` }] },
        config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
    });
    if (response.text) {
        const newPlan = cleanAndParseJSON(response.text) as DailyPlan;
        if (currentPlan && currentPlan.date === newPlan.date) {
            const historyItems = currentPlan.items.filter(item => item.completed || item.skipped);
            const futureItems = newPlan.items.filter(newItem => {
                const isDuplicate = historyItems.some(oldItem => oldItem.time === newItem.time || oldItem.title === newItem.title);
                return !isDuplicate;
            });
            const mergedItems = [...historyItems, ...futureItems].sort((a, b) => a.time.localeCompare(b.time));
            newPlan.items = mergedItems;
        }
        return newPlan;
    }
    throw new Error("Failed to generate plan");
};

export const generateDailyWrapUp = async (dailyPlan: DailyPlan, dailyFoodLogs: FoodLogEntry[], dailyActivityLogs: ActivityLogEntry[], waterAmount: number, sleepHours: number, targetLanguage: Language): Promise<DailyWrapUp> => {
    const targetLangName = getLanguageFullName(targetLanguage);
    const dataSummary = {
        plan: dailyPlan.items.map(i => ({ title: i.title, type: i.type, status: i.completed ? 'completed' : i.skipped ? 'skipped' : 'missed' })),
        food: dailyFoodLogs.map(f => ({ name: f.food.foodName, cals: f.food.macros.calories })),
        activity: dailyActivityLogs.map(a => ({ name: a.name, cals: a.caloriesBurned, duration: a.durationMinutes })),
        water: waterAmount,
        sleep: sleepHours
    };
    const prompt = `${DAILY_WRAPUP_PROMPT} DATA SUMMARY: ${JSON.stringify(dataSummary, null, 2)} TARGET LANGUAGE: ${targetLangName}.`;
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            date: { type: Type.STRING },
            aiScore: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            comparison: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        category: { type: Type.STRING },
                        planned: { type: Type.STRING },
                        actual: { type: Type.STRING },
                        status: { type: Type.STRING, enum: ['hit', 'miss', 'partial'] }
                    },
                    required: ["category", "planned", "actual", "status"]
                }
            },
            tomorrowFocus: { type: Type.STRING }
        },
        required: ["date", "aiScore", "summary", "comparison", "tomorrowFocus"]
    };
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
    });
    if (response.text) return cleanAndParseJSON(response.text) as DailyWrapUp;
    throw new Error("Failed to generate wrap up");
};

export const analyzeSleepSession = async (
    movementLog: { timestamp: number; intensity: number }[],
    audioLog: { timestamp: number; level: number }[],
    targetLanguage: Language = 'en'
): Promise<Omit<SleepSession, 'id' | 'startTime' | 'endTime' | 'durationMinutes' | 'movementLog' | 'audioLog'>> => {
    const targetLangName = getLanguageFullName(targetLanguage);
    const sampledMovement = movementLog.length > 50 
        ? movementLog.filter((_, i) => i % Math.ceil(movementLog.length / 50) === 0)
        : movementLog;
    const logString = `
    MOVEMENT LOG (0-10, High=Restless):
    ${sampledMovement.map(l => `${new Date(l.timestamp).toLocaleTimeString()}: ${l.intensity.toFixed(2)}`).join('\n')}
    `;
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            efficiencyScore: { type: Type.NUMBER, description: "0-100 score" },
            aiAnalysis: { type: Type.STRING, description: `Analyze stillness patterns. Explain if sleep was fragmented or deep based on movement gaps. RESPOND IN ${targetLangName}.` },
            stages: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        stage: { type: Type.STRING, enum: ['Deep', 'Light', 'REM', 'Awake'] },
                        startTime: { type: Type.STRING },
                        endTime: { type: Type.STRING },
                        duration: { type: Type.NUMBER }
                    },
                    required: ["stage", "startTime", "endTime", "duration"]
                }
            }
        },
        required: ["efficiencyScore", "aiAnalysis", "stages"]
    };
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [{ text: `${SLEEP_ANALYSIS_PROMPT}\n\nTARGET LANGUAGE: ${targetLangName}\n\nLOGS:\n${logString}` }]
        },
        config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
    });
    if (response.text) return cleanAndParseJSON(response.text);
    throw new Error("Failed to analyze sleep");
};

export const createChatSession = (userProfile: UserProfile, foodHistory: FoodLogEntry[], moodHistory: MoodLog[], weightHistory: WeightLogEntry[], appContext: AppContext, dailyPlan: DailyPlan | null, mode: 'personal' | 'general') => {
  let finalInstruction = COACH_PERSONA;
  if (mode === 'personal') {
      const mockWater = { date: new Date().toDateString(), amount: 0 }; 
      const mockActivity: ActivityLogEntry[] = [];
      const sleepMock = [{date: 'today', hours: 7}];
      const dynamicContext = generateUserContextString(userProfile, foodHistory, mockActivity, moodHistory, weightHistory, mockWater, sleepMock, appContext, dailyPlan);
      finalInstruction = `${COACH_PERSONA}\n\n${dynamicContext}`;
  } else {
      finalInstruction = `${COACH_PERSONA}\n\nCONTEXT: The user is asking a GENERAL question. Do not refer to their specific stats, logs, or plans. Just give expert general advice.`;
  }
  return ai.chats.create({ model: 'gemini-flash-lite-latest', config: { systemInstruction: finalInstruction } });
};

export const summarizeHistory = async (existingSummary: string, oldFoodLogs: FoodLogEntry[], oldMoodLogs: MoodLog[], oldWeightLogs: WeightLogEntry[]): Promise<string> => {
    if (oldFoodLogs.length === 0 && oldMoodLogs.length === 0 && oldWeightLogs.length === 0) return existingSummary;
    const dataDump = `EXISTING SUMMARY: "${existingSummary}" NEW DATA: Food: ${oldFoodLogs.length} items. Mood: ${oldMoodLogs.map(m => m.mood).join(', ')}. Weight: ${oldWeightLogs.map(w => w.weight + 'kg').join(' -> ')}.`;
    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: `${SUMMARIZATION_PROMPT}\n\nDATA:\n${dataDump}` }] }, config: { responseMimeType: 'text/plain' } });
    return response.text || existingSummary;
};

export const detectFridgeIngredients = async (media: { data: string; mimeType: string }): Promise<string[]> => {
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            detectedIngredients: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["detectedIngredients"]
    };
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ inlineData: { mimeType: media.mimeType, data: media.data } }, { text: INGREDIENTS_DETECTION_PROMPT }] },
        config: { responseMimeType: 'application/json', responseSchema: schema }
    });

    if (response.text) {
        const res = cleanAndParseJSON(response.text) as FridgeIngredientsResult;
        return res.detectedIngredients;
    }
    throw new Error("Ingredient detection failed");
};

export const generateFridgeRecipes = async (ingredients: string[], mood: CookingMood, userProfile: UserProfile, targetLanguage: Language): Promise<Recipe[]> => {
    const targetLangName = getLanguageFullName(targetLanguage);
    const userContext = `
    User Origin (Heritage): ${userProfile.culinaryIdentity.origin}
    User Location: ${userProfile.culinaryIdentity.residence}
    Cooking Mood: ${mood.toUpperCase()}
    Medical Profile: ${userProfile.medicalProfile.conditions.join(', ')}
    Target Language: ${targetLangName}
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            recipes: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        calories: { type: Type.NUMBER },
                        protein: { type: Type.NUMBER },
                        prepTime: { type: Type.STRING },
                        ingredientsUsed: { type: Type.ARRAY, items: { type: Type.STRING } },
                        missingIngredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                        instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        chefNote: { type: Type.STRING, description: "Explain why this fits the user's heritage/location/mood." }
                    },
                    required: ["name", "calories", "protein", "prepTime", "ingredientsUsed", "instructions", "chefNote"]
                }
            }
        },
        required: ["recipes"]
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: `${RECIPE_GENERATION_PROMPT}\n\nINGREDIENTS: ${ingredients.join(', ')}\n\nCONTEXT: ${userContext}` }] },
        config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
    });

    if (response.text) {
        const res = cleanAndParseJSON(response.text);
        return res.recipes;
    }
    throw new Error("Recipe generation failed");
};

export const analyzeFridge = async (media: { data: string; mimeType: string }, userProfile: UserProfile): Promise<any> => {
    const ingredients = await detectFridgeIngredients(media);
    const recipes = await generateFridgeRecipes(ingredients, 'balanced', userProfile, 'en');
    return { detectedIngredients: ingredients, recipes };
};
