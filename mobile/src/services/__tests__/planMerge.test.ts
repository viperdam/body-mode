import { mergePlanPreservingCompletedAndPast } from '../planMerge';
import { DailyPlan, PlanItem } from '../../types';

const meal = (overrides: Partial<PlanItem> & Pick<PlanItem, 'id' | 'time'>): PlanItem => ({
  id: overrides.id,
  time: overrides.time,
  type: 'meal',
  title: overrides.title ?? 'Meal',
  description: overrides.description ?? 'desc',
  completed: overrides.completed ?? false,
  skipped: overrides.skipped ?? false,
});

const plan = (date: string, items: PlanItem[]): DailyPlan => ({
  date,
  summary: 'summary',
  items,
});

describe('mergePlanPreservingCompletedAndPast', () => {
  it('returns incoming when there is no previous plan', () => {
    const incoming = plan('2025-01-01', [meal({ id: 'a', time: '08:00' })]);
    expect(mergePlanPreservingCompletedAndPast(incoming, null)).toEqual(incoming);
  });

  it('does not merge plans from different dates', () => {
    const previous = plan('2025-01-01', [meal({ id: 'a', time: '08:00', completed: true })]);
    const incoming = plan('2025-01-02', [meal({ id: 'b', time: '12:00' })]);
    const merged = mergePlanPreservingCompletedAndPast(incoming, previous, new Date('2025-01-02T10:00:00'));
    expect(merged).toEqual(incoming);
  });

  it('preserves completed items and replaces only upcoming items', () => {
    const previous = plan('2025-01-01', [
      meal({ id: 'breakfast', time: '08:00', title: 'Breakfast', completed: true }),
      meal({ id: 'walk', time: '09:00', title: 'Walk', completed: false }),
    ]);

    const incoming = plan('2025-01-01', [
      meal({ id: 'incoming-breakfast', time: '08:00', title: 'Different Breakfast' }),
      meal({ id: 'lunch', time: '13:00', title: 'Lunch' }),
    ]);

    const merged = mergePlanPreservingCompletedAndPast(incoming, previous, new Date('2025-01-01T10:00:00'));
    expect(merged.items.map(i => i.id)).toEqual(['breakfast', 'walk', 'lunch']);
  });

  it('removes incoming items that collide with preserved time/type slots', () => {
    const previous = plan('2025-01-01', [
      meal({ id: 'done-lunch', time: '12:30', completed: true }),
    ]);

    const incoming = plan('2025-01-01', [
      meal({ id: 'incoming-lunch', time: '12:30' }),
      meal({ id: 'dinner', time: '19:00' }),
    ]);

    const merged = mergePlanPreservingCompletedAndPast(incoming, previous, new Date('2025-01-01T12:45:00'));
    expect(merged.items.map(i => i.id)).toEqual(['done-lunch', 'dinner']);
  });
});

