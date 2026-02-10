
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, ChatMessage, FoodLogEntry, MoodLog, WeightLogEntry, AppContext, DailyPlan, ENERGY_COSTS } from '../types';
import { createChatSession } from '../services/geminiService';
import { useEnergy } from '../contexts/EnergyContext';
import { useLanguage } from '../contexts/LanguageContext';

interface AICoachProps {
  user: UserProfile;
  foodHistory: FoodLogEntry[];
  moodHistory: MoodLog[];
  weightHistory: WeightLogEntry[];
  appContext: AppContext;
  dailyPlan: DailyPlan | null;
  onBack?: () => void; // New Prop
}

export const AICoach: React.FC<AICoachProps> = ({ user, foodHistory, moodHistory, weightHistory, appContext, dailyPlan, onBack }) => {
  const { consumeEnergy, triggerAd } = useEnergy();
  const { t } = useLanguage();
  const [chatMode, setChatMode] = useState<'initial' | 'personal' | 'general'>('initial');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatSessionRef = useRef<{ sendMessage: (params: { message: string }) => Promise<{ text: string | null }> } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Chat based on Selection
  const startChat = (mode: 'personal' | 'general') => {
      setChatMode(mode);
      setIsTyping(true);

      // Initialize Gemini Chat
      chatSessionRef.current = createChatSession(
          user, 
          foodHistory, 
          moodHistory, 
          weightHistory, 
          appContext, 
          dailyPlan,
          mode
      );

      // Add Welcome Message
      setTimeout(() => {
          let welcomeText = "";
          if (mode === 'personal') {
              welcomeText = `I've analyzed your plan for today. I see what you've done and what's pending. How can I help you adjust or stay on track?`;
          } else {
              welcomeText = `I'm ready to answer any general questions about fitness, nutrition, or sleep science. What's on your mind?`;
          }

          setMessages([{
              id: 'init',
              role: 'model',
              text: welcomeText,
              timestamp: Date.now()
          }]);
          setIsTyping(false);
      }, 600);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || !chatSessionRef.current) return;

    // GATE: Check Energy
    if (!consumeEnergy(ENERGY_COSTS.COACH_CHAT)) {
        triggerAd({
            onReward: () => {
                // After Ad, auto-send for better UX
                performSend();
            },
            onFail: () => {
                // Ad failed; continue without recharge, energy unchanged
                performSend();
            }
        });
        return;
    }

    performSend();
  };

  const performSend = async () => {
    if (!input.trim() || !chatSessionRef.current) return;

    const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text: input,
        timestamp: Date.now()
      };
  
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsTyping(true);
  
      try {
        const result = await chatSessionRef.current.sendMessage({ message: userMsg.text });
        
        const modelMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: result.text || "I'm having trouble thinking right now.",
          timestamp: Date.now()
        };
        
        setMessages(prev => [...prev, modelMsg]);
      } catch (e) {
        console.error(e);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          text: "Sorry, I lost connection. Please try again.",
          timestamp: Date.now()
        }]);
      } finally {
        setIsTyping(false);
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 shadow-sm z-10 sticky top-0">
        <div className="flex items-center space-x-4 max-w-md mx-auto">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-800 transition-colors text-slate-800 dark:text-white">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                🤖
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
          </div>
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white text-lg">{t('coach_name')}</h2>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium">Synced: {appContext.weather.temp}°C {appContext.weather.condition}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Selection or Chat Area */}
      {chatMode === 'initial' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8 animate-fade-in">
              <div className="text-center space-y-2">
                  <div className="text-6xl mb-4">👋</div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('coach_greeting')}</h2>
                  <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto">{t('coach_choose_mode')}</p>
              </div>

              <div className="w-full max-w-sm space-y-4">
                  <button 
                    onClick={() => startChat('personal')}
                    className="w-full bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border-2 border-slate-100 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all group text-left relative overflow-hidden"
                  >
                      <div className="absolute right-0 top-0 w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                      <span className="text-3xl mb-2 block">👤</span>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white">{t('personal_advice')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {t('personal_advice_desc')}
                      </p>
                  </button>

                  <button 
                    onClick={() => startChat('general')}
                    className="w-full bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border-2 border-slate-100 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all group text-left relative overflow-hidden"
                  >
                       <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-50 dark:bg-emerald-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                      <span className="text-3xl mb-2 block">🌍</span>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white">{t('general_question')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {t('general_question_desc')}
                      </p>
                  </button>
              </div>
          </div>
      ) : (
          <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-6">
            <div className="max-w-md mx-auto w-full space-y-6">
                {messages.map((msg) => (
                <div 
                    key={msg.id} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                    <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'} items-end space-x-2`}>
                        {msg.role === 'model' && (
                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-sm flex-shrink-0">
                                🤖
                            </div>
                        )}
                        <div 
                            className={`p-4 rounded-2xl shadow-sm ${
                                msg.role === 'user' 
                                ? 'bg-indigo-600 text-white rounded-br-none' 
                                : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
                            }`}
                        >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        </div>
                    </div>
                </div>
                ))}
                {isTyping && (
                <div className="flex justify-start">
                    <div className="flex items-end space-x-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-sm flex-shrink-0">
                            🤖
                        </div>
                        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-2xl rounded-bl-none shadow-sm flex space-x-1.5">
                            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                        </div>
                    </div>
                </div>
                )}
                <div ref={messagesEndRef} />
            </div>
          </div>
      )}

      {/* Input - Only show if mode selected */}
      {chatMode !== 'initial' && (
          <div className="fixed bottom-20 left-0 right-0 p-4 pointer-events-none bg-gradient-to-t from-slate-50 via-slate-50 to-transparent dark:from-slate-950 dark:via-slate-950">
             <div className="pointer-events-auto max-w-md mx-auto bg-white dark:bg-slate-800 p-2 rounded-[2rem] shadow-xl shadow-indigo-900/5 border border-slate-100 dark:border-slate-700 flex items-center space-x-2 pl-4">
                <input 
                    type="text" 
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder={t('type_message')}
                    className="flex-1 py-3 outline-none text-slate-800 dark:text-white bg-transparent placeholder:text-slate-400"
                    autoFocus
                />
                <button 
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping}
                    className="p-3 bg-indigo-600 dark:bg-indigo-500 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed transform transition-all active:scale-90 hover:bg-indigo-700"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
             </div>
             <p className="text-center text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-widest">
                {t('chat_cost')}: {ENERGY_COSTS.COACH_CHAT}% {t('energy')}
             </p>
          </div>
      )}
    </div>
  );
};
