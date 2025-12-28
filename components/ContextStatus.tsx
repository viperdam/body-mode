
import React from 'react';
import { UserContextState } from '../types';

interface ContextStatusProps {
    context: UserContextState;
}

export const ContextStatus: React.FC<ContextStatusProps> = ({ context }) => {
    let icon = '';
    let label = '';
    let colorClass = '';

    switch(context) {
        case 'driving':
            icon = '🚗';
            label = 'Driving Mode';
            colorClass = 'bg-orange-500/20 text-orange-400 border-orange-500/30';
            break;
        case 'running':
            icon = '🏃';
            label = 'Running';
            colorClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            break;
        case 'walking':
            icon = '🚶';
            label = 'Walking';
            colorClass = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            break;
        case 'sleeping':
            icon = '😴';
            label = 'Sleeping';
            colorClass = 'bg-violet-500/20 text-violet-400 border-violet-500/30';
            break;
        default:
            return null; // Don't show if idle
    }

    return (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[60] px-4 py-2 rounded-full border backdrop-blur-md flex items-center space-x-2 animate-fade-in ${colorClass}`}>
            <span className="text-xl animate-pulse">{icon}</span>
            <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        </div>
    );
};
