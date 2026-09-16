import { describe, it, expect } from 'vitest';
import {
    dxGetTemplateDef, dxSupportedChartTypes, assertNoFacets, assertRequiredChannels,
} from '../../src/devexpress/templates';

describe('assertNoFacets', () => {
    it('passes when no facet channel is present', () => {
        expect(() => assertNoFacets({ x: { field: 'a' }, y: { field: 'b' } })).not.toThrow();
    });
    it('rejects a column channel', () => {
        expect(() => assertNoFacets({ x: { field: 'a' }, column: { field: 'c' } }))
            .toThrow(/Faceting is not supported/);
    });
    it('rejects a row channel', () => {
        expect(() => assertNoFacets({ row: { field: 'r' } })).toThrow(/Faceting is not supported/);
    });
});

describe('registry', () => {
    it('exposes the twelve round-one chart types for devextreme', () => {
        expect(dxSupportedChartTypes('devextreme').sort()).toEqual([
            'Area Chart', 'Bar Chart', 'Candlestick Chart', 'Connected Scatter Plot',
            'Donut Chart', 'Grouped Bar Chart', 'Histogram', 'Line Chart',
            'Pie Chart', 'Range Area Chart', 'Scatter Plot', 'Stacked Bar Chart',
        ]);
    });
    it('resolves a supported type', () => {
        expect(dxGetTemplateDef('Bar Chart', 'devextreme')?.chart).toBe('Bar Chart');
    });
    it('does not resolve a rejected type', () => {
        expect(dxGetTemplateDef('Violin Plot', 'devextreme')).toBeUndefined();
    });
});

describe('assertRequiredChannels', () => {
    it('rejects a candlestick missing close', () => {
        const def = dxGetTemplateDef('Candlestick Chart', 'devextreme')!;
        expect(() => assertRequiredChannels(def, {
            x: { field: 'd' }, open: { field: 'o' }, high: { field: 'h' }, low: { field: 'l' },
        })).toThrow(/requires channel close/);
    });
    it('accepts a complete candlestick', () => {
        const def = dxGetTemplateDef('Candlestick Chart', 'devextreme')!;
        expect(() => assertRequiredChannels(def, {
            x: { field: 'd' }, open: { field: 'o' }, high: { field: 'h' },
            low: { field: 'l' }, close: { field: 'c' },
        })).not.toThrow();
    });
});
