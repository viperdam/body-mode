
import React from 'react';
import { ViewState } from '../types';

interface NavigationProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
}

const NavIcon = ({ active, children, label }: { active: boolean; children?: React.ReactNode; label: string }) => (
  <div className={`flex flex-col items-center justify-center space-y-1 transition-all duration-300 ${active ? 'text-white scale-110' : 'text-slate-500 hover:text-slate-300'}`}>
    {children}
    {/* Label removed for cleaner look on small screens, or could be kept visible only on active */}
  </div>
);

export const Navigation: React.FC<NavigationProps> = ({ currentView, onNavigate }) => {
  if (currentView === 'onboarding' || currentView === 'welcome') return null;

  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4">
      <div className="glass-panel px-6 py-4 rounded-[2.5rem] flex items-center justify-between w-full max-w-sm shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-white/10 bg-midnight-800/80">
        <button onClick={() => onNavigate('dashboard')} className="p-2">
          <NavIcon active={currentView === 'dashboard'} label="Home">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={currentView === 'dashboard' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </NavIcon>
        </button>

        <button onClick={() => onNavigate('sleep')} className="p-2">
          <NavIcon active={currentView === 'sleep'} label="Sleep">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={currentView === 'sleep' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.35 2.15a.5.5 0 0 1 .63.66A9 9 0 1 0 17 15.66a.5.5 0 0 1 .66.63A11 11 0 0 1 2 12a11 11 0 0 1 10.35-9.85z"/></svg>
          </NavIcon>
        </button>

        {/* Floating Camera Button - Lifted */}
        <div className="relative -top-8 group">
            <div className="absolute inset-0 bg-indigo-500 rounded-full blur opacity-50 group-hover:opacity-80 transition-opacity duration-300"></div>
            <button 
                onClick={() => onNavigate('camera')}
                className="relative bg-gradient-to-tr from-indigo-500 to-violet-600 h-16 w-16 rounded-full flex items-center justify-center text-white shadow-2xl shadow-indigo-500/40 transform transition-all duration-200 active:scale-90 group-hover:-translate-y-1 border-4 border-midnight-900"
            >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            </button>
        </div>

        <button onClick={() => onNavigate('coach')} className="p-2">
          <NavIcon active={currentView === 'coach'} label="Coach">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={currentView === 'coach' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </NavIcon>
        </button>
        
        <button onClick={() => onNavigate('settings')} className="p-2">
            <NavIcon active={currentView === 'settings'} label="Settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={currentView === 'settings' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </NavIcon>
        </button>
      </div>
    </div>
  );
};
