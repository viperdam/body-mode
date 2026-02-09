import { getLocalDateKey, parseTimeToMinutes } from '../../utils/dateUtils';

describe('Date Utils', () => {
    describe('getLocalDateKey', () => {
        it('formats date correctly as YYYY-MM-DD', () => {
            const date = new Date(2023, 10, 15); // Month is 0-indexed: 10 = November
            expect(getLocalDateKey(date)).toBe('2023-11-15');
        });

        it('pads single digit months and days', () => {
            const date = new Date(2023, 0, 5); // January 5th
            expect(getLocalDateKey(date)).toBe('2023-01-05');
        });
    });

    describe('parseTimeToMinutes', () => {
        it('converts HH:MM to total minutes', () => {
            expect(parseTimeToMinutes('01:30')).toBe(90);
            expect(parseTimeToMinutes('00:00')).toBe(0);
            expect(parseTimeToMinutes('23:59')).toBe(23 * 60 + 59);
        });
    });
});
