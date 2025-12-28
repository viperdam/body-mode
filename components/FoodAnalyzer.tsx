
import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { analyzeMedia, refineFoodAnalysis } from '../services/geminiService';
import { UserProfile, FoodAnalysisResult, ENERGY_COSTS } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useEnergy } from '../contexts/EnergyContext';

interface FoodAnalyzerProps {
  user: UserProfile;
  onLogFood: (food: FoodAnalysisResult) => void;
  onSaveMeal?: (food: FoodAnalysisResult) => void; // New Prop
  onCancel: () => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export const FoodAnalyzer: React.FC<FoodAnalyzerProps> = ({ user, onLogFood, onSaveMeal, onCancel }) => {
  const { t } = useLanguage();
  const { consumeEnergy, triggerAd } = useEnergy();
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [analyzing, setAnalyzing] = useState(false);
  const [refining, setRefining] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  
  // Editing State
  const [editedFood, setEditedFood] = useState<FoodAnalysisResult | null>(null);
  const [textCorrection, setTextCorrection] = useState('');
  const [showTextCorrection, setShowTextCorrection] = useState(false);
  
  // New: Add Side Item Logic
  const [addItemText, setAddItemText] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);

  // New: Save to Favorites Checkbox
  const [saveToFavorites, setSaveToFavorites] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (result) {
        setEditedFood(result);
    }
  }, [result]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 1. GATE THE ANALYSIS BEFORE IT STARTS
      // If we don't have energy, don't even process the file yet.
      // But actually, we need the file loaded first to show preview.
      // So we will gate the *analyze* call, but show preview immediately.
      
      const isVideo = file.type.startsWith('video/');
      setMediaType(isVideo ? 'video' : 'image');
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setMediaPreview(base64); // Store base64 immediately for sending later
        startAnalysisFlow(base64, file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysisFlow = (base64: string, mimeType: string) => {
      // THE GATE: Check Energy
      if (consumeEnergy(ENERGY_COSTS.FOOD_SCAN)) {
          analyze(base64, mimeType);
      } else {
          // Trigger Ad
          triggerAd(() => {
              // On success (Energy recharged)
              // Auto-start analysis
              analyze(base64, mimeType);
          });
      }
  };

  const analyze = async (base64: string, mimeType: string) => {
    setAnalyzing(true);
    try {
        const base64Data = base64.split(',')[1];
        const data = await analyzeMedia({ data: base64Data, mimeType }, user);
        setResult(data);
    } catch (e) {
        console.error(e);
        alert("Failed to analyze. Please try again.");
        setMediaPreview(null);
    } finally {
        setAnalyzing(false);
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      handleRefine(transcript);
    };

    recognition.start();
  };

  // The core function for TEXT + VISUAL correction
  const handleRefine = async (correctionText: string) => {
    if (!editedFood || !mediaPreview) return;
    setRefining(true);
    setShowTextCorrection(false);
    setShowAddItem(false);
    setTextCorrection('');
    setAddItemText('');
    
    try {
        // Pass the original image back to AI for visual re-estimation of grams/vitamins
        const refined = await refineFoodAnalysis(editedFood, correctionText, user, mediaPreview);
        setEditedFood(refined);
    } catch (e) {
        alert("Could not process correction. Please try again.");
    } finally {
        setRefining(false);
    }
  };
  
  const handleAddItem = () => {
      if (!addItemText) return;
      handleRefine(`Added item: ${addItemText}`);
  };

  const handleEditChange = (field: string, value: string | number) => {
      if (!editedFood) return;

      if (field === 'foodName') {
          setEditedFood({ ...editedFood, foodName: value as string });
      } else {
          setEditedFood({
              ...editedFood,
              macros: {
                  ...editedFood.macros,
                  [field]: Number(value)
              }
          });
      }
  };
  
  const handleFinalLog = () => {
      if (!editedFood) return;
      
      if (saveToFavorites && onSaveMeal) {
          onSaveMeal(editedFood);
      }
      onLogFood(editedFood);
  };

  if (!mediaPreview) {
    return (
      <div className="h-full flex flex-col bg-slate-950 text-white relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900 via-slate-950 to-slate-950"></div>
        
        <div className="relative z-10 flex justify-end p-6 pt-8">
            <button onClick={onCancel} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center space-y-10 p-8 relative z-10">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="absolute -inset-4 bg-indigo-500 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity animate-pulse"></div>
                <div className="w-32 h-32 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm group-hover:border-indigo-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                </div>
            </div>
            
            <div className="text-center max-w-xs">
                <h2 className="text-3xl font-bold mb-3 tracking-tight">Scan Meal</h2>
                <p className="text-slate-400 text-lg leading-relaxed">Capture a photo. Gemini AI will calculate macros, vitamins, and grams instantly.</p>
                <div className="mt-4 flex items-center justify-center space-x-2 bg-slate-900/50 p-2 rounded-lg">
                    <span className="text-xs text-indigo-300 uppercase font-bold tracking-widest">Energy Cost:</span>
                    <span className="text-xs font-bold text-white bg-indigo-600 px-2 py-0.5 rounded">{ENERGY_COSTS.FOOD_SCAN}%</span>
                </div>
            </div>
            
            <input 
                type="file" 
                accept="image/*,video/*" 
                capture="environment"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
            />
            
            <button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full max-w-xs bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-900/20 transition-all active:scale-95"
            >
                Open Camera
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 pb-safe">
      <div className="relative h-1/2 bg-black">
        {mediaType === 'video' ? (
             <video src={mediaPreview} className="w-full h-full object-cover opacity-90" autoPlay loop muted playsInline />
        ) : (
             <img src={mediaPreview} alt="Food" className="w-full h-full object-cover opacity-90" />
        )}
        
        <button onClick={onCancel} className="absolute top-6 right-6 p-3 bg-black/40 text-white rounded-full backdrop-blur-md z-20 hover:bg-black/60 transition-colors border border-white/10">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {(analyzing || refining) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-10 transition-all">
                <div className="relative mb-4">
                    <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-lg">
                        {refining ? '🧠' : '✨'}
                    </div>
                </div>
                <p className="text-white font-bold text-lg tracking-wide">
                    {refining ? 'Refining Analysis & Description...' : 'Gemini is Analyzing...'}
                </p>
            </div>
        )}
      </div>

      <div className="flex-1 bg-white dark:bg-slate-900 rounded-t-[2.5rem] -mt-10 relative z-10 p-8 overflow-y-auto shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
        {editedFood ? (
            <div className="space-y-6 animate-fade-in pb-8">
                <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex-1 mr-4">
                         <label className="text-xs font-bold text-slate-400 uppercase">Food Name</label>
                        <input 
                            type="text" 
                            value={editedFood.foodName}
                            onChange={(e) => handleEditChange('foodName', e.target.value)}
                            className="w-full bg-transparent text-2xl font-extrabold text-slate-900 dark:text-white border-b-2 border-transparent focus:border-indigo-500 outline-none pb-1"
                        />
                        <div className="flex items-center space-x-3 mt-2">
                            <span className={`text-xs px-2.5 py-1 rounded-lg font-bold border ${editedFood.healthGrade === 'A' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400' : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'}`}>
                                GRADE {editedFood.healthGrade}
                            </span>
                             <span className="text-xs font-semibold text-slate-400">Confidence: {editedFood.confidence}</span>
                             {editedFood.estimatedWeightGrams && (
                                 <span className="text-xs font-bold text-indigo-400">~{editedFood.estimatedWeightGrams}g</span>
                             )}
                        </div>
                    </div>
                </div>
                
                {/* Description & Ingredients Section */}
                <div className="space-y-3">
                    {editedFood.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 italic leading-relaxed">
                            "{editedFood.description}"
                        </p>
                    )}
                    
                    {editedFood.ingredients && editedFood.ingredients.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {editedFood.ingredients.map((ing, i) => (
                                <span key={i} className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                                    {ing}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Correction & Add Item Section */}
                {showTextCorrection ? (
                     <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-indigo-500 ring-2 ring-indigo-500/20">
                         <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">What did Gemini get wrong?</h4>
                         <textarea
                            className="w-full p-3 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none"
                            placeholder='e.g. "It is cauliflower rice, not white rice" or "It is 300g"'
                            rows={3}
                            value={textCorrection}
                            onChange={e => setTextCorrection(e.target.value)}
                         />
                         <div className="flex space-x-2 mt-3">
                             <button 
                                onClick={() => setShowTextCorrection(false)}
                                className="flex-1 py-2 text-xs font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 rounded-lg"
                             >
                                 Cancel
                             </button>
                             <button 
                                onClick={() => handleRefine(textCorrection)}
                                className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg"
                             >
                                 Refine Analysis
                             </button>
                         </div>
                     </div>
                ) : showAddItem ? (
                    // Add Side Item Panel
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-500 ring-2 ring-emerald-500/20">
                         <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mb-2">{t('add_side')}</h4>
                         <input
                            type="text"
                            className="w-full p-3 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none"
                            placeholder={t('add_item_placeholder')}
                            value={addItemText}
                            onChange={e => setAddItemText(e.target.value)}
                            autoFocus
                         />
                         <div className="flex space-x-2 mt-3">
                             <button 
                                onClick={() => setShowAddItem(false)}
                                className="flex-1 py-2 text-xs font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 rounded-lg"
                             >
                                 Cancel
                             </button>
                             <button 
                                onClick={handleAddItem}
                                className="flex-1 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg"
                             >
                                 Add & Recalculate
                             </button>
                         </div>
                     </div>
                ) : (
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <div className="flex space-x-2 w-full overflow-x-auto no-scrollbar">
                             <button 
                                onClick={startListening}
                                disabled={refining || isListening}
                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${isListening ? 'bg-red-50 text-red-600' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300'}`}
                            >
                                {isListening ? '● Listening' : '🎤 Voice Fix'}
                            </button>
                            <button 
                                onClick={() => setShowTextCorrection(true)}
                                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 whitespace-nowrap"
                            >
                                📝 Text Fix
                            </button>
                            <button 
                                onClick={() => setShowAddItem(true)}
                                className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 whitespace-nowrap"
                            >
                                ➕ Add Item
                            </button>
                        </div>
                    </div>
                )}

                {/* Edit Macros Grid */}
                <div className="grid grid-cols-4 gap-3">
                     <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-2xl text-center border border-indigo-100 dark:border-indigo-800/30">
                        <p className="text-[10px] text-indigo-400 font-bold uppercase mb-1">Cals</p>
                        <input 
                            type="number" 
                            value={editedFood.macros.calories}
                            onChange={(e) => handleEditChange('calories', e.target.value)}
                            className="w-full bg-transparent text-center font-extrabold text-indigo-700 dark:text-indigo-300 outline-none"
                        />
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Prot</p>
                         <input 
                            type="number" 
                            value={editedFood.macros.protein}
                            onChange={(e) => handleEditChange('protein', e.target.value)}
                            className="w-full bg-transparent text-center font-extrabold text-slate-800 dark:text-white outline-none"
                        />
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Carb</p>
                         <input 
                            type="number" 
                            value={editedFood.macros.carbs}
                            onChange={(e) => handleEditChange('carbs', e.target.value)}
                            className="w-full bg-transparent text-center font-extrabold text-slate-800 dark:text-white outline-none"
                        />
                    </div>
                     <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Fat</p>
                         <input 
                            type="number" 
                            value={editedFood.macros.fat}
                            onChange={(e) => handleEditChange('fat', e.target.value)}
                            className="w-full bg-transparent text-center font-extrabold text-slate-800 dark:text-white outline-none"
                        />
                    </div>
                </div>
                
                {/* Vitamins & Micros (New Display) */}
                {editedFood.macros.vitamins && editedFood.macros.vitamins.length > 0 && (
                     <div className="flex flex-wrap gap-2">
                         {editedFood.macros.vitamins.map((v, i) => (
                             <span key={i} className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-100 dark:border-emerald-800/30">
                                 {v}
                             </span>
                         ))}
                     </div>
                )}

                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                    <div className="flex items-start space-x-4">
                        <span className="text-2xl mt-1">💡</span>
                        <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200 leading-relaxed">{editedFood.advice}</p>
                    </div>
                </div>

                {/* Save to Favorites Toggle */}
                {onSaveMeal && (
                    <div className="flex items-center space-x-3 p-2">
                        <button 
                            onClick={() => setSaveToFavorites(!saveToFavorites)}
                            className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${saveToFavorites ? 'bg-orange-500 border-orange-500' : 'border-slate-400'}`}
                        >
                            {saveToFavorites && <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                        <span className="text-sm font-bold text-slate-400 cursor-pointer" onClick={() => setSaveToFavorites(!saveToFavorites)}>{t('save_favorite')}</span>
                    </div>
                )}

                <div className="flex space-x-3">
                     <button onClick={onCancel} className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        Cancel
                    </button>
                    <Button fullWidth onClick={handleFinalLog} className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-200 dark:shadow-none py-4 rounded-2xl text-lg">
                        Confirm & Log
                    </Button>
                </div>
            </div>
        ) : (
            !analyzing && (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-600 mt-8">
                     <p>Analysis failed or pending...</p>
                </div>
            )
        )}
      </div>
    </div>
  );
};
