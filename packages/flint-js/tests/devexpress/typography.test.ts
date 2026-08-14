// flint-chart/packages/flint-js/tests/devexpress/typography.test.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { resolveTypeRole } from '../../src/devexpress/typography';

describe('resolveTypeRole', () => {
    it('is undefined when the role itself is absent', () => {
        expect(resolveTypeRole(undefined)).toBeUndefined();
    });

    it('resolves a design-token size string to its real pixel value', () => {
        // The Economist preset's real type.headline (core/theme/presets/economist.ts):
        // { family: "'Helvetica Neue', Helvetica, Arial, sans-serif", size: "text.300", weight: "bold" }
        const font = resolveTypeRole({
            family: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            size: 'text.300',
            weight: 'bold',
        });
        expect(font).toEqual({
            family: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            size: 14,
            weight: 700,
        });
    });

    it('passes a raw numeric size through unchanged', () => {
        expect(resolveTypeRole({ size: 18 })).toEqual({ size: 18 });
    });

    it('resolves a partial TypeRole, leaving unset fields unset (Economist\'s real type.deck)', () => {
        // core/theme/presets/economist.ts's real type.deck: { size: "text.200", color: "#54585a" }
        const font = resolveTypeRole({ size: 'text.200', color: '#54585a' });
        expect(font).toEqual({ size: 12, color: '#54585a' });
        expect(font).not.toHaveProperty('family');
        expect(font).not.toHaveProperty('weight');
    });

    it('maps every weight name to its numeric value', () => {
        expect(resolveTypeRole({ weight: 'regular' })?.weight).toBe(400);
        expect(resolveTypeRole({ weight: 'medium' })?.weight).toBe(500);
        expect(resolveTypeRole({ weight: 'semibold' })?.weight).toBe(600);
        expect(resolveTypeRole({ weight: 'bold' })?.weight).toBe(700);
    });

    it('ignores style and case — neither has a DevExtreme font-object equivalent', () => {
        const font = resolveTypeRole({ style: 'italic', case: 'upper', color: '#000' });
        expect(font).toEqual({ color: '#000' });
    });

    it('falls back to a numeric parse for an unrecognized token string', () => {
        expect(resolveTypeRole({ size: '22' })).toEqual({ size: 22 });
    });

    it('drops an unresolvable size token entirely rather than emitting NaN', () => {
        expect(resolveTypeRole({ size: 'text.doesnotexist', color: '#111' })).toEqual({ color: '#111' });
    });
});
