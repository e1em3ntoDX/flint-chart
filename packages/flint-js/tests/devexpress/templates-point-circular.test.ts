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

    it('does not split on a continuous color channel', () => {
        const def = dxGetTemplateDef('Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, scatterContext({
            channelSemantics: {
                x: { field: 'weight', type: 'quantitative' } as never,
                y: { field: 'mpg', type: 'quantitative' } as never,
                color: { field: 'temp', type: 'quantitative' } as never,
            },
            encodings: { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'temp' } },
            table: [
                { weight: 1.6, mpg: 32, temp: 15 },
                { weight: 3.4, mpg: 18, temp: 16 },
            ],
        }));
        expect(plan.series).toHaveLength(1);
        expect(plan.legend!.visible).toBe(false);
        const note = plan.unsupported!.find((n) => n.feature === 'color');
        expect(note).toBeDefined();
        expect(note!.action).toBe('rejected');
    });

    // A Bubble already rejects color for a structural reason (no room for a
    // second split dimension) regardless of the channel's type, so a
    // continuous color on a Bubble must not ALSO trip the continuous-color
    // check — exactly one note for the one rejected channel.
    it('emits exactly one color note for a Bubble with a continuous color channel', () => {
        const def = dxGetTemplateDef('Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, scatterContext({
            channelSemantics: {
                x: { field: 'weight', type: 'quantitative' } as never,
                y: { field: 'mpg', type: 'quantitative' } as never,
                size: { field: 'hp', type: 'quantitative' } as never,
                color: { field: 'temp', type: 'quantitative' } as never,
            },
            encodings: {
                x: { field: 'weight' }, y: { field: 'mpg' }, size: { field: 'hp' }, color: { field: 'temp' },
            },
        }));
        expect(plan.series).toHaveLength(1);
        expect(plan.series![0].viewType).toBe('Bubble');
        const colorNotes = plan.unsupported!.filter((n) => n.feature === 'color');
        expect(colorNotes).toHaveLength(1);
        expect(colorNotes[0].action).toBe('rejected');
        expect(colorNotes[0].detail).toContain('Bubble series already spends its value fields');
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

    it('does not split on a continuous color channel', () => {
        const def = dxGetTemplateDef('Connected Scatter Plot', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Connected Scatter Plot',
            channelSemantics: {
                x: { field: 'gdp', type: 'quantitative' } as never,
                y: { field: 'life', type: 'quantitative' } as never,
                color: { field: 'temp', type: 'quantitative' } as never,
            },
            encodings: { x: { field: 'gdp' }, y: { field: 'life' }, color: { field: 'temp' } },
            table: [
                { gdp: 1, life: 60, temp: 15 },
                { gdp: 2, life: 70, temp: 16 },
            ],
        }));
        expect(plan.series).toHaveLength(1);
        expect(plan.legend!.visible).toBe(false);
        const note = plan.unsupported!.find((n) => n.feature === 'color');
        expect(note).toBeDefined();
        expect(note!.action).toBe('rejected');
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

    it('anchors the value axis to zero and titles it Count', () => {
        // Histogram declares only channel x, so the shared frame's value axis
        // (axisY here — the bins are the argument, on x) had no channel
        // semantics to read: untitled, includeZero:false. That unanchors the
        // bars from zero and breaks bar-height-proportional-to-frequency.
        const def = dxGetTemplateDef('Histogram', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Histogram',
            channelSemantics: { x: { field: 'v', type: 'quantitative' } as never },
            encodings: { x: { field: 'v' } },
            table: [{ v: 1 }, { v: 2 }, { v: 8 }, { v: 9 }],
        }));
        expect(plan.diagram!.axisY.includeZero).toBe(true);
        expect(plan.diagram!.axisY.title).toBe('Count');
    });

    it('preserves argumentAxisChannel set by applyCartesianFrame through the value-axis fixup', () => {
        // The value-axis correction mutates spec.diagram after
        // applyCartesianFrame has already populated it; it must merge into the
        // existing axis object and diagram, not replace either wholesale, or
        // argumentAxisChannel silently disappears from the plan.
        const def = dxGetTemplateDef('Histogram', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Histogram',
            channelSemantics: { x: { field: 'v', type: 'quantitative' } as never },
            encodings: { x: { field: 'v' } },
            table: [{ v: 1 }, { v: 2 }],
        }));
        expect(plan.diagram!.argumentAxisChannel).toBe('x');
    });

    it('bins the unfiltered fullTable, not the overflow-filtered table', () => {
        // filterOverflow (core/filter-overflow.ts) may have already dropped
        // rows from `table` to fit the canvas; binning that truncated table
        // would silently distort the distribution. `context.fullTable` is the
        // pre-filtering table (assemble.ts:287: `fullTable: data`).
        const def = dxGetTemplateDef('Histogram', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Histogram',
            channelSemantics: { x: { field: 'v', type: 'quantitative' } as never },
            encodings: { x: { field: 'v' } },
            // Simulates overflow filtering having already dropped 2 of 4 rows.
            table: [{ v: 1 }, { v: 2 }],
            fullTable: [{ v: 1 }, { v: 2 }, { v: 8 }, { v: 9 }],
        }));
        const total = plan.data!.points.reduce((sum, p) => sum + (p as { count: number }).count, 0);
        expect(total).toBe(4);
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
    const circularContext = (
        chartType: string,
        table: Record<string, unknown>[] = [{ region: 'North', revenue: 10 }, { region: 'South', revenue: 20 }],
        channelSemanticsOverrides: Partial<InstantiateContext['channelSemantics']> = {},
    ) => context({
        chartType,
        channelSemantics: {
            color: { field: 'region', type: 'nominal' } as never,
            size: { field: 'revenue', type: 'quantitative' } as never,
            ...channelSemanticsOverrides,
        },
        encodings: { color: { field: 'region' }, size: { field: 'revenue' } },
        table,
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

    // dxPieChart draws one sector per point handed to it; without a rollup,
    // two rows sharing a category draw as two same-named sectors instead of
    // one combined one (a real difference from the ECharts template, which
    // collapses duplicates explicitly — echarts/templates/pie.ts:37).
    it('collapses duplicate categories into one slice with summed values', () => {
        const def = dxGetTemplateDef('Pie Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, circularContext('Pie Chart', [
            { region: 'North', revenue: 10 },
            { region: 'North', revenue: 15 },
            { region: 'South', revenue: 20 },
        ]));
        expect(plan.data!.points).toEqual([
            { region: 'North', revenue: 25 },
            { region: 'South', revenue: 20 },
        ]);
    });

    it('orders slices by the color channel ordinal order when one is supplied', () => {
        const def = dxGetTemplateDef('Pie Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, circularContext(
            'Pie Chart',
            [{ region: 'South', revenue: 20 }, { region: 'North', revenue: 10 }],
            { color: { field: 'region', type: 'nominal', ordinalSortOrder: ['North', 'South'] } as never },
        ));
        expect(plan.data!.points.map((p) => (p as { region: string }).region)).toEqual(['North', 'South']);
    });
});
