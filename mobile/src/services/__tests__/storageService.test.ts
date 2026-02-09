import storage from '../storageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

describe('StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // StorageService keeps an in-memory cache across calls; clear it for test isolation.
    storage.clearCache();
  });

  describe('set', () => {
    it('should store data as JSON', async () => {
      const testData = { name: 'John', age: 30 };
      await storage.set('test_key', testData);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'test_key',
        JSON.stringify(testData)
      );
    });

    it('should handle errors gracefully', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Storage full'));

      await expect(storage.set('test', {})).resolves.not.toThrow();
    });
  });

  describe('secure store (USER key)', () => {
    it('should store USER data in SecureStore', async () => {
      const testUser = { name: 'Alice' };
      await storage.set(storage.keys.USER, testUser as any);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        storage.keys.USER,
        JSON.stringify(testUser)
      );
    });

    it('should read USER data from SecureStore', async () => {
      const testUser = { name: 'Bob' };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(testUser));

      const result = await storage.get(storage.keys.USER);
      expect(result).toEqual(testUser);
    });
  });

  describe('get', () => {
    it('should retrieve and parse JSON data', async () => {
      const testData = { name: 'John', age: 30 };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(testData));

      const result = await storage.get('test_key');
      expect(result).toEqual(testData);
    });

    it('should return null for non-existent keys', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle malformed JSON', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('invalid json');

      const result = await storage.get('test');
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove item from storage', async () => {
      await storage.remove('test_key');

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('test_key');
    });
  });

  describe('clear', () => {
    it('should clear all storage', async () => {
      await storage.clear();

      expect(AsyncStorage.clear).toHaveBeenCalled();
    });
  });

  describe('storage keys', () => {
    it('should have all required keys defined', () => {
      expect(storage.keys.USER).toBe('ls_user');
      expect(storage.keys.FOOD).toBe('ls_food');
      expect(storage.keys.MOOD).toBe('ls_mood');
      expect(storage.keys.WEIGHT).toBe('ls_weight');
      expect(storage.keys.ACTIVITY).toBe('ls_activity');
      expect(storage.keys.DAILY_PLAN).toBe('ls_daily_plan');
      expect(storage.keys.SLEEP_HISTORY).toBe('ls_sleep_history');
      expect(storage.keys.WATER).toBe('ls_water');
      expect(storage.keys.SAVED_MEALS).toBe('ls_saved_meals');
    });
  });
});
