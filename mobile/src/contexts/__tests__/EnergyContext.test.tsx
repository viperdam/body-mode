import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { EnergyProvider, useEnergy } from '../EnergyContext';
import { ENERGY_COSTS } from '../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { energyService } from '../../services/energyService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

// Mock AdOverlay component
jest.mock('../../components', () => ({
  AdOverlay: () => null,
}));

describe('EnergyContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    energyService.__resetForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EnergyProvider>{children}</EnergyProvider>
  );

  it('should initialize with maximum energy', async () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });

    await waitFor(() => {
      expect(result.current.energy).toBe(100);
      expect(result.current.maxEnergy).toBe(100);
    });
  });

  it('should consume energy correctly', async () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });

    await waitFor(() => {
      expect(result.current.energy).toBe(100);
    });

    act(() => {
      const success = result.current.consumeEnergy(ENERGY_COSTS.FOOD_ANALYSIS);
      expect(success).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.energy).toBe(100 - ENERGY_COSTS.FOOD_ANALYSIS);
    });
  });

  it('should not consume energy if insufficient', async () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });

    await waitFor(() => {
      expect(result.current.energy).toBe(100);
    });

    act(() => {
      // Drain energy
      result.current.consumeEnergy(95);
    });

    await waitFor(() => {
      expect(result.current.energy).toBe(5);
    });

    act(() => {
      const success = result.current.consumeEnergy(ENERGY_COSTS.FOOD_ANALYSIS);
      expect(success).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.energy).toBe(5); // Should remain unchanged
    });
  });

  it('should check if can afford correctly', async () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });

    await waitFor(() => {
      expect(result.current.canAfford(ENERGY_COSTS.CHAT_MESSAGE)).toBe(true);
      expect(result.current.canAfford(150)).toBe(false);
    });
  });

  it('should recharge energy to max', async () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });

    await waitFor(() => {
      expect(result.current.energy).toBe(100);
    });

    act(() => {
      result.current.consumeEnergy(50);
    });

    await waitFor(() => {
      expect(result.current.energy).toBe(50);
    });

    act(() => {
      result.current.rechargeEnergy();
    });

    await waitFor(() => {
      expect(result.current.energy).toBe(100);
    });
  });

  it('should provide recharge time estimate', async () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });

    await waitFor(() => {
      expect(result.current.getRechargeTime()).toBe('Full');
    });

    act(() => {
      result.current.consumeEnergy(60);
    });

    await waitFor(() => {
      const timeEstimate = result.current.getRechargeTime();
      expect(timeEstimate).not.toBe('Full');
      expect(timeEstimate).toMatch(/\d+h|Soon/);
    });
  });

  it('should load energy from storage on mount', async () => {
    const savedEnergy = {
      energy: 75,
      lastRecharge: Date.now() - 1000,
    };

    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(savedEnergy));

    const { result } = renderHook(() => useEnergy(), { wrapper });

    await waitFor(() => {
      expect(result.current.energy).toBe(75);
    });
  });

  it('should save energy to storage when changed', async () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });

    await waitFor(() => {
      expect(result.current.energy).toBe(100);
    });

    act(() => {
      result.current.consumeEnergy(20);
    });

    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });
});
