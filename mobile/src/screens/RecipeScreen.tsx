import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
    Alert,
    Share,
    ActivityIndicator,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import storage from '../services/storageService';
import { DailyPlan, FoodAnalysisResult, FoodLogEntry, MacroNutrients, MealRecipe, Recipe, SavedMeal } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';
import { notifyFoodLogged } from '../services/planEventService';
import { analytics } from '../services/analyticsService';
import { useLanguage } from '../contexts/LanguageContext';

type RecipeRouteProp = RouteProp<RootStackParamList, 'Recipe'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Recipe'>;

const toRoundedMacros = (macros?: Partial<MacroNutrients>): MacroNutrients => ({
    calories: Math.round(macros?.calories ?? 0),
    protein: Math.round(macros?.protein ?? 0),
    carbs: Math.round(macros?.carbs ?? 0),
    fat: Math.round(macros?.fat ?? 0),
});

const buildMealRecipeShareText = (
    recipe: MealRecipe,
    sourceTitle: string | undefined,
    t: (key: string, options?: Record<string, any>) => string
) => {
    const lines: string[] = [];
    lines.push(t('recipe.share.title', { name: recipe.name }));
    if (sourceTitle && sourceTitle !== recipe.name) {
        lines.push(t('recipe.share.from', { source: sourceTitle }));
    }
    lines.push('');
    if (recipe.ingredients?.length) {
        lines.push(t('recipe.share.ingredients'));
        recipe.ingredients.forEach(i => lines.push(`- ${i}`));
        lines.push('');
    }
    if (recipe.steps?.length) {
        lines.push(t('recipe.share.steps'));
        recipe.steps.forEach((s, idx) => lines.push(`${idx + 1}. ${s}`));
        lines.push('');
    }
    if (recipe.tips) {
        lines.push(t('recipe.share.tip', { tip: recipe.tips }));
        lines.push('');
    }
    if (recipe.macros) {
        const m = toRoundedMacros(recipe.macros);
        lines.push(
            t('recipe.share.macros', {
                calories: m.calories,
                protein: m.protein,
                carbs: m.carbs,
                fat: m.fat,
            })
        );
    }
    return lines.join('\n').trim();
};

const buildFridgeRecipeShareText = (
    recipe: Recipe,
    t: (key: string, options?: Record<string, any>) => string
) => {
    const lines: string[] = [];
    lines.push(t('recipe.share.title', { name: recipe.name }));
    lines.push(
        t('recipe.share.prep', {
            prep: recipe.prepTime,
            calories: Math.round(recipe.calories),
            protein: Math.round(recipe.protein),
        })
    );
    lines.push('');

    if (recipe.ingredientsUsed?.length) {
        lines.push(t('recipe.share.ingredients_used'));
        recipe.ingredientsUsed.forEach(i => lines.push(`- ${i}`));
        lines.push('');
    }

    if (recipe.missingIngredients?.length) {
        lines.push(t('recipe.share.missing_ingredients'));
        recipe.missingIngredients.forEach(i => lines.push(`- ${i}`));
        lines.push('');
    }

    if (recipe.instructions?.length) {
        lines.push(t('recipe.share.instructions'));
        recipe.instructions.forEach((s, idx) => lines.push(`${idx + 1}. ${s}`));
        lines.push('');
    }

    if (recipe.chefNote) {
        lines.push(t('recipe.share.chef_note', { note: recipe.chefNote }));
    }

    return lines.join('\n').trim();
};

const RecipeScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<RecipeRouteProp>();
    const params = route.params;
    const { t } = useLanguage();

    const [isSaving, setIsSaving] = useState(false);
    const [isLogging, setIsLogging] = useState(false);
    const [isMarkingDone, setIsMarkingDone] = useState(false);
    const [isSavingFridge, setIsSavingFridge] = useState(false);
    const [savedFridgeRecipes, setSavedFridgeRecipes] = useState<Recipe[]>([]);

    const todayKey = useMemo(() => getLocalDateKey(new Date()), []);

    const isMealRecipe = params.kind === 'meal';
    const mealRecipe = isMealRecipe ? params.recipe : null;
    const sourceTitle = isMealRecipe ? params.sourceTitle : undefined;
    const originPlanDateKey = isMealRecipe ? params.planDateKey : undefined;
    const originPlanItemId = isMealRecipe ? params.planItemId : undefined;
    const canUpdatePlan = !!originPlanDateKey && !!originPlanItemId && originPlanDateKey === todayKey;

    const isFridgeRecipe = params.kind === 'fridge';
    const fridgeRecipe = isFridgeRecipe ? params.recipe : null;
    const isFridgeSaved = useMemo(() => {
        if (!isFridgeRecipe || !fridgeRecipe) return false;
        return savedFridgeRecipes.some(r => r.name === fridgeRecipe.name);
    }, [fridgeRecipe, isFridgeRecipe, savedFridgeRecipes]);

    useEffect(() => {
        if (!isFridgeRecipe) return;
        void (async () => {
            const existing = (await storage.get<Recipe[]>(storage.keys.SAVED_RECIPES)) || [];
            setSavedFridgeRecipes(existing);
        })();
    }, [isFridgeRecipe]);

    const shareRecipe = async () => {
        try {
            const message = isMealRecipe
                ? buildMealRecipeShareText(params.recipe, params.sourceTitle, t)
                : isFridgeRecipe
                    ? buildFridgeRecipeShareText((params as any).recipe as Recipe, t)
                    : t('recipe.share.fallback', {
                        name: (params as any).recipe?.name || t('recipe.header.title')
                    });

            analytics.logEvent('recipe_share', { source: isFridgeRecipe ? 'fridge' : 'meal' });
            await Share.share({ message });
        } catch (error) {
            console.error('Share failed:', error);
            Alert.alert(t('recipe.alert.share_title'), t('recipe.alert.share_body'));
            analytics.logEvent('recipe_share_failed', { source: isFridgeRecipe ? 'fridge' : 'meal' });
        }
    };

    const toggleSaveFridgeRecipe = async () => {
        if (!isFridgeRecipe || !fridgeRecipe) return;
        setIsSavingFridge(true);
        try {
            const existing = (await storage.get<Recipe[]>(storage.keys.SAVED_RECIPES)) || [];
            const already = existing.some(r => r.name === fridgeRecipe.name);
            const next = already
                ? existing.filter(r => r.name !== fridgeRecipe.name)
                : [...existing, fridgeRecipe];
            await storage.set(storage.keys.SAVED_RECIPES, next);
            setSavedFridgeRecipes(next);
            Alert.alert(
                already ? t('recipe.alert.removed_title') : t('recipe.alert.saved_title'),
                already ? t('recipe.alert.removed_body') : t('recipe.alert.saved_body')
            );
            analytics.logEvent('recipe_saved_toggle', { saved: !already, source: 'fridge' });
        } catch (error) {
            console.error('Save fridge recipe failed:', error);
            Alert.alert(t('recipe.alert.save_failed_title'), t('recipe.alert.save_failed_body'));
            analytics.logEvent('recipe_saved_failed', { source: 'fridge' });
        } finally {
            setIsSavingFridge(false);
        }
    };

    const saveToFavorites = async () => {
        if (!isMealRecipe) return;
        setIsSaving(true);
        try {
            const existing = (await storage.get<SavedMeal[]>(storage.keys.SAVED_MEALS)) || [];
            const macros = toRoundedMacros(mealRecipe?.macros);
            const next: SavedMeal[] = [
                ...existing,
                {
                    id: `fav-${Date.now()}`,
                    name: mealRecipe?.name || t('recipe.fallback_name'),
                    macros,
                    healthGrade: 'B',
                },
            ];
            await storage.set(storage.keys.SAVED_MEALS, next);
            Alert.alert(t('recipe.alert.favorite_saved_title'), t('recipe.alert.favorite_saved_body'));
            analytics.logEvent('recipe_favorite_saved', { source: 'meal' });
        } catch (error) {
            console.error('Save recipe failed:', error);
            Alert.alert(t('recipe.alert.save_failed_title'), t('recipe.alert.save_failed_body'));
            analytics.logEvent('recipe_favorite_failed', { source: 'meal' });
        } finally {
            setIsSaving(false);
        }
    };

    const markPlanItemDone = async (options?: { silent?: boolean }) => {
        if (!canUpdatePlan || !originPlanDateKey || !originPlanItemId) return;
        const silent = !!options?.silent;
        if (!silent) setIsMarkingDone(true);
        try {
            const planKey = `${storage.keys.DAILY_PLAN}_${originPlanDateKey}`;
            const plan = await storage.get<DailyPlan>(planKey);
            if (!plan) {
                if (!silent) {
                    Alert.alert(t('recipe.alert.plan_missing_title'), t('recipe.alert.plan_missing_body'));
                }
                return;
            }
            const nowTs = Date.now();
            const updatedItems = (plan.items || []).map(item =>
                item.id === originPlanItemId
                    ? { ...item, completed: true, skipped: false, completedAt: nowTs, skippedAt: undefined }
                    : item
            );
            const updatedPlan: DailyPlan = { ...plan, items: updatedItems, updatedAt: nowTs };
            await storage.set(planKey, updatedPlan);
            await storage.set(storage.keys.DAILY_PLAN, updatedPlan);
            if (!silent) {
                Alert.alert(t('recipe.alert.done_title'), t('recipe.alert.done_body'));
            }
        } catch (error) {
            console.error('Mark done failed:', error);
            if (!silent) Alert.alert(t('alert.error'), t('recipe.alert.plan_update_failed'));
        } finally {
            if (!silent) setIsMarkingDone(false);
        }
    };

    const logMealFromRecipe = async () => {
        if (!isMealRecipe || !mealRecipe) return;
        setIsLogging(true);
        try {
            const macros = toRoundedMacros(mealRecipe.macros);
            const result: FoodAnalysisResult = {
                foodName: mealRecipe.name,
                description: sourceTitle
                    ? t('recipe.log.description_with_source', { source: sourceTitle })
                    : t('recipe.log.description'),
                ingredients: mealRecipe.ingredients || [],
                macros,
                confidence: 'Medium',
                healthGrade: 'B',
                advice: mealRecipe.tips
                    ? t('recipe.log.tip', { tip: mealRecipe.tips })
                    : t('recipe.log.default_advice'),
            };

            const existing = (await storage.get<FoodLogEntry[]>(storage.keys.FOOD)) || [];
            const entry: FoodLogEntry = {
                id: `food-${Date.now()}`,
                timestamp: Date.now(),
                food: result,
            };
            await storage.set(storage.keys.FOOD, [...existing, entry]);
            await notifyFoodLogged(entry);

            if (canUpdatePlan) {
                await markPlanItemDone({ silent: true });
            }

            analytics.logEvent('recipe_meal_logged', { source: 'meal' });
            Alert.alert(
                t('recipe.alert.logged_title'),
                t('recipe.alert.logged_body', { meal: mealRecipe.name }),
                [
                    { text: t('recipe.alert.logged_back'), onPress: () => navigation.goBack() },
                    { text: t('recipe.alert.logged_stay'), style: 'cancel' },
                ]
            );
        } catch (error) {
            console.error('Log meal failed:', error);
            Alert.alert(t('alert.error'), t('recipe.alert.log_failed'));
            analytics.logEvent('recipe_meal_log_failed', { source: 'meal' });
        } finally {
            setIsLogging(false);
        }
    };

    if (isFridgeRecipe && fridgeRecipe) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
                        <Ionicons name="arrow-back" size={22} color="#06b6d4" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('recipe.header.title')}</Text>
                    <TouchableOpacity style={styles.headerBtn} onPress={shareRecipe}>
                        <Ionicons name="share-social" size={22} color="#06b6d4" />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    <Text style={styles.recipeName}>{fridgeRecipe.name}</Text>

                    <View style={styles.macroRow}>
                        <MacroChip label={fridgeRecipe.prepTime} />
                        <MacroChip label={t('recipe.macro.calories', { calories: Math.round(fridgeRecipe.calories) })} />
                        <MacroChip label={t('recipe.macro.protein_short', { protein: Math.round(fridgeRecipe.protein) })} />
                    </View>

                    <View style={styles.actionsRow}>
                        <TouchableOpacity
                            style={[styles.actionBtn, isSavingFridge && styles.actionBtnDisabled]}
                            disabled={isSavingFridge}
                            onPress={toggleSaveFridgeRecipe}
                        >
                            {isSavingFridge ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text style={styles.actionBtnText}>{isFridgeSaved ? t('recipe.action.saved') : t('recipe.action.save')}</Text>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => navigation.goBack()}>
                            <Text style={styles.actionBtnPrimaryText}>{t('back')}</Text>
                        </TouchableOpacity>
                    </View>

                    {!!fridgeRecipe.ingredientsUsed?.length && (
                        <Section title={t('recipe.section.ingredients_available')}>
                            {fridgeRecipe.ingredientsUsed.map((ing, idx) => (
                                <Text key={`${idx}-${ing}`} style={styles.bulletText}>- {ing}</Text>
                            ))}
                        </Section>
                    )}

                    {!!fridgeRecipe.missingIngredients?.length && (
                        <Section title={t('recipe.section.missing')}>
                            {fridgeRecipe.missingIngredients.map((ing, idx) => (
                                <Text key={`${idx}-${ing}`} style={styles.bulletText}>- {ing}</Text>
                            ))}
                        </Section>
                    )}

                    <Section title={t('recipe.section.instructions')}>
                        {fridgeRecipe.instructions?.length ? (
                            fridgeRecipe.instructions.map((step, idx) => (
                                <View key={`${idx}-${step}`} style={styles.stepRow}>
                                    <View style={styles.stepNumber}>
                                        <Text style={styles.stepNumberText}>{idx + 1}</Text>
                                    </View>
                                    <Text style={styles.stepText}>{step}</Text>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.mutedText}>{t('recipe.empty.instructions')}</Text>
                        )}
                    </Section>

                    {!!fridgeRecipe.chefNote && (
                        <Section title={t('recipe.section.chef_note')}>
                            <Text style={styles.tipText}>{fridgeRecipe.chefNote}</Text>
                        </Section>
                    )}
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (!isMealRecipe || !mealRecipe) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
                        <Ionicons name="arrow-back" size={22} color="#06b6d4" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('recipe.header.title')}</Text>
                    <View style={styles.headerBtn} />
                </View>
                <View style={styles.emptyState}>
                    <Ionicons name="restaurant-outline" size={52} color="rgba(255,255,255,0.7)" style={styles.emptyIcon} />
                    <Text style={styles.emptyText}>{t('recipe.empty.no_data')}</Text>
                </View>
            </SafeAreaView>
        );
    }

    const macros = mealRecipe.macros ? toRoundedMacros(mealRecipe.macros) : null;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={22} color="#06b6d4" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('recipe.header.title')}</Text>
                <TouchableOpacity style={styles.headerBtn} onPress={shareRecipe}>
                    <Ionicons name="share-social" size={22} color="#06b6d4" />
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={styles.recipeName}>{mealRecipe.name}</Text>
                {!!sourceTitle && sourceTitle !== mealRecipe.name && (
                    <Text style={styles.sourceText}>{t('recipe.source', { source: sourceTitle })}</Text>
                )}

                {macros && (
                    <View style={styles.macroRow}>
                        <MacroChip label={t('recipe.macro.calories', { calories: macros.calories })} />
                        <MacroChip label={t('recipe.macro.protein_short', { protein: macros.protein })} />
                        <MacroChip label={t('recipe.macro.carbs_short', { carbs: macros.carbs })} />
                        <MacroChip label={t('recipe.macro.fat_short', { fat: macros.fat })} />
                    </View>
                )}

                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={[styles.actionBtn, isSaving && styles.actionBtnDisabled]}
                        disabled={isSaving}
                        onPress={saveToFavorites}
                    >
                        {isSaving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.actionBtnText}>{t('recipe.action.save')}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionBtnPrimary, isLogging && styles.actionBtnDisabled]}
                        disabled={isLogging}
                        onPress={logMealFromRecipe}
                    >
                        {isLogging ? <ActivityIndicator color="#020617" /> : <Text style={styles.actionBtnPrimaryText}>{t('recipe.action.log_meal')}</Text>}
                    </TouchableOpacity>
                </View>

                {canUpdatePlan && (
                    <TouchableOpacity
                        style={[styles.planBtn, isMarkingDone && styles.actionBtnDisabled]}
                        disabled={isMarkingDone}
                        onPress={() => markPlanItemDone()}
                    >
                        {isMarkingDone ? <ActivityIndicator color="#22c55e" /> : <Text style={styles.planBtnText}>{t('recipe.action.mark_done')}</Text>}
                    </TouchableOpacity>
                )}

                <Section title={t('recipe.section.ingredients')}>
                    {mealRecipe.ingredients?.length ? (
                        mealRecipe.ingredients.map((ing, idx) => (
                            <Text key={`${idx}-${ing}`} style={styles.bulletText}>- {ing}</Text>
                        ))
                    ) : (
                        <Text style={styles.mutedText}>{t('recipe.empty.ingredients')}</Text>
                    )}
                </Section>

                <Section title={t('recipe.section.steps')}>
                    {mealRecipe.steps?.length ? (
                        mealRecipe.steps.map((step, idx) => (
                            <View key={`${idx}-${step}`} style={styles.stepRow}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>{idx + 1}</Text>
                                </View>
                                <Text style={styles.stepText}>{step}</Text>
                            </View>
                        ))
                    ) : (
                        <Text style={styles.mutedText}>{t('recipe.empty.steps')}</Text>
                    )}
                </Section>

                {!!mealRecipe.tips && (
                    <Section title={t('recipe.section.tip')}>
                        <Text style={styles.tipText}>{mealRecipe.tips}</Text>
                    </Section>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const MacroChip: React.FC<{ label: string }> = ({ label }) => (
    <View style={styles.macroChip}>
        <Text style={styles.macroChipText}>{label}</Text>
    </View>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {children}
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)',
        backgroundColor: '#020617',
    },
    headerBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
    scroll: {
        flex: 1,
    },
    content: {
        padding: 18,
        paddingBottom: 40,
    },
    recipeName: {
        color: '#ffffff',
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 6,
    },
    sourceText: {
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 14,
        fontSize: 13,
        fontWeight: '600',
    },
    macroRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 14,
    },
    macroChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.25)',
    },
    macroChipText: {
        color: '#06b6d4',
        fontWeight: '700',
        fontSize: 12,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    actionBtn: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    actionBtnPrimary: {
        flex: 1,
        backgroundColor: '#06b6d4',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    actionBtnDisabled: {
        opacity: 0.6,
    },
    actionBtnText: {
        color: '#ffffff',
        fontWeight: '700',
    },
    actionBtnPrimaryText: {
        color: '#020617',
        fontWeight: '800',
    },
    planBtn: {
        backgroundColor: 'rgba(34, 197, 94, 0.12)',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.25)',
        marginBottom: 16,
    },
    planBtnText: {
        color: '#22c55e',
        fontWeight: '800',
    },
    section: {
        marginTop: 14,
        padding: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    sectionTitle: {
        color: '#ffffff',
        fontWeight: '800',
        marginBottom: 10,
        fontSize: 14,
    },
    bulletText: {
        color: 'rgba(255,255,255,0.85)',
        marginBottom: 6,
        lineHeight: 20,
    },
    mutedText: {
        color: 'rgba(255,255,255,0.6)',
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 10,
        gap: 10,
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    stepNumberText: {
        color: '#06b6d4',
        fontWeight: '800',
        fontSize: 12,
    },
    stepText: {
        flex: 1,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 20,
    },
    tipText: {
        color: '#22c55e',
        fontWeight: '700',
        lineHeight: 20,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    emptyIcon: {
        fontSize: 52,
        marginBottom: 12,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
});

export default RecipeScreen;