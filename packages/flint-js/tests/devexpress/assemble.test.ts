import { describe, it, expect } from 'vitest';
import { applyZeroDecisions, assembleDevExpressPlan } from '../../src/devexpress/assemble';
import { computeChannelBudgets, computeLayout } from '../../src/core/compute-layout';
import { convertTemporalData, resolveChannelSemantics } from '../../src/core/resolve-semantics';
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
        // instantiate(). field_display_names keys on a single real field, so
        // no entry in it can name that composite: applyFieldDisplayNames
        // therefore skips the single-series rename whenever a y2 channel is
        // present (see its `!fieldOfChannel('y2')` guard in assemble.ts), and
        // an override naming only the y field must NOT overwrite it.
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

    // Regression coverage for the circular-only rollup: without `aggregate`
    // set on the channel, nothing upstream of the Pie Chart template ever
    // collapses duplicate categories — dxPieChart drew two "North" sectors
    // (10 and 15) instead of one at 25.
    it('collapses duplicate categories into one slice with summed values even when `aggregate` is not set', () => {
        const plan = assembleDevExpressPlan({
            data: { values: [
                { region: 'North', sales: 10 },
                { region: 'North', sales: 15 },
                { region: 'South', sales: 20 },
            ] },
            semantic_types: { region: 'Country', sales: 'Quantity' },
            chart_spec: {
                chartType: 'Pie Chart',
                encodings: { color: { field: 'region' }, size: { field: 'sales' } },
            },
        } as never, { target: 'devextreme' });

        expect(plan.data!.points).toEqual([
            { region: 'North', sales: 25 },
            { region: 'South', sales: 20 },
        ]);
    });

    // core infers `ordinalSortOrder` from the field's semantic type — it is
    // never read off the encoding (core/resolve-semantics.ts:474-482) — so
    // this proves the real inference path reaches the plan, not a value this
    // test hands in itself. 'Month' is one of the few semantic types with a
    // canonical sequence (core/semantic-types.ts's ORDINAL_SEQUENCES).
    it('orders slices by the core-inferred calendar-month order, not first appearance', () => {
        const plan = assembleDevExpressPlan({
            data: { values: [
                { month: 'March', sales: 30 },
                { month: 'January', sales: 10 },
                { month: 'February', sales: 20 },
            ] },
            semantic_types: { month: 'Month', sales: 'Quantity' },
            chart_spec: {
                chartType: 'Pie Chart',
                encodings: { color: { field: 'month' }, size: { field: 'sales' } },
            },
        } as never, { target: 'devextreme' });

        expect(plan.data!.points.map((p: any) => p.month)).toEqual(['January', 'February', 'March']);
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

    it('applies a theme_spec\'s resolved typography to plan.typography', () => {
        const plan = assembleDevExpressPlan({
            ...input(),
            theme_spec: 'economist',
        });
        // The Economist preset's real type.headline/.deck/.axisLabel/.axisTitle —
        // read verbatim from core/theme/presets/economist.ts at the merged 0.5.1 tree.
        expect(plan.typography.title).toEqual({
            family: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            size: 14,
            weight: 700,
        });
        expect(plan.typography.subtitle).toEqual({ size: 12, color: '#54585a' });
        expect(plan.typography.axisLabel).toEqual({ size: 11 });
        expect(plan.typography.axisTitle).toEqual({ size: 11, weight: 400, color: '#54585a' });
    });

    it('leaves plan.typography fields undefined for roles a theme never sets', () => {
        // Economist's real type block defines headline/deck/axisLabel/axisTitle —
        // no keyLabel or valueLabel.
        const plan = assembleDevExpressPlan({
            ...input(),
            theme_spec: 'economist',
        });
        expect(plan.typography.legend).toBeUndefined();
        expect(plan.typography.dataLabel).toBeUndefined();
    });

    it('leaves plan.typography entirely empty when no theme_spec is given, exactly as before', () => {
        const plan = assembleDevExpressPlan(input());
        expect(plan.typography).toEqual({
            title: undefined, subtitle: undefined, axisLabel: undefined,
            axisTitle: undefined, legend: undefined, dataLabel: undefined,
        });
    });

    it('updates the theme_spec downgrade note now that typography is applied', () => {
        const plan = assembleDevExpressPlan({
            ...input(),
            theme_spec: 'economist',
        });
        const themeNote = plan.unsupported.find((u) => u.feature === 'theme_spec');
        expect(themeNote).toBeDefined();
        expect(themeNote!.detail).toMatch(/palette and typography/i);
        expect(themeNote!.detail).not.toMatch(/typography.*not yet supported/i);
        expect(themeNote!.detail).toMatch(/italic/i);
        expect(themeNote!.detail).toMatch(/mark geometry|furniture/i);
    });
});

describe('zero baseline handed to core', () => {
    it('stores the full ZeroDecision so core stages can read zero?.zero', () => {
        const sem: any = {
            field: 'revenue', type: 'quantitative',
            semanticAnnotation: { semanticType: 'Price' },
        };
        applyZeroDecisions(
            { y: sem } as never,
            { type: 'bar', cognitiveChannel: 'length' },
            [{ revenue: 100 }, { revenue: 250 }],
        );
        // An object, not a bare boolean: core reads zero?.zero, which is
        // undefined on a boolean, so the whole descriptor must survive.
        expect(typeof sem.zero).toBe('object');
        expect(sem.zero.zero).toBe(true);
        expect(sem.zero.zeroClass).toBe('meaningful');
    });

    it('feeds core\'s layout stage a baseline it can actually see', () => {
        // The defect this guards was invisible at the plan level (a DevExpress
        // plan carries no pixel geometry), so assert against core directly:
        // compute-layout's banking pass expands the domain to zero only when
        // `zero?.zero` is truthy (core/compute-layout.ts:588-593), then skips
        // banking when zero dominates the resulting domain — coverage below
        // BANKING_COVERAGE_THRESHOLD (0.2, core/compute-layout.ts:602, applied
        // at :660-661). Degrade the descriptor to the bare boolean it used to
        // be and that expansion silently stops happening, so the two layouts
        // must differ. The fixture's y values sit ~3% of the way up a
        // zero-anchored domain, well under that 0.2 — if an upstream rebase
        // retunes the threshold or the guard, this is what to re-check.
        const data = Array.from({ length: 12 }, (_, i) => ({ t: i, v: 1000 + i * 3 }));
        const encodings = { x: { field: 't' }, y: { field: 'v' } };
        const semanticTypes = { t: 'Count', v: 'Amount' };
        const canvas = { width: 400, height: 320 };
        const resolve = () => resolveChannelSemantics(
            encodings as never, data, semanticTypes, convertTemporalData(data, semanticTypes),
        );
        const layoutFor = (cs: Record<string, unknown>) => {
            const budgets = computeChannelBudgets(cs as never, {}, data, canvas, {});
            return computeLayout(cs as never, {}, data, canvas, {}, budgets.facetGrid);
        };

        const lineMark = { type: 'line', cognitiveChannel: 'position' } as const;
        const descriptor: any = resolve();
        applyZeroDecisions(descriptor, lineMark, data);
        const degraded: any = resolve();
        applyZeroDecisions(degraded, lineMark, data);
        degraded.y.zero = degraded.y.zero.zero; // the pre-fix bare boolean

        expect(descriptor.y.zero.zero).toBe(true);
        expect(layoutFor(descriptor)).not.toEqual(layoutFor(degraded));
    });

    it('honors an explicit includeZero_y override on a position mark', () => {
        // Same fixture as the Line Chart baseline test above, which pins the
        // un-overridden answer at `true` — so `false` here can only come from
        // the override, not from the fixture.
        const plan = assembleDevExpressPlan(input({
            chartType: 'Line Chart',
            chartProperties: { includeZero_y: false },
        }), { target: 'devextreme' });
        expect(plan.diagram?.axisY.includeZero).toBe(false);
    });

    it('refuses an includeZero_y override on a length mark, whose baseline is structural', () => {
        // A bar's height IS its value measured from zero, so switching the
        // baseline off would leave bars no longer proportional to their data.
        // core calls that "not debatable" (core/semantic-types.ts:469) and
        // vegalite/assemble.ts:300-318 gates the same override on a
        // position-cognitive mark. Bar Chart is `markCognitiveChannel:
        // 'length'` (templates/bar.ts:261), so the override must be ignored.
        const plan = assembleDevExpressPlan(input({
            chartProperties: { includeZero_y: false },
        }), { target: 'devextreme' });
        expect(plan.diagram?.axisY.includeZero).toBe(true);
    });
});

describe('PHASE 0 scale-type overrides', () => {
    /** Two quantitative position channels, so a log scale is legitimate. */
    function scatterInput(chartProperties?: Record<string, unknown>): ChartAssemblyInput {
        return {
            data: {
                values: [
                    { revenue: 100, profit: 10 },
                    { revenue: 5000, profit: 900 },
                ],
            },
            // 'Amount' rather than 'Price' on purpose: resolveScaleType only
            // considers log for an *additive* open-domain measure
            // (core/field-semantics.ts:544) and Price is registered
            // `intensive`, so it can never carry core's log recommendation.
            semantic_types: { revenue: 'Amount', profit: 'Amount' },
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: { field: 'revenue' }, y: { field: 'profit' } },
                chartProperties,
            },
        } as ChartAssemblyInput;
    }

    it('forces a log value axis when logScale_y is true on a position mark', () => {
        expect(assembleDevExpressPlan(scatterInput()).diagram!.axisY.logarithmic).toBe(false);
        const plan = assembleDevExpressPlan(scatterInput({ logScale_y: true }));
        expect(plan.diagram!.axisY.logarithmic).toBe(true);
    });

    it('forces a linear axis when logScale_y is false, overriding core\'s recommendation', () => {
        // core/field-semantics.ts:533 only recommends log for an additive,
        // open-domain measure with >= 10 values spanning >= 6 orders of
        // magnitude, so the fixture has to clear that bar — otherwise the
        // `false` override below would be indistinguishable from the default.
        const spread = { values: Array.from({ length: 10 }, (_, i) => ({ revenue: 10 ** i, profit: 10 ** i })) };
        const recommended = assembleDevExpressPlan({ ...scatterInput(), data: spread });
        expect(recommended.diagram!.axisY.logarithmic).toBe(true);
        const overridden = assembleDevExpressPlan({ ...scatterInput({ logScale_y: false }), data: spread });
        expect(overridden.diagram!.axisY.logarithmic).toBe(false);
    });

    it('still strips a forced log scale on a length mark, where the baseline carries the magnitude', () => {
        // The non-position strip block runs after the override loop precisely
        // so it keeps the last word: a bar's length is read from zero, and a
        // log scale destroys that baseline.
        const plan = assembleDevExpressPlan(input({ chartProperties: { logScale_y: true } }));
        expect(plan.diagram!.axisY.logarithmic).toBe(false);
    });

    it('reinterprets a temporal argument axis as discrete bands when xAxisType says so', () => {
        function dated(chartProperties?: Record<string, unknown>): ChartAssemblyInput {
            return {
                data: {
                    values: [
                        { date: '2026-01-01', revenue: 100 },
                        { date: '2026-01-02', revenue: 250 },
                    ],
                },
                semantic_types: { date: 'Date', revenue: 'Price' },
                chart_spec: {
                    chartType: 'Line Chart',
                    encodings: { x: { field: 'date' }, y: { field: 'revenue' } },
                    chartProperties,
                },
            } as ChartAssemblyInput;
        }
        expect(assembleDevExpressPlan(dated()).series[0].argumentScaleType).toBe('DateTime');
        const plan = assembleDevExpressPlan(dated({ xAxisType: 'nominal' }));
        expect(plan.series[0].argumentScaleType).toBe('Qualitative');
    });
});

describe('assembleDevExpressPlan Histogram', () => {
    it('anchors the histogram value axis to zero and titles it Count', () => {
        const rows = Array.from({ length: 40 }, (_, i) => ({ mpg: 10 + (i % 25) }));
        const plan = assembleDevExpressPlan({
            data: { values: rows },
            semantic_types: { mpg: 'Quantity' },
            chart_spec: { chartType: 'Histogram', encodings: { x: { field: 'mpg' } } },
        } as ChartAssemblyInput);

        const valueAxis = plan.diagram!.axisY;
        expect(valueAxis.includeZero).toBe(true);
        expect(valueAxis.title).toBe('Count');
        expect(plan.series[0].valueFields).toEqual(['count']);
        // Every row is accounted for, none lost to overflow filtering.
        expect(plan.data.points.reduce((s: number, p: any) => s + p.count, 0)).toBe(40);
    });

    it('bins the pre-overflow-filtered table when x is truncated by filterOverflow', () => {
        // Reachability check for the fullTable fix: filterOverflow only
        // truncates x/y when the channel's effective type is discrete
        // (core/filter-overflow.ts:110: `isDiscreteType`), so an ordinal
        // override on a 500-unique-value numeric field forces a real
        // truncation — proven independently by binding the same shape without
        // the override, which drops the warning and reports the full 500.
        const rows = Array.from({ length: 500 }, (_, i) => ({ mpg: i }));
        const truncatedInput = {
            data: { values: rows },
            semantic_types: { mpg: 'Quantity' },
            chart_spec: { chartType: 'Histogram', encodings: { x: { field: 'mpg', type: 'ordinal' } } },
        } as ChartAssemblyInput;

        const plan = assembleDevExpressPlan(truncatedInput);
        // filterOverflow really did truncate x — this is the same mechanism
        // the fix routes around by reading fullTable instead of table.
        expect(plan.warnings!.some((w) => w.code === 'overflow' && w.field === 'mpg')).toBe(true);
        const total = plan.data.points.reduce((s: number, p: any) => s + p.count, 0);
        expect(total).toBe(500);
    });
});
