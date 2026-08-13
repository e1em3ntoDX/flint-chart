import { describe, it, expect } from 'vitest';
import { assembleDevExpressPlan } from '../../src/devexpress/assemble';
import type { ChartAssemblyInput } from '../../src/core/types';

function input(overrides: Partial<ChartAssemblyInput['chart_spec']> = {}): ChartAssemblyInput {
    return {
        data: {
            values: [
                { quarter: 'Q1', revenue: 1200, region: 'North' },
                { quarter: 'Q2', revenue: 1450, region: 'North' },
                { quarter: 'Q3', revenue: 980, region: 'South' },
                { quarter: 'Q4', revenue: 1800, region: 'South' },
            ],
        },
        semantic_types: { quarter: 'Quarter', revenue: 'Price', region: 'Country' },
        chart_spec: {
            chartType: 'Bar Chart',
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' } },
            ...overrides,
        },
    };
}

describe('assembleDevExpressPlan', () => {
    it('produces a schema-valid plan end to end', () => {
        const plan = assembleDevExpressPlan(input());
        expect(plan.schema).toBe('flint.devexpress.chart/v1');
        expect(plan.target).toBe('devextreme');
        expect(plan.family).toBe('Cartesian');
        expect(plan.series[0].viewType).toBe('Bar');
        expect(plan.data.points.length).toBe(4);
    });

    it('derives the zero baseline from Flint rather than hardcoding it', () => {
        const plan = assembleDevExpressPlan(input());
        expect(typeof plan.diagram!.axisY.includeZero).toBe('boolean');
    });

    it('diverges the zero baseline between a length mark and a point mark on the same zero-meaningful data', () => {
        // Regression gate for the zero-merge mechanism in runCoreStages: a Bar
        // Chart is a length mark (structural baseline, includeZero: true) and a
        // Scatter Plot is a point mark (data-fit baseline, includeZero: false)
        // for the same revenue/Price data. If the zero merge were ever deleted
        // or short-circuited, both would collapse to the same boolean and this
        // would fail.
        const barPlan = assembleDevExpressPlan(input({ chartType: 'Bar Chart' }));
        const scatterPlan = assembleDevExpressPlan(input({
            chartType: 'Scatter Plot',
            encodings: { x: { field: 'revenue' }, y: { field: 'revenue' } },
        }));
        expect(barPlan.diagram!.axisY.includeZero).toBe(true);
        expect(scatterPlan.diagram!.axisY.includeZero).toBe(false);
    });

    it('gives a Line Chart the same zero baseline as Flint\'s own line branch (line mark, not point/scatter)', () => {
        // Regression gate for the Line Chart template declaring
        // `template: { mark: 'line' }`: without it, markTypeOf falls back to
        // the markCognitiveChannel ('position') mapping and computeZeroDecision
        // takes the scatter/point branch, wrongly producing includeZero: false
        // on zero-meaningful data (e.g. revenue/Price) — diverging from Flint's
        // own core line branch and vegalite Line Chart template, both of which
        // get includeZero: true for the same chart on the same data.
        const linePlan = assembleDevExpressPlan(input({ chartType: 'Line Chart' }));
        expect(linePlan.diagram!.axisY.includeZero).toBe(true);
    });

    it('rejects a faceted spec', () => {
        expect(() => assembleDevExpressPlan(input({
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, column: { field: 'region' } },
        }))).toThrow(/Faceting is not supported/);
    });

    it('rejects a chart type absent from the target registry', () => {
        expect(() => assembleDevExpressPlan(input({ chartType: 'Violin Plot' })))
            .toThrow(/not supported/i);
    });

    it('rejects a chart type with no registered template', () => {
        // Waterfall Chart is an xtracharts-only type whose template lands in round two.
        // Until then it is unregistered, so it is rejected on every target.
        expect(() => assembleDevExpressPlan(input({ chartType: 'Waterfall Chart' })))
            .toThrow(/not supported/i);
        expect(() => assembleDevExpressPlan(input({ chartType: 'Waterfall Chart' }), { target: 'xtracharts' }))
            .toThrow(/not supported/i);
    });

    it('rejects a candlestick missing required channels', () => {
        expect(() => assembleDevExpressPlan(input({
            chartType: 'Candlestick Chart',
            encodings: { x: { field: 'quarter' }, open: { field: 'revenue' } },
        }))).toThrow(/requires channel/);
    });

    it('never leaks layout geometry into the plan', () => {
        const json = JSON.stringify(assembleDevExpressPlan(input()));
        for (const forbidden of ['subplotWidth', 'subplotHeight', 'xStep', 'yStep', 'titleFontSize']) {
            expect(json).not.toContain(forbidden);
        }
    });

    it('passes its own output through prepareDevExpressPlan', () => {
        // Assembler output must satisfy the validator; this catches drift between them.
        const plan = assembleDevExpressPlan(input());
        expect(plan.unsupported).toEqual([]);
        expect(Array.isArray(plan.warnings)).toBe(true);
    });

    it('populates plan.titles from chart_spec.title and .subtitle', () => {
        const plan = assembleDevExpressPlan(input({ title: 'Quarterly Revenue', subtitle: 'By region, 2026' }));
        expect(plan.titles).toEqual([
            { text: 'Quarterly Revenue', role: 'chart' },
            { text: 'By region, 2026', role: 'subtitle' },
        ]);
    });

    it('leaves plan.titles empty when no title is given, exactly as before', () => {
        const plan = assembleDevExpressPlan(input());
        expect(plan.titles).toEqual([]);
    });
});

describe('assembleDevExpressPlan aggregation', () => {
    // Regression coverage for wiring core's applyAggregation into runCoreStages:
    // a live demo prompt against a 32-row/4-region fixture produced a 32-slice
    // pie instead of 4, because nothing in the DevExpress pipeline collapsed
    // multiple rows per category before handing them to the Pie Chart template.
    // 2 regions x 3 quarters = 6 raw rows, multiple rows per region.
    const multiRowPerCategory: ChartAssemblyInput = {
        data: {
            values: [
                { region: 'North', quarter: 'Q1', revenue: 100 },
                { region: 'North', quarter: 'Q2', revenue: 200 },
                { region: 'North', quarter: 'Q3', revenue: 300 },
                { region: 'South', quarter: 'Q1', revenue: 50 },
                { region: 'South', quarter: 'Q2', revenue: 150 },
                { region: 'South', quarter: 'Q3', revenue: 250 },
            ],
        },
        semantic_types: { region: 'Country', quarter: 'Quarter', revenue: 'Price' },
        chart_spec: {
            chartType: 'Pie Chart',
            encodings: {
                color: { field: 'region' },
                size: { field: 'revenue', aggregate: 'sum' },
            },
        },
    };

    it('collapses multiple rows per category into one point per category when `aggregate: \'sum\'` is set', () => {
        const plan = assembleDevExpressPlan(multiRowPerCategory);
        expect(plan.family).toBe('Circular');
        expect(plan.series![0].viewType).toBe('Pie');
        expect(plan.data!.points.length).toBe(2);

        const byRegion = Object.fromEntries(
            (plan.data!.points as Array<Record<string, unknown>>).map((p) => [p.region as string, p.revenue]),
        );
        expect(byRegion.North).toBe(600); // 100 + 200 + 300
        expect(byRegion.South).toBe(450); // 50 + 150 + 250

        expect(plan.series![0].argumentField).toBe('region');
        // resolveChannelSemantics rewrites an aggregated channel's field to the
        // derived column applyAggregation produces (core/resolve-semantics.ts:403-408).
        expect(plan.series![0].valueFields).toEqual(['revenue_sum']);

        // applyAggregation also keeps the plain `revenue` column populated with
        // the same aggregated value (core/aggregate.ts:109-111), so both the
        // derived column the series references and the original field name
        // agree on the per-region sum.
        const byRegionDerived = Object.fromEntries(
            (plan.data!.points as Array<Record<string, unknown>>).map((p) => [p.region as string, p.revenue_sum]),
        );
        expect(byRegionDerived.North).toBe(600);
        expect(byRegionDerived.South).toBe(450);
    });

    it('leaves an already one-row-per-category Pie Chart unaffected when `aggregate` is not set (no-op)', () => {
        const preAggregated: ChartAssemblyInput = {
            data: {
                values: [
                    { region: 'North', revenue: 600 },
                    { region: 'South', revenue: 450 },
                ],
            },
            semantic_types: { region: 'Country', revenue: 'Price' },
            chart_spec: {
                chartType: 'Pie Chart',
                encodings: { color: { field: 'region' }, size: { field: 'revenue' } },
            },
        };
        const plan = assembleDevExpressPlan(preAggregated);
        expect(plan.data!.points.length).toBe(2);
        const byRegion = Object.fromEntries(
            (plan.data!.points as Array<Record<string, unknown>>).map((p) => [p.region as string, p.revenue]),
        );
        expect(byRegion.North).toBe(600);
        expect(byRegion.South).toBe(450);
    });
});

describe('assembleDevExpressPlan palette', () => {
    it('picks a non-default palette for a high-cardinality categorical split', () => {
        // 12 distinct groups — more than the 8-entry default ramp's capacity,
        // so a correctly-wired colormap must pick the larger 20-entry map.
        const values = Array.from({ length: 12 }, (_, i) => ({
            category: `cat-${i}`,
            month: 'Jan',
            metric: 10 + i,
        }));
        const plan = assembleDevExpressPlan({
            data: { values },
            semantic_types: { category: 'Category', month: 'Category', metric: 'Quantity' },
            chart_spec: {
                chartType: 'Pie Chart',
                encodings: { color: { field: 'category' }, size: { field: 'metric', aggregate: 'sum' } },
            },
        } as never);
        expect(plan.palette.colors).not.toEqual([
            '#5f8b95', '#ba4d51', '#af8a53', '#955f71',
            '#859666', '#7e688c', '#4f6b8f', '#a6656a',
        ]);
        expect(plan.palette.colors.length).toBeGreaterThanOrEqual(12);
    });
});
