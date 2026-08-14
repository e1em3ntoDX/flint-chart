// flint-chart/packages/flint-js/tests/devexpress/number-format.test.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { formatValue } from '../../src/devexpress/number-format';

describe('formatValue', () => {
    it('formats a plain number with no spec using a generic grouped format', () => {
        expect(formatValue(1234.5)).toBe('1,234.5');
        expect(formatValue(7)).toBe('7');
    });

    it('passes non-numeric values through as strings, and null/undefined to empty', () => {
        expect(formatValue('gas')).toBe('gas');
        expect(formatValue(null)).toBe('');
        expect(formatValue(undefined)).toBe('');
    });

    it('applies a currency prefix with fixed decimals', () => {
        expect(formatValue(1234.5, { pattern: ',.2f', prefix: '$' })).toBe('$1,234.50');
    });

    it('applies a comma-grouped integer pattern', () => {
        expect(formatValue(12345, { pattern: ',d' })).toBe('12,345');
    });

    it('renders a fractional 0-1 value as a whole percentage', () => {
        expect(formatValue(0.453, { pattern: '.1%' })).toBe('45.3%');
    });

    it('trims a trailing zero for a ~% pattern', () => {
        expect(formatValue(0.40, { pattern: '.1~%' })).toBe('40%');
    });

    it('appends a suffix to an already-percent-shaped raw value', () => {
        expect(formatValue(45, { pattern: ',d', suffix: '%' })).toBe('45%');
    });

    it('abbreviates large values when asked', () => {
        expect(formatValue(1_500_000, { abbreviate: true, pattern: ',.1f' })).toBe('1.5M');
    });

    it('renders a negative value with a leading minus, not a trailing one', () => {
        expect(formatValue(-42.5, { pattern: ',.1f' })).toBe('-42.5');
    });
});
