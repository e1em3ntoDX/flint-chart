import { describe, it, expect } from 'vitest';
import { binHistogram, rollupCategories } from '../../src/devexpress/transforms';

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

    it('handles an array larger than the argument-spread limit', () => {
        // Math.min(...values)/Math.max(...values) throws RangeError past V8's
        // ~65536-125000 call-argument limit, which a 200k-row table exceeds by
        // a comfortable margin without shrinking below that ceiling.
        const rows = Array.from({ length: 200_000 }, (_, i) => ({ v: i % 1000 }));
        expect(() => binHistogram(rows, 'v')).not.toThrow();
        const bins = binHistogram(rows, 'v');
        expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(200_000);
    }, 20_000);
});

describe('rollupCategories', () => {
    it('sums repeated categories into one row each', () => {
        const rows = [
            { region: 'North', sales: 10 },
            { region: 'North', sales: 15 },
            { region: 'South', sales: 20 },
        ];
        expect(rollupCategories(rows, 'region', 'sales')).toEqual([
            { region: 'North', sales: 25 },
            { region: 'South', sales: 20 },
        ]);
    });

    it('is a no-op on data that is already one row per category', () => {
        const rows = [{ region: 'North', sales: 25 }, { region: 'South', sales: 20 }];
        expect(rollupCategories(rows, 'region', 'sales')).toEqual(rows);
    });

    it('falls back to first-appearance order when no canonical order is supplied', () => {
        const rows = [{ size: 'L', n: 3 }, { size: 'S', n: 1 }];
        expect(rollupCategories(rows, 'size', 'n').map((r) => r.size)).toEqual(['L', 'S']);
    });

    it('orders rows by the supplied canonical order, appending unknowns after in first-appearance order', () => {
        const rows = [
            { size: 'L', n: 3 }, { size: 'XL', n: 4 }, { size: 'S', n: 1 }, { size: 'M', n: 2 },
        ];
        const result = rollupCategories(rows, 'size', 'n', ['S', 'M', 'L']);
        expect(result.map((r) => r.size)).toEqual(['S', 'M', 'L', 'XL']);
    });

    it('treats a non-numeric or null value as 0 rather than NaN, so a bad row cannot poison a slice total', () => {
        const rows = [
            { region: 'North', sales: 'oops' },
            { region: 'North', sales: 5 },
            { region: 'South', sales: null },
        ];
        expect(rollupCategories(rows, 'region', 'sales')).toEqual([
            { region: 'North', sales: 5 },
            { region: 'South', sales: 0 },
        ]);
    });

    it('skips rows whose category value is null or undefined', () => {
        const rows = [{ region: null, sales: 5 }, { region: 'North', sales: 10 }];
        expect(rollupCategories(rows, 'region', 'sales')).toEqual([{ region: 'North', sales: 10 }]);
    });
});
