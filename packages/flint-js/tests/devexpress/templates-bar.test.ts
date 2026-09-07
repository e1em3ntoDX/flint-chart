import { describe, it, expect } from 'vitest';
import { dxGetTemplateDef } from '../../src/devexpress/templates';
import { assembleDevExpressPlan } from '../../src/devexpress/assemble';
import type { DevExpressChartPlan } from '../../src/devexpress/plan';
import type { InstantiateContext } from '../../src/core/types';

function draft(): Partial<DevExpressChartPlan> {
    return { series: [], titles: [], warnings: [], unsupported: [] };
}

function context(overrides: Partial<InstantiateContext> = {}): InstantiateContext {
    return {
        channelSemantics: {
            x: { field: 'quarter', type: 'nominal' } as never,
            y: { field: 'revenue', type: 'quantitative', zero: true } as never,
        },
        layout: {} as never,
        table: [{ quarter: 'Q1', revenue: 1200 }, { quarter: 'Q2', revenue: 1450 }],
        resolvedEncodings: {},
        encodings: { x: { field: 'quarter' }, y: { field: 'revenue' } },
        canvasSize: { width: 400, height: 320 },
        semanticTypes: { quarter: 'Quarter', revenue: 'Price' },
        chartType: 'Bar Chart',
        ...overrides,
    } as InstantiateContext;
}

describe('Bar Chart template', () => {
    it('emits one Bar series bound to the x and y fields', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context());
        expect(plan.series).toHaveLength(1);
        expect(plan.series![0].viewType).toBe('Bar');
        expect(plan.series![0].argumentField).toBe('quarter');
        expect(plan.series![0].valueFields).toEqual(['revenue']);
        expect(plan.series![0].argumentScaleType).toBe('Qualitative');
    });

    it('carries the zero decision onto the value axis', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context());
        expect(plan.diagram!.axisY.includeZero).toBe(true);
        expect(plan.diagram!.rotated).toBe(false);
    });

    it('rotates when chartProperties.orient is horizontal', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({ chartProperties: { orient: 'horizontal' } }));
        expect(plan.diagram!.rotated).toBe(true);
    });

    it('writes no layout geometry into the plan', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context());
        const json = JSON.stringify(plan);
        for (const forbidden of ['subplotWidth', 'xStep', 'titleFontSize', 'legendFontSize']) {
            expect(json).not.toContain(forbidden);
        }
    });

    it('humanizes plain field names into axis titles and the series name', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context());
        expect(plan.diagram!.axisX.title).toBe('Quarter');
        expect(plan.diagram!.axisY.title).toBe('Revenue');
        expect(plan.series![0].name).toBe('Revenue');
    });

    it('humanizes snake_case field names into Title Case', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            encodings: { x: { field: 'fuel_type' }, y: { field: 'units_sold' } },
            channelSemantics: {
                x: { field: 'fuel_type', type: 'nominal' } as never,
                y: { field: 'units_sold', type: 'quantitative', zero: true } as never,
            },
            table: [{ fuel_type: 'gas', units_sold: 10 }],
        }));
        expect(plan.diagram!.axisX.title).toBe('Fuel Type');
        expect(plan.diagram!.axisY.title).toBe('Units Sold');
        expect(plan.series![0].name).toBe('Units Sold');
    });

    it('rejects an opacity channel out loud instead of dropping it', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, opacity: { field: 'revenue' } },
            channelSemantics: {
                x: { field: 'quarter', type: 'nominal' } as never,
                y: { field: 'revenue', type: 'quantitative', zero: true } as never,
                opacity: { field: 'revenue', type: 'quantitative' } as never,
            },
        }));
        const note = plan.unsupported!.find((n) => n.feature === 'opacity');
        expect(note).toBeDefined();
        expect(note!.action).toBe('rejected');
    });

    it('rejects a color channel out loud instead of silently splitting or dropping it', () => {
        // Plain Bar Chart deliberately does not split by color: Grouped Bar
        // Chart and Stacked Bar Chart already exist as the dedicated templates
        // for that, and picking one of those shapes for a caller who asked for
        // "Bar Chart" would quietly change what they asked for. So this stays a
        // single, unsplit series, with a note pointing at the right template.
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, color: { field: 'region' } },
            channelSemantics: {
                x: { field: 'quarter', type: 'nominal' } as never,
                y: { field: 'revenue', type: 'quantitative', zero: true } as never,
                color: { field: 'region', type: 'nominal' } as never,
            },
        }));
        expect(plan.series).toHaveLength(1);
        expect(plan.series![0].viewType).toBe('Bar');
        const note = plan.unsupported!.find((n) => n.feature === 'color');
        expect(note).toBeDefined();
        expect(note!.action).toBe('rejected');
    });
});

/** Long-format rows: North(Q1=100, Q2=150) / South(Q1=200) — South has no Q2. */
function groupedContext(overrides: Partial<InstantiateContext> = {}, splitChannel = 'group') {
    return context({
        chartType: 'Grouped Bar Chart',
        encodings: {
            x: { field: 'quarter' },
            y: { field: 'revenue' },
            [splitChannel]: { field: 'region' },
        },
        channelSemantics: {
            x: { field: 'quarter', type: 'nominal' } as never,
            y: { field: 'revenue', type: 'quantitative', zero: true } as never,
            [splitChannel]: { field: 'region', type: 'nominal' } as never,
        },
        table: [
            { quarter: 'Q1', revenue: 100, region: 'North' },
            { quarter: 'Q1', revenue: 200, region: 'South' },
            { quarter: 'Q2', revenue: 150, region: 'North' },
        ],
        ...overrides,
    });
}

describe('Grouped Bar Chart template', () => {
    it('emits one Bar series per group value', () => {
        const def = dxGetTemplateDef('Grouped Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, groupedContext());
        expect(plan.series!.map((s) => s.name).sort()).toEqual(['North', 'South']);
        expect(plan.series!.every((s) => s.viewType === 'Bar')).toBe(true);
        expect(plan.legend!.visible).toBe(true);
    });

    // The regression the final whole-branch review caught: every series carried
    // the SAME argumentField/valueFields against the SAME long-format table, so
    // DevExtreme drew all rows in every series — North and South rendered
    // identical bars. Series names alone never revealed it; the values do.
    it('gives each series its own value column over a pivoted, wide-format table', () => {
        const def = dxGetTemplateDef('Grouped Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, groupedContext());

        const [north, south] = plan.series!;
        expect(north.name).toBe('North');
        expect(south.name).toBe('South');
        expect(north.valueFields).toEqual(['North']);
        expect(south.valueFields).toEqual(['South']);
        expect(north.valueFields).not.toEqual(south.valueFields);
        expect(plan.series!.every((s) => s.argumentField === 'quarter')).toBe(true);

        // One row per argument value, one column per series — and a missing
        // (South, Q2) combination is an explicit null gap, never a fabricated 0.
        expect(plan.data!.points).toEqual([
            { quarter: 'Q1', North: 100, South: 200 },
            { quarter: 'Q2', North: 150, South: null },
        ]);
    });

    it('resolves the values each series actually plots, per argument', () => {
        const def = dxGetTemplateDef('Grouped Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, groupedContext());

        const plotted = (name: string) => plan.data!.points.map((row) => [
            row.quarter,
            row[plan.series!.find((s) => s.name === name)!.valueFields[0]],
        ]);
        expect(plotted('North')).toEqual([['Q1', 100], ['Q2', 150]]);
        expect(plotted('South')).toEqual([['Q1', 200], ['Q2', null]]);
    });

    it('sums duplicate argument/group rows and says so in a warning', () => {
        const def = dxGetTemplateDef('Grouped Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, groupedContext({
            table: [
                { quarter: 'Q1', revenue: 100, region: 'North' },
                { quarter: 'Q1', revenue: 40, region: 'North' },
                { quarter: 'Q1', revenue: 200, region: 'South' },
            ],
        }));
        expect(plan.data!.points).toEqual([{ quarter: 'Q1', North: 140, South: 200 }]);
        expect(plan.warnings!.map((w) => w.code)).toContain('series-split-aggregated');
    });

    it('qualifies a group value that collides with the argument column', () => {
        const def = dxGetTemplateDef('Grouped Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, groupedContext({
            table: [
                { quarter: 'Q1', revenue: 100, region: 'quarter' },
                { quarter: 'Q1', revenue: 200, region: 'South' },
            ],
        }));
        const collided = plan.series!.find((s) => s.name === 'quarter')!;
        expect(collided.valueFields).toEqual(['region: quarter']);
        expect(plan.data!.points).toEqual([
            { quarter: 'Q1', 'region: quarter': 100, South: 200 },
        ]);
    });

    it('falls back to a single series when no group channel is bound', () => {
        const def = dxGetTemplateDef('Grouped Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({ chartType: 'Grouped Bar Chart' }));
        expect(plan.series).toHaveLength(1);
        expect(plan.series![0].valueFields).toEqual(['revenue']);
        // No split happened, so the raw table stands as the data source, and
        // there is nothing for a legend to label.
        expect(plan.data!.points).toEqual([
            { quarter: 'Q1', revenue: 1200 }, { quarter: 'Q2', revenue: 1450 },
        ]);
        expect(plan.legend!.visible).toBe(false);
    });

    it('does not split on a continuous group channel', () => {
        const def = dxGetTemplateDef('Grouped Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Grouped Bar Chart',
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, group: { field: 'temp' } },
            channelSemantics: {
                x: { field: 'quarter', type: 'nominal' } as never,
                y: { field: 'revenue', type: 'quantitative', zero: true } as never,
                group: { field: 'temp', type: 'quantitative' } as never,
            },
            table: [
                { quarter: 'Q1', revenue: 100, temp: 15 },
                { quarter: 'Q2', revenue: 150, temp: 16 },
            ],
        }));
        expect(plan.series).toHaveLength(1);
        expect(plan.series![0].viewType).toBe('Bar');
        const note = plan.unsupported!.find((n) => n.feature === 'group');
        expect(note).toBeDefined();
        expect(note!.action).toBe('rejected');
        // No split happened, so there is nothing for a legend to label.
        expect(plan.legend!.visible).toBe(false);
    });

    it('does not humanize category values used as split-series names', () => {
        const def = dxGetTemplateDef('Grouped Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, groupedContext({
            table: [
                { quarter: 'Q1', revenue: 100, region: 'north' },
                { quarter: 'Q1', revenue: 200, region: 'south' },
            ],
        }));
        expect(plan.series!.map((s) => s.name).sort()).toEqual(['north', 'south']);
    });
});

describe('Stacked Bar Chart template', () => {
    it('uses StackedBar, and FullStackedBar when normalized', () => {
        const def = dxGetTemplateDef('Stacked Bar Chart', 'devextreme')!;
        const base = context({
            chartType: 'Stacked Bar Chart',
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, color: { field: 'region' } },
            channelSemantics: {
                x: { field: 'quarter', type: 'nominal' } as never,
                y: { field: 'revenue', type: 'quantitative', zero: true, stackable: 'sum' } as never,
                color: { field: 'region', type: 'nominal' } as never,
            },
            table: [
                { quarter: 'Q1', revenue: 100, region: 'North' },
                { quarter: 'Q1', revenue: 200, region: 'South' },
            ],
        });

        const stacked = draft();
        def.instantiate(stacked, base);
        expect(stacked.series!.every((s) => s.viewType === 'StackedBar')).toBe(true);

        const full = draft();
        def.instantiate(full, context({
            ...base,
            channelSemantics: {
                ...base.channelSemantics,
                y: { field: 'revenue', type: 'quantitative', stackable: 'normalize' } as never,
            },
        }));
        expect(full.series!.every((s) => s.viewType === 'FullStackedBar')).toBe(true);
    });

    // Same defect as Grouped Bar, worse symptom: sharing one long-format table
    // made every stack segment carry every row, so the stack totals were sums
    // across all regions rather than the per-region split.
    it('stacks each region from its own column, not the whole table', () => {
        const def = dxGetTemplateDef('Stacked Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Stacked Bar Chart',
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, color: { field: 'region' } },
            channelSemantics: {
                x: { field: 'quarter', type: 'nominal' } as never,
                y: { field: 'revenue', type: 'quantitative', zero: true, stackable: 'sum' } as never,
                color: { field: 'region', type: 'nominal' } as never,
            },
            table: [
                { quarter: 'Q1', revenue: 100, region: 'North' },
                { quarter: 'Q1', revenue: 50, region: 'South' },
                { quarter: 'Q2', revenue: 200, region: 'North' },
                { quarter: 'Q2', revenue: 75, region: 'South' },
            ],
        }));

        expect(plan.series!.map((s) => [s.name, s.valueFields])).toEqual([
            ['North', ['North']], ['South', ['South']],
        ]);
        expect(plan.data!.points).toEqual([
            { quarter: 'Q1', North: 100, South: 50 },
            { quarter: 'Q2', North: 200, South: 75 },
        ]);
        expect(plan.legend!.visible).toBe(true);
    });

    it('does not split on a continuous color channel', () => {
        const def = dxGetTemplateDef('Stacked Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Stacked Bar Chart',
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, color: { field: 'temp' } },
            channelSemantics: {
                x: { field: 'quarter', type: 'nominal' } as never,
                y: { field: 'revenue', type: 'quantitative', zero: true, stackable: 'sum' } as never,
                color: { field: 'temp', type: 'quantitative' } as never,
            },
            table: [
                { quarter: 'Q1', revenue: 100, temp: 15 },
                { quarter: 'Q2', revenue: 150, temp: 16 },
            ],
        }));
        expect(plan.series).toHaveLength(1);
        expect(plan.series![0].viewType).toBe('StackedBar');
        const note = plan.unsupported!.find((n) => n.feature === 'color');
        expect(note).toBeDefined();
        expect(note!.action).toBe('rejected');
        // No split happened, so there is nothing for a legend to label.
        expect(plan.legend!.visible).toBe(false);
    });
});

describe('axis roles', () => {
    it('puts the category on the argument axis when the measure is on x', () => {
        const plan = assembleDevExpressPlan({
            data: { values: [{ region: 'North', revenue: 100 }, { region: 'South', revenue: 250 }] },
            semantic_types: { region: 'Country', revenue: 'Price' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'revenue' }, y: { field: 'region' } } },
        } as never, { target: 'devextreme' });

        expect(plan.series[0].argumentField).toBe('region');
        expect(plan.series[0].valueFields).toEqual(['revenue']);
        expect(plan.series[0].argumentScaleType).toBe('Qualitative');
        expect(plan.series[0].valueScaleType).toBe('Numerical');
        // The measure axis is the one that gets a zero baseline and gridlines.
        expect(plan.diagram!.axisX.includeZero).toBe(true);
        expect(plan.diagram!.axisX.gridLines).toBe(true);
        expect(plan.diagram!.axisY.gridLines).toBe(false);
        // Category down the side means the diagram renders rotated.
        expect(plan.diagram!.rotated).toBe(true);
    });

    it('leaves the conventional x=category orientation alone', () => {
        const plan = assembleDevExpressPlan({
            data: { values: [{ region: 'North', revenue: 100 }, { region: 'South', revenue: 250 }] },
            semantic_types: { region: 'Country', revenue: 'Price' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'region' }, y: { field: 'revenue' } } },
        } as never, { target: 'devextreme' });

        expect(plan.series[0].argumentField).toBe('region');
        expect(plan.series[0].valueFields).toEqual(['revenue']);
        expect(plan.diagram!.axisY.includeZero).toBe(true);
        expect(plan.diagram!.rotated).toBe(false);
    });
});

describe('stackable follows the resolved value channel', () => {
    // Regression guard for stackedBarChart's `stackable` read: core attaches
    // `stackable` to whichever channel actually carries the field (confirmed
    // against resolve-semantics.ts:398-421 — it is derived purely from the
    // field's own semantic type, independent of which channel it lands on), so
    // a reversed chart's normalize decision lives on x, not y. Without routing
    // through resolveAxisRoles().valueAxis, this would silently read undefined
    // off channelSemantics.y and fall back to the plain StackedBar view type.
    it('selects FullStackedBar for a reversed Stacked Bar Chart (category on y, measure on x)', () => {
        const plan = assembleDevExpressPlan({
            data: {
                values: [
                    { quarter: 'Q1', share: 0.6, region: 'North' },
                    { quarter: 'Q1', share: 0.4, region: 'South' },
                    { quarter: 'Q2', share: 0.5, region: 'North' },
                    { quarter: 'Q2', share: 0.5, region: 'South' },
                ],
            },
            // Percentage is the one 'intensive' semantic type resolveStackable
            // special-cases to 'normalize' (field-semantics.ts:1029-1030).
            semantic_types: { quarter: 'Quarter', share: 'Percentage', region: 'Country' },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                encodings: { x: { field: 'share' }, y: { field: 'quarter' }, color: { field: 'region' } },
            },
        } as never, { target: 'devextreme' });

        expect(plan.diagram!.argumentAxisChannel).toBe('y');
        expect(plan.series.every((s) => s.viewType === 'FullStackedBar')).toBe(true);
    });
});
