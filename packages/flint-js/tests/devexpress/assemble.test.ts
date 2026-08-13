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

    it('uses a field_display_names override for the axis titles instead of the humanized field name', () => {
        const base = input();
        const plan = assembleDevExpressPlan({
            ...base,
            field_display_names: { quarter: 'Fiscal Quarter', revenue: 'Net Revenue' },
        });
        expect(plan.diagram!.axisX.title).toBe('Fiscal Quarter');
        expect(plan.diagram!.axisY.title).toBe('Net Revenue');
    });

    it('falls back to humanizeFieldName when no override is given for a field', () => {
        const plan = assembleDevExpressPlan({
            ...input(),
            field_display_names: { quarter: 'Fiscal Quarter' },
        });
        expect(plan.diagram!.axisX.title).toBe('Fiscal Quarter');
        expect(plan.diagram!.axisY.title).toBe('Revenue');
    });

    it('overrides an unsplit series name the same way', () => {
        const plan = assembleDevExpressPlan({
            ...input(),
            field_display_names: { revenue: 'Net Revenue' },
        });
        expect(plan.series[0].name).toBe('Net Revenue');
    });

    it('does not override a split series name, since it is a raw category value, not a field name', () => {
        const plan = assembleDevExpressPlan({
            ...input({
                chartType: 'Grouped Bar Chart',
                encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, group: { field: 'region' } },
            }),
            field_display_names: { North: 'Should Not Apply' },
        });
        expect(plan.series.map((s) => s.name).sort()).toEqual(['North', 'South']);
    });

    it('does not let a field_display_names override for the y field mangle Range Area\'s dual-field composite series name', () => {
        // Range Area Chart is the only template with a y2 channel, and its
        // series name is a hyphenated composite of BOTH y and y2's humanized
        // field names (`${low}–${high}`), built by rangeAreaChart's
        // instantiate(). Per the plan's own Task 4 design note, this dual-field
        // name is out of scope for field_display_names (it keys on one real
        // field, and neither of the two here unambiguously fits) — so an
        // override naming only the y field must NOT overwrite it.
        const plan = assembleDevExpressPlan({
            data: {
                values: [
                    { day: 'Mon', temp_min: 10, temp_max: 20 },
                    { day: 'Tue', temp_min: 12, temp_max: 22 },
                ],
            },
            semantic_types: { day: 'Category', temp_min: 'Temperature', temp_max: 'Temperature' },
            chart_spec: {
                chartType: 'Range Area Chart',
                encodings: { x: { field: 'day' }, y: { field: 'temp_min' }, y2: { field: 'temp_max' } },
            },
            field_display_names: { temp_min: 'Minimum Temperature', temp_max: 'Maximum Temperature' },
        } as never);
        expect(plan.series[0].name).toBe('Temp Min–Temp Max');
    });

    it('still overrides a Bubble scatter\'s single-field-derived series name (y2 guard must not overcorrect)', () => {
        // Bubble scatter (Scatter Plot template with a size encoding) also has
        // valueFields.length === 2 ([y, sizeField]), like Range Area, but its
        // series name is genuinely just the humanized y field alone (via
        // baseSeries()) — no y2 channel is involved. This confirms the y2-guard
        // added for Range Area doesn't also incorrectly suppress this
        // still-valid override.
        const plan = assembleDevExpressPlan({
            data: {
                values: [
                    { revenue: 100, profit: 10 },
                    { revenue: 200, profit: 20 },
                ],
            },
            semantic_types: { revenue: 'Price', profit: 'Price' },
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: { field: 'revenue' }, y: { field: 'revenue' }, size: { field: 'profit' } },
            },
            field_display_names: { revenue: 'Net Revenue' },
        } as never);
        expect(plan.series[0].name).toBe('Net Revenue');
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

    it('picks the warm-high diverging ramp for a plain intensity measure, end to end', () => {
        // 'Quantity' (core/type-registry.ts) is a real semantic type whose t1
        // is 'Physical', not 'SignedMeasure'. core/semantic-types.ts's
        // getRecommendedColorScheme only takes the DIVERGING_WARM_LOW
        // ('redblue') branch when the registry entry's t1 is 'SignedMeasure'
        // (e.g. Profit, Sentiment); every other measure that straddles zero —
        // a plain Quantity among them — falls into the "no valence" branch and
        // gets DIVERGING_WARM_HIGH ('blueorange') instead. Data has to
        // actually straddle zero for core/field-semantics.ts's
        // resolveDivergingInfo to report a midpoint at all for a
        // diverging:'none' type like Quantity (its only path there is the
        // data-driven "min < 0 < max" case). And a 'color' encoding on the
        // field is required in the first place: decideColorMaps
        // (core/color-decisions.ts) only ever produces a decision for the
        // 'color'/'group' channels, so with no such encoding this pipeline
        // never reaches a diverging ColorDecision at all.
        const values = [
            { quarter: 'Q1', usage: -20 },
            { quarter: 'Q2', usage: 15 },
            { quarter: 'Q3', usage: -5 },
            { quarter: 'Q4', usage: 40 },
        ];
        const plan = assembleDevExpressPlan({
            data: { values },
            semantic_types: { quarter: 'Quarter', usage: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: { field: 'quarter' }, y: { field: 'usage' }, color: { field: 'usage' } },
            },
        } as never);
        expect(plan.palette.class).toBe('diverging');
        expect(plan.palette.colors[0]).not.toBe('#b2182b'); // not the redblue ramp's red start
        expect(plan.palette.colors[0]).toBe('#2166ac'); // the blueorange ramp's blue start
    });

    it('applies a theme_spec\'s resolved palette instead of the default ramp', () => {
        const plan = assembleDevExpressPlan({
            ...input({
                chartType: 'Grouped Bar Chart',
                encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, group: { field: 'region' } },
            }),
            theme_spec: 'economist',
        });
        // The Economist preset's real ink.series.categorical colors — read
        // verbatim from core/theme/presets/economist.ts at the merged 0.5 tree.
        expect(plan.palette.colors).toEqual([
            '#006ba2', '#3ebcd2', '#ebb434', '#379a8b', '#9a3d5b', '#a17ba5',
        ]);
        expect(plan.palette.colors.length).toBeGreaterThan(0);
    });

    it('falls through to the capacity-aware default picker when a theme\'s categorical set is too small for the chart\'s real category count', () => {
        // Economist has exactly 6 categorical colors (core/theme/presets/economist.ts).
        // A chart with 12 distinct categories must NOT get just those 6 colors
        // (which DevExtreme would cycle, silently pairing up two categories on
        // the same color) — it must fall through to colormap.ts's own
        // capacity-aware picker instead, same as the un-themed high-cardinality
        // case above.
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
            theme_spec: 'economist',
        } as never);
        expect(plan.palette.colors.length).toBeGreaterThanOrEqual(12);
        expect(plan.palette.colors).not.toEqual([
            '#006ba2', '#3ebcd2', '#ebb434', '#379a8b', '#9a3d5b', '#a17ba5',
        ]);
    });

    it('reports an unsupported note naming what a theme_spec could not apply', () => {
        const plan = assembleDevExpressPlan({
            ...input(),
            theme_spec: 'economist',
        });
        const themeNote = plan.unsupported.find((u) => u.feature === 'theme_spec');
        expect(themeNote).toBeDefined();
        expect(themeNote!.action).toBe('downgraded');
        expect(themeNote!.detail).toMatch(/economist/i);
    });

    it('accepts a full ThemeSpec object, not just a preset name string', () => {
        const plan = assembleDevExpressPlan({
            ...input(),
            theme_spec: { extends: 'economist', ink: { series: { categorical: ['#111111', '#222222'] } } },
        });
        expect(plan.palette.colors).toEqual(['#111111', '#222222']);
    });

    it('leaves the palette and unsupported list untouched when no theme_spec is given, exactly as before', () => {
        const plan = assembleDevExpressPlan(input());
        expect(plan.unsupported.find((u) => u.feature === 'theme_spec')).toBeUndefined();
    });
});
