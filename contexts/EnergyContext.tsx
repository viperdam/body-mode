
import React, { createContext, useContext, useState, useEffect } from 'react';
import { MAX_ENERGY } from '../types';

interface EnergyContextType {
  energy: number;
  consumeEnergy: (amount: number) => boolean;
  rechargeEnergy: () => void;
  isAdOpen: boolean;
  triggerAd: (onSuccess?: () => void) => void;
  closeAd: (success: boolean) => void;
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
  const [adSuccessCallback, setAdSuccessCallback] = useState<(() => void) | null>(null);

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

  const triggerAd = (onSuccess?: () => void) => {
      if (onSuccess) {
          setAdSuccessCallback(() => onSuccess);
      } else {
          setAdSuccessCallback(null);
      }
      setIsAdOpen(true);
  };

  const closeAd = (success: boolean) => {
      setIsAdOpen(false);
      if (success) {
          rechargeEnergy();
          if (adSuccessCallback) {
              adSuccessCallback();
              setAdSuccessCallback(null);
          }
      } else {
          setAdSuccessCallback(null);
      }
  };

  return (
    <EnergyContext.Provider value={{ energy, consumeEnergy, rechargeEnergy, isAdOpen, triggerAd, closeAd }}>
      {children}
    </EnergyContext.Provider>
  );
};

export const useEnergy = () => useContext(EnergyContext);
