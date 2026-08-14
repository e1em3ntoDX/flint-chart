import { describe, it, expect } from 'vitest';
import { binHistogram } from '../../src/devexpress/transforms';

describe('binHistogram', () => {
    it('bins values into labelled buckets with counts', () => {
        const rows = [{ v: 1 }, { v: 2 }, { v: 2 }, { v: 9 }];
        const result = binHistogram(rows, 'v', 4);
        expect(result.reduce((sum, r) => sum + (r.count as number), 0)).toBe(4);
        expect(result.every((r) => typeof r.bin === 'string')).toBe(true);
    });

    it('places the maximum value in the last bin rather than overflowing', () => {
        const result = binHistogram([{ v: 0 }, { v: 10 }], 'v', 2);
        expect(result).toHaveLength(2);
        expect(result[1].count).toBe(1);
    });

    it('ignores non-numeric and null values', () => {
        const result = binHistogram([{ v: 1 }, { v: null }, { v: 'x' }], 'v', 2);
        expect(result.reduce((sum, r) => sum + (r.count as number), 0)).toBe(1);
    });

    it('returns a single bin when every value is identical', () => {
        const result = binHistogram([{ v: 5 }, { v: 5 }], 'v', 5);
        expect(result).toHaveLength(1);
        expect(result[0].count).toBe(2);
    });

    it('returns an empty array for no numeric input', () => {
        expect(binHistogram([{ v: null }], 'v', 5)).toEqual([]);
    });
});
