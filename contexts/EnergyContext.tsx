
import React, { createContext, useContext, useState, useEffect } from 'react';
import { MAX_ENERGY } from '../types';

type AdResult = 'rewarded' | 'failed' | 'skipped';

interface AdCallbacks {
  onReward?: () => void;
  onFail?: () => void;
}

interface EnergyContextType {
  energy: number;
  consumeEnergy: (amount: number) => boolean;
  rechargeEnergy: () => void;
  isAdOpen: boolean;
  triggerAd: (callbacks?: AdCallbacks) => void;
  closeAd: (result: AdResult) => void;
}

const EnergyContext = createContext<EnergyContextType>({
  energy: 100,
  consumeEnergy: () => false,
  rechargeEnergy: () => {},
  isAdOpen: false,
  triggerAd: () => {},
  closeAd: () => {}
});

export const EnergyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [energy, setEnergy] = useState<number>(() => {
      const saved = localStorage.getItem('ls_energy');
      return saved ? parseInt(saved, 10) : 100; // Start full
  });

  const [isAdOpen, setIsAdOpen] = useState(false);
  const [adCallbacks, setAdCallbacks] = useState<AdCallbacks | null>(null);

  useEffect(() => {
      localStorage.setItem('ls_energy', energy.toString());
  }, [energy]);

  // Attempt to use energy. Returns true if successful, false if needs recharge.
  const consumeEnergy = (amount: number): boolean => {
      if (energy >= amount) {
          setEnergy(prev => prev - amount);
          return true;
      }
      return false;
  };

  const rechargeEnergy = () => {
      setEnergy(MAX_ENERGY);
  };

  const triggerAd = (callbacks?: AdCallbacks) => {
      setAdCallbacks(callbacks || null);
      setIsAdOpen(true);
  };

  const closeAd = (result: AdResult) => {
      setIsAdOpen(false);
      if (result === 'rewarded') {
          rechargeEnergy();
          adCallbacks?.onReward?.();
      } else if (result === 'failed') {
          adCallbacks?.onFail?.();
      }
      setAdCallbacks(null);
  };

  return (
    <EnergyContext.Provider value={{ energy, consumeEnergy, rechargeEnergy, isAdOpen, triggerAd, closeAd }}>
      {children}
    </EnergyContext.Provider>
  );
};

export const useEnergy = () => useContext(EnergyContext);
