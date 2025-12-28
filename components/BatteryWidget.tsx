
import React from 'react';
import { useEnergy } from '../contexts/EnergyContext';

export const BatteryWidget: React.FC = () => {
    const { energy, triggerAd } = useEnergy();

    let colorClass = 'text-emerald-500 border-emerald-500';
    let fillClass = 'bg-emerald-500';
    
    if (energy < 50) {
        colorClass = 'text-yellow-500 border-yellow-500';
        fillClass = 'bg-yellow-500';
    }
    if (energy < 20) {
        colorClass = 'text-red-500 border-red-500 animate-pulse';
        fillClass = 'bg-red-500';
    }

    const handleFuelMe = () => {
        if (energy < 100) {
             if(confirm("Watch an ad to recharge Bio-Fuel to 100%?")) {
                 triggerAd();
             }
        }
    };

    return (
        <button 
            onClick={handleFuelMe}
            className="flex items-center space-x-2 bg-slate-900/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 hover:bg-slate-800 transition-all"
        >
            <div className={`relative w-8 h-4 rounded-sm border-2 ${colorClass} p-0.5 flex items-center`}>
                <div 
                    className={`h-full ${fillClass} transition-all duration-500`} 
                    style={{ width: `${energy}%` }}
                ></div>
                {/* Battery Nipple */}
                <div className={`absolute -right-1.5 top-1/2 -translate-y-1/2 w-1 h-2 rounded-r-sm ${fillClass} opacity-50`}></div>
            </div>
            <span className={`text-xs font-bold ${colorClass.split(' ')[0]}`}>{energy}%</span>
        </button>
    );
};
