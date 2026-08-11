import { describe, it, expect } from 'vitest';
import { pickDevExpressPalette, DEVEXPRESS_DEFAULT_CATEGORICAL_COLORS } from '../../src/devexpress/colormap';
import type { ColorDecision } from '../../src/core/color-decisions';

function decision(overrides: Partial<ColorDecision>): ColorDecision {
    return { channel: 'color', schemeType: 'categorical', primary: true, dataDriven: true, ...overrides };
}

describe('pickDevExpressPalette', () => {
    it('returns the default categorical ramp when no decision is given', () => {
        expect(pickDevExpressPalette(undefined)).toEqual(DEVEXPRESS_DEFAULT_CATEGORICAL_COLORS);
    });

    it('picks the small categorical map for a low category count', () => {
        const colors = pickDevExpressPalette(decision({ schemeType: 'categorical', categoryCount: 4 }));
        expect(colors).toEqual(DEVEXPRESS_DEFAULT_CATEGORICAL_COLORS);
    });

    it('picks the larger categorical map when the category count exceeds the small one', () => {
        const colors = pickDevExpressPalette(decision({ schemeType: 'categorical', categoryCount: 12 }));
        expect(colors.length).toBeGreaterThanOrEqual(12);
        expect(colors).not.toEqual(DEVEXPRESS_DEFAULT_CATEGORICAL_COLORS);
    });

    it('picks a sequential palette for a sequential scheme', () => {
        const colors = pickDevExpressPalette(decision({ schemeType: 'sequential' }));
        expect(colors).toEqual([
            '#440154', '#46327e', '#365c8d', '#277f8e',
            '#1fa187', '#4ac16d', '#a0da39', '#fde725',
        ]);
    });

    it('picks a diverging palette for a diverging scheme', () => {
        const colors = pickDevExpressPalette(decision({ schemeType: 'diverging', divergingMidpoint: 0 }));
        expect(colors).toEqual([
            '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7',
            '#d1e5f0', '#92c5de', '#4393c3', '#2166ac',
        ]);
    });

    it('honours an explicit schemeId over type-based auto-selection', () => {
        const colors = pickDevExpressPalette(decision({ schemeType: 'sequential', schemeId: 'dx20' }));
        expect(colors).toHaveLength(20);
    });

    it('falls back to the default ramp for an unrecognized schemeId', () => {
        const colors = pickDevExpressPalette(decision({ schemeType: 'categorical', schemeId: 'nonexistent-scheme' }));
        expect(colors).toEqual(DEVEXPRESS_DEFAULT_CATEGORICAL_COLORS);
    });
});
