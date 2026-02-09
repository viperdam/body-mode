import { calculateBioLoad } from '../bioEngine';
import { UserProfile, FoodLogEntry, ActivityLogEntry, MoodLog } from '../../types';

describe('BioEngine', () => {
  // Create a properly typed mock user matching the UserProfile interface
  const mockUser: UserProfile = {
    name: 'Test User',
    avatarId: 'default',
    age: 30,
    weight: 70,
    height: 175,
    gender: 'male',
    goal: 'maintain',
    activityLevel: 'moderate',
    planIntensity: 'normal',
    dailyCalorieTarget: 2000,
    calculatedIdealWeight: 70,
    projectedWeeks: 12,
    culinaryIdentity: {
      origin: 'US',
      residence: 'US',
    },
    maritalStatus: 'single',
    childrenCount: 0,
    medicalProfile: {
      conditions: [],
      medications: [],
      injuries: [],
      currentStatus: 'healthy',
    },
    workProfile: {
      type: 'fixed_9_5',
      intensity: 'desk',
    },
    sleepRoutine: {
      isConsistent: true,
      targetWakeTime: '07:00',
      targetBedTime: '23:00',
      targetDurationHours: 8,
      wakeWindowMinutes: 30,
    },
  };

  describe('calculateBioLoad', () => {
    it('should calculate bio load for healthy user with good sleep', () => {
      const sleepHistory = [
        { date: '2025-12-10', hours: 8 },
        { date: '2025-12-11', hours: 7.5 },
        { date: '2025-12-12', hours: 8 },
      ];
      const context = { weatherCode: 0, currentTime: '10:00' };

      const result = calculateBioLoad(mockUser, [], [], [], sleepHistory, context);

      expect(result.neuralBattery).toBeGreaterThan(60);
      expect(result.neuralBattery).toBeLessThanOrEqual(100);
      expect(result.hormonalLoad).toBeDefined();
      expect(result.physicalFatigue).toBeDefined();
      expect(result.vitaminStatus).toBeInstanceOf(Array);
    });

    it('should reduce neural battery for sleep deprivation', () => {
      const poorSleep = [
        { date: '2025-12-10', hours: 4 },
        { date: '2025-12-11', hours: 5 },
        { date: '2025-12-12', hours: 4 },
      ];
      const goodSleep = [
        { date: '2025-12-10', hours: 8 },
        { date: '2025-12-11', hours: 8 },
        { date: '2025-12-12', hours: 8 },
      ];
      const context = { weatherCode: 0, currentTime: '10:00' };

      const poorResult = calculateBioLoad(mockUser, [], [], [], poorSleep, context);
      const goodResult = calculateBioLoad(mockUser, [], [], [], goodSleep, context);

      expect(poorResult.neuralBattery).toBeLessThan(goodResult.neuralBattery);
    });

    it('should increase hormonal load for users with diabetes', () => {
      const diabeticUser: UserProfile = {
        ...mockUser,
        medicalProfile: {
          ...mockUser.medicalProfile,
          conditions: ['Diabetes Type 2'],
        },
      };
      const sleepHistory = [{ date: '2025-12-12', hours: 7 }];
      const context = { weatherCode: 0, currentTime: '10:00' };

      const healthyResult = calculateBioLoad(mockUser, [], [], [], sleepHistory, context);
      const diabeticResult = calculateBioLoad(diabeticUser, [], [], [], sleepHistory, context);

      expect(diabeticResult.hormonalLoad).toBeGreaterThan(healthyResult.hormonalLoad);
    });

    it('should increase hormonal load for stressed mood history', () => {
      const stressedMoods: MoodLog[] = [
        { id: '1', timestamp: Date.now() - 3600000, mood: 'stressed', score: 70 },
        { id: '2', timestamp: Date.now() - 7200000, mood: 'stressed', score: 65 },
      ];
      const happyMoods: MoodLog[] = [
        { id: '1', timestamp: Date.now() - 3600000, mood: 'happy', score: 85 },
        { id: '2', timestamp: Date.now() - 7200000, mood: 'energetic', score: 90 },
      ];
      const sleepHistory = [{ date: '2025-12-12', hours: 7 }];
      const context = { weatherCode: 0, currentTime: '10:00' };

      const stressedResult = calculateBioLoad(mockUser, [], [], stressedMoods, sleepHistory, context);
      const happyResult = calculateBioLoad(mockUser, [], [], happyMoods, sleepHistory, context);

      expect(stressedResult.hormonalLoad).toBeGreaterThan(happyResult.hormonalLoad);
    });

    it('should increase physical fatigue for high activity', () => {
      const activeHistory: ActivityLogEntry[] = [
        {
          id: '1',
          timestamp: Date.now() - 3600000,
          name: 'Running',
          durationMinutes: 60,
          caloriesBurned: 600,
          intensity: 'high',
        },
        {
          id: '2',
          timestamp: Date.now() - 86400000,
          name: 'Weight Training',
          durationMinutes: 45,
          caloriesBurned: 400,
          intensity: 'high',
        },
      ];
      const sleepHistory = [{ date: '2025-12-12', hours: 7 }];
      const context = { weatherCode: 0, currentTime: '10:00' };

      const activeResult = calculateBioLoad(mockUser, [], activeHistory, [], sleepHistory, context);
      const sedentaryResult = calculateBioLoad(mockUser, [], [], [], sleepHistory, context);

      expect(activeResult.physicalFatigue).toBeGreaterThan(sedentaryResult.physicalFatigue);
    });

    it('should add social drain for users with children', () => {
      const parentUser: UserProfile = {
        ...mockUser,
        childrenCount: 2,
        maritalStatus: 'married',
      };
      const sleepHistory = [{ date: '2025-12-12', hours: 7 }];
      const context = { weatherCode: 0, currentTime: '10:00' };

      const result = calculateBioLoad(parentUser, [], [], [], sleepHistory, context);

      expect(result.socialDrain).toBeGreaterThan(0);
    });

    it('should detect vitamin warnings for poor diet', () => {
      const junkFood: FoodLogEntry[] = [
        {
          id: '1',
          timestamp: Date.now(),
          food: {
            foodName: 'Pizza',
            description: 'Pepperoni pizza',
            ingredients: ['cheese', 'pepperoni', 'dough'],
            macros: { calories: 500, protein: 15, carbs: 50, fat: 25 },
            healthGrade: 'C',
            confidence: 'High',
            advice: 'Consider adding vegetables',
          },
        },
      ];
      const sleepHistory = [{ date: '2025-12-12', hours: 5 }]; // Poor sleep to trigger warnings
      const context = { weatherCode: 0, currentTime: '10:00' };

      const result = calculateBioLoad(mockUser, junkFood, [], [], sleepHistory, context);

      expect(result.vitaminStatus.length).toBeGreaterThan(0);
    });
  });
});
