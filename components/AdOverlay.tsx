import React, { useState, useEffect } from 'react';
import { useEnergy } from '../contexts/EnergyContext';
import { Button } from './Button';

export const AdOverlay: React.FC = () => {
  const { isAdOpen, closeAd } = useEnergy();
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(5); // Simulate 5s ad for demo (usually 30)
  const [canClose, setCanClose] = useState(false);
  const [status, setStatus] = useState<'loading' | 'playing' | 'rewarded'>('loading');

  useEffect(() => {
      if (!isAdOpen) {
          // Reset state when closed
          setProgress(0);
          setTimeLeft(5);
          setCanClose(false);
          setStatus('loading');
          return;
      }

      // Simulate Loading
      const loadTimer = setTimeout(() => {
          setStatus('playing');
      }, 1000);

      return () => clearTimeout(loadTimer);
  }, [isAdOpen]);

  useEffect(() => {
      if (status !== 'playing') return;

      const interval = setInterval(() => {
          setTimeLeft((prev) => {
              if (prev <= 1) {
                  clearInterval(interval);
                  setStatus('rewarded');
                  return 0;
              }
              return prev - 1;
          });
          setProgress((prev) => Math.min(100, prev + (100 / 5)));
      }, 1000);

      return () => clearInterval(interval);
  }, [status]);

  const handleSkip = () => {
      if (confirm("Skip video? You will NOT receive Energy and the action will be cancelled.")) {
          closeAd(false);
      }
  };

  const handleClaim = () => {
      closeAd(true);
  };

  if (!isAdOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-fade-in">
        {/* Ad Content Container */}
        <div className="relative w-full max-w-md aspect-[9/16] bg-slate-900 rounded-none md:rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center space-x-2">
                    <span className="px-2 py-1 bg-yellow-500 text-black text-xs font-bold rounded">Ad</span>
                    <span className="text-white text-xs shadow-black drop-shadow-md">BioSync Energy Recharging...</span>
                </div>
                {status === 'playing' ? (
                     <div className="w-8 h-8 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white text-xs font-bold">
                         {timeLeft}
                     </div>
                ) : status === 'rewarded' ? (
                    <button onClick={handleClaim} className="text-emerald-400 font-bold text-sm bg-emerald-900/50 px-3 py-1 rounded-full border border-emerald-500/50 animate-pulse">
                        CLOSE X
                    </button>
                ) : null}
            </div>

            {/* Skip Button (Bottom Left) */}
            {status === 'playing' && (
                 <button 
                    onClick={handleSkip} 
                    className="absolute top-4 right-4 text-white/50 text-[10px] bg-black/30 px-2 py-1 rounded hover:bg-black/50"
                >
                    Skip (No Reward)
                 </button>
            )}

            {/* Simulated Video Content */}
            <div className="flex-1 bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center relative">
                {/* Simulated Visuals */}
                <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                
                {status === 'loading' && (
                    <div className="flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-cyan-400 font-mono text-sm uppercase tracking-widest">Connecting to Grid...</p>
                    </div>
                )}

                {status === 'playing' && (
                     <div className="text-center space-y-6 animate-pulse">
                         <div className="text-8xl">⚡</div>
                         <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter transform -skew-x-12">
                             SUPER CHARGE
                         </h2>
                         <p className="text-indigo-200">Refilling Bio-Fuel Cells...</p>
                     </div>
                )}

                {status === 'rewarded' && (
                     <div className="text-center space-y-6 animate-bounce">
                         <div className="text-8xl">🔋</div>
                         <h2 className="text-4xl font-black text-emerald-400">100% CHARGED</h2>
                         <Button onClick={handleClaim} className="bg-emerald-500 hover:bg-emerald-400 text-white px-8 py-4 text-xl shadow-[0_0_30px_rgba(16,185,129,0.5)]">
                             RETURN TO APP
                         </Button>
                     </div>
                )}
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-slate-800 w-full">
                <div 
                    className="h-full bg-yellow-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${(5 - timeLeft) * 20}%` }}
                ></div>
            </div>
        </div>
    </div>
  );
};