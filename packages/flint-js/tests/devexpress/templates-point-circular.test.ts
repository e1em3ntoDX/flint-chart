import { describe, it, expect } from 'vitest';
import { dxGetTemplateDef } from '../../src/devexpress/templates';
import type { DevExpressChartPlan } from '../../src/devexpress/plan';
import type { InstantiateContext } from '../../src/core/types';

function draft(): Partial<DevExpressChartPlan> {
    return { series: [], titles: [], warnings: [], unsupported: [] };
}

function context(overrides: Partial<InstantiateContext>): InstantiateContext {
    return {
        channelSemantics: {},
        layout: {} as never,
        table: [],
        resolvedEncodings: {},
        encodings: {},
        canvasSize: { width: 400, height: 320 },
        semanticTypes: {},
        chartType: 'Scatter Plot',
        ...overrides,
    } as InstantiateContext;
}

describe('Scatter Plot template', () => {
    const scatterContext = (extra: Partial<InstantiateContext> = {}) => context({
        channelSemantics: {
            x: { field: 'weight', type: 'quantitative' } as never,
            y: { field: 'mpg', type: 'quantitative' } as never,
        },
        encodings: { x: { field: 'weight' }, y: { field: 'mpg' } },
        table: [{ weight: 2000, mpg: 30 }],
        ...extra,
    });

    it('uses Point with numerical axes', () => {
        const def = dxGetTemplateDef('Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, scatterContext());
        expect(plan.series![0].viewType).toBe('Point');
        expect(plan.series![0].argumentScaleType).toBe('Numerical');
        expect(plan.series![0].markerKind).toBe('Circle');
    });

    it('upgrades to Bubble when size is bound', () => {
        const def = dxGetTemplateDef('Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, scatterContext({
            channelSemantics: {
                x: { field: 'weight', type: 'quantitative' } as never,
                y: { field: 'mpg', type: 'quantitative' } as never,
                size: { field: 'hp', type: 'quantitative' } as never,
            },
            encodings: { x: { field: 'weight' }, y: { field: 'mpg' }, size: { field: 'hp' } },
        }));
        expect(plan.series![0].viewType).toBe('Bubble');
        expect(plan.series![0].valueFields).toEqual(['mpg', 'hp']);
    });

    it('splits by a nominal color channel into one series per category with a visible legend', () => {
        const def = dxGetTemplateDef('Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, scatterContext({
            channelSemantics: {
                x: { field: 'weight', type: 'quantitative' } as never,
                y: { field: 'mpg', type: 'quantitative' } as never,
                color: { field: 'origin', type: 'nominal' } as never,
            },
            encodings: { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } },
            table: [
                { weight: 1.6, mpg: 32, origin: 'JP' },
                { weight: 3.4, mpg: 18, origin: 'US' },
                { weight: 2.1, mpg: 27, origin: 'EU' },
            ],
        }));
        expect(plan.series!.map((s) => s.name).sort()).toEqual(['EU', 'JP', 'US']);
        expect(plan.series!.every((s) => s.viewType === 'Point' && s.markerKind === 'Circle')).toBe(true);
        expect(plan.legend!.visible).toBe(true);
    });

    it('rejects a color channel on a Bubble series out loud instead of dropping it', () => {
        const def = dxGetTemplateDef('Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, scatterContext({
            channelSemantics: {
                x: { field: 'weight', type: 'quantitative' } as never,
                y: { field: 'mpg', type: 'quantitative' } as never,
                size: { field: 'hp', type: 'quantitative' } as never,
                color: { field: 'origin', type: 'nominal' } as never,
            },
            encodings: {
                x: { field: 'weight' }, y: { field: 'mpg' }, size: { field: 'hp' }, color: { field: 'origin' },
            },
        }));
        expect(plan.series).toHaveLength(1);
        expect(plan.series![0].viewType).toBe('Bubble');
        const note = plan.unsupported!.find((n) => n.feature === 'color');
        expect(note).toBeDefined();
        expect(note!.action).toBe('rejected');
        // No split happened, so a legend would label nothing — it must stay off.
        expect(plan.legend!.visible).toBe(false);
    });

    it('rejects an opacity channel out loud instead of dropping it', () => {
        const def = dxGetTemplateDef('Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, scatterContext({
            channelSemantics: {
                x: { field: 'weight', type: 'quantitative' } as never,
                y: { field: 'mpg', type: 'quantitative' } as never,
                opacity: { field: 'hp', type: 'quantitative' } as never,
            },
            encodings: { x: { field: 'weight' }, y: { field: 'mpg' }, opacity: { field: 'hp' } },
        }));
        const note = plan.unsupported!.find((n) => n.feature === 'opacity');
        expect(note).toBeDefined();
        expect(note!.action).toBe('rejected');
    });
});

describe('Connected Scatter Plot template', () => {
    it('uses ScatterLine', () => {
        const def = dxGetTemplateDef('Connected Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Connected Scatter Plot',
            channelSemantics: {
                x: { field: 'gdp', type: 'quantitative' } as never,
                y: { field: 'life', type: 'quantitative' } as never,
            },
            encodings: { x: { field: 'gdp' }, y: { field: 'life' } },
            table: [{ gdp: 1, life: 60 }],
        }));
        expect(plan.series![0].viewType).toBe('ScatterLine');
    });

    it('splits by a nominal color channel into one series per category with a visible legend', () => {
        const def = dxGetTemplateDef('Connected Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Connected Scatter Plot',
            channelSemantics: {
                x: { field: 'gdp', type: 'quantitative' } as never,
                y: { field: 'life', type: 'quantitative' } as never,
                color: { field: 'continent', type: 'nominal' } as never,
            },
            encodings: { x: { field: 'gdp' }, y: { field: 'life' }, color: { field: 'continent' } },
            table: [
                { gdp: 1, life: 60, continent: 'Asia' },
                { gdp: 2, life: 70, continent: 'Europe' },
            ],
        }));
        expect(plan.series!.map((s) => s.name).sort()).toEqual(['Asia', 'Europe']);
        expect(plan.series!.every((s) => s.viewType === 'ScatterLine')).toBe(true);
        expect(plan.legend!.visible).toBe(true);
    });
});

describe('Histogram template', () => {
    it('replaces the data with materialised bins and plots counts', () => {
        const def = dxGetTemplateDef('Histogram', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Histogram',
            channelSemantics: { x: { field: 'v', type: 'quantitative' } as never },
            encodings: { x: { field: 'v' } },
            table: [{ v: 1 }, { v: 2 }, { v: 8 }, { v: 9 }],
        }));
        expect(plan.series![0].viewType).toBe('Bar');
        expect(plan.series![0].argumentField).toBe('bin');
        expect(plan.series![0].valueFields).toEqual(['count']);
        expect(plan.series![0].argumentScaleType).toBe('Qualitative');
        expect(plan.data!.points.every((p) => 'bin' in p && 'count' in p)).toBe(true);
    });

    it('capitalizes the count series name', () => {
        const def = dxGetTemplateDef('Histogram', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Histogram',
            channelSemantics: { x: { field: 'v', type: 'quantitative' } as never },
            encodings: { x: { field: 'v' } },
            table: [{ v: 1 }, { v: 2 }],
        }));
        expect(plan.series![0].name).toBe('Count');
    });
});

describe('Candlestick Chart template', () => {
    it('emits four value fields in OHLC order', () => {
        const def = dxGetTemplateDef('Candlestick Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Candlestick Chart',
            channelSemantics: {
                x: { field: 'date', type: 'temporal' } as never,
                open: { field: 'o', type: 'quantitative' } as never,
                high: { field: 'h', type: 'quantitative' } as never,
                low: { field: 'l', type: 'quantitative' } as never,
                close: { field: 'c', type: 'quantitative' } as never,
            },
            encodings: {
                x: { field: 'date' }, open: { field: 'o' }, high: { field: 'h' },
                low: { field: 'l' }, close: { field: 'c' },
            },
            table: [{ date: '2026-01-01', o: 1, h: 3, l: 0.5, c: 2 }],
        }));
        expect(plan.series![0].viewType).toBe('CandleStick');
        expect(plan.series![0].valueFields).toEqual(['h', 'l', 'o', 'c']);
    });

    it('declares all four financial channels as required', () => {
        const def = dxGetTemplateDef('Candlestick Chart', 'devextreme')!;
        expect(def.requiredChannels).toEqual(expect.arrayContaining(['open', 'high', 'low', 'close']));
    });

    it('capitalizes the candlestick series name', () => {
        const def = dxGetTemplateDef('Candlestick Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Candlestick Chart',
            channelSemantics: {
                x: { field: 'date', type: 'temporal' } as never,
                open: { field: 'o', type: 'quantitative' } as never,
                high: { field: 'h', type: 'quantitative' } as never,
                low: { field: 'l', type: 'quantitative' } as never,
                close: { field: 'c', type: 'quantitative' } as never,
            },
            encodings: {
                x: { field: 'date' }, open: { field: 'o' }, high: { field: 'h' },
                low: { field: 'l' }, close: { field: 'c' },
            },
            table: [{ date: '2026-01-01', o: 1, h: 3, l: 0.5, c: 2 }],
        }));
        expect(plan.series![0].name).toBe('Candlestick');
    });
});

describe('Pie and Donut templates', () => {
    const circularContext = (chartType: string) => context({
        chartType,
        channelSemantics: {
            color: { field: 'region', type: 'nominal' } as never,
            size: { field: 'revenue', type: 'quantitative' } as never,
        },
        encodings: { color: { field: 'region' }, size: { field: 'revenue' } },
        table: [{ region: 'North', revenue: 10 }, { region: 'South', revenue: 20 }],
    });

    it('emits a Circular family plan with no diagram', () => {
        const def = dxGetTemplateDef('Pie Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, circularContext('Pie Chart'));
        expect(plan.family).toBe('Circular');
        expect(plan.diagram).toBeNull();
        expect(plan.series![0].viewType).toBe('Pie');
        expect(plan.series![0].argumentField).toBe('region');
        expect(plan.series![0].valueFields).toEqual(['revenue']);
        expect(plan.legend!.visible).toBe(true);
    });

    it('uses Doughnut for Donut Chart', () => {
        const def = dxGetTemplateDef('Donut Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, circularContext('Donut Chart'));
        expect(plan.series![0].viewType).toBe('Doughnut');
    });

    it('humanizes the series name from the size field', () => {
        const def = dxGetTemplateDef('Pie Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, circularContext('Pie Chart'));
        expect(plan.series![0].name).toBe('Revenue');
    });
});
