import { describe, it, expect } from 'vitest';
import { planToDevExtreme } from '../../src/devexpress/devextreme';
import { assembleDevExpressPlan } from '../../src/devexpress/assemble';
import type { ChartAssemblyInput } from '../../src/core/types';

const barInput: ChartAssemblyInput = {
    data: { values: [{ quarter: 'Q1', revenue: 1200 }, { quarter: 'Q2', revenue: 1450 }] },
    semantic_types: { quarter: 'Quarter', revenue: 'Price' },
    chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'quarter' }, y: { field: 'revenue' } } },
};

const pieInput: ChartAssemblyInput = {
    data: { values: [{ region: 'North', revenue: 10 }, { region: 'South', revenue: 20 }] },
    semantic_types: { region: 'Country', revenue: 'Price' },
    chart_spec: { chartType: 'Pie Chart', encodings: { color: { field: 'region' }, size: { field: 'revenue' } } },
};

const rangeAreaInput: ChartAssemblyInput = {
    data: {
        values: [
            { date: '2026-01-01', low: 149.03, high: 152.79 },
            { date: '2026-01-02', low: 150.10, high: 153.50 },
        ],
    },
    semantic_types: { date: 'Date', low: 'Price', high: 'Price' },
    chart_spec: {
        chartType: 'Range Area Chart',
        encodings: { x: { field: 'date' }, y: { field: 'low' }, y2: { field: 'high' } },
    },
};

const candlestickInput: ChartAssemblyInput = {
    data: {
        values: [
            { date: '2026-01-01', open: 150.41, high: 152.79, low: 149.03, close: 151.28 },
            { date: '2026-01-02', open: 151.00, high: 154.00, low: 150.00, close: 153.00 },
        ],
    },
    semantic_types: { date: 'Date', open: 'Price', high: 'Price', low: 'Price', close: 'Price' },
    chart_spec: {
        chartType: 'Candlestick Chart',
        encodings: {
            x: { field: 'date' }, open: { field: 'open' }, high: { field: 'high' },
            low: { field: 'low' }, close: { field: 'close' },
        },
    },
};

const groupedInput: ChartAssemblyInput = {
    data: {
        values: [
            { quarter: 'Q1', region: 'North', revenue: 100 },
            { quarter: 'Q1', region: 'South', revenue: 50 },
            { quarter: 'Q2', region: 'North', revenue: 200 },
            { quarter: 'Q2', region: 'South', revenue: 75 },
        ],
    },
    semantic_types: { quarter: 'Quarter', region: 'Region', revenue: 'Price' },
    chart_spec: {
        chartType: 'Grouped Bar Chart',
        encodings: {
            x: { field: 'quarter' }, y: { field: 'revenue' }, group: { field: 'region' },
        },
    },
};

describe('planToDevExtreme', () => {
    it('maps a Cartesian plan to dxChart options', () => {
        const { component, options } = planToDevExtreme(assembleDevExpressPlan(barInput));
        expect(component).toBe('dxChart');
        expect(options.dataSource).toHaveLength(2);
        const series = options.series as Record<string, unknown>[];
        expect(series[0].type).toBe('bar');
        expect(series[0].argumentField).toBe('quarter');
        expect(series[0].valueField).toBe('revenue');
    });

    it('maps a Circular plan to dxPieChart options', () => {
        const { component, options } = planToDevExtreme(assembleDevExpressPlan(pieInput));
        expect(component).toBe('dxPieChart');
        const series = options.series as Record<string, unknown>[];
        expect(series[0].type).toBe('pie');
        expect(series[0].argumentField).toBe('region');
        expect(series[0].valueField).toBe('revenue');
        expect(options.valueAxis).toBeUndefined();
    });

    it('lowercases every ViewType into a dxChart series type', () => {
        const { options } = planToDevExtreme(assembleDevExpressPlan(barInput));
        const series = options.series as Record<string, unknown>[];
        expect(series[0].type).toBe(String(series[0].type).toLowerCase());
    });

    it('carries the zero baseline onto the value axis', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.diagram!.axisY.includeZero = true;
        const { options } = planToDevExtreme(plan);
        expect((options.valueAxis as Record<string, unknown>).visualRange).toBeUndefined();
        expect((options.valueAxis as Record<string, unknown>).showZero).toBe(true);
    });

    it('sets rotated for horizontal bars', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.diagram!.rotated = true;
        const { options } = planToDevExtreme(plan);
        expect(options.rotated).toBe(true);
    });

    // Regression for the projector bug §4.1's fix exposed one layer down: the
    // plan-level fix (baseSeries/applyCartesianFrame) can be correct while
    // planToDevExtreme still wires argumentAxis/valueAxis by literal axisX/axisY,
    // which is wrong whenever the category lands on y. Asserting on the PLAN
    // (diagram.axisX/axisY) would have missed this — the plan was always
    // correct — so this asserts on the actual projected DevExtreme options.
    it('routes argumentAxis/valueAxis by role, not by literal x/y, for a reversed-axis plan', () => {
        const plan = assembleDevExpressPlan({
            data: { values: [{ region: 'North', revenue: 100 }, { region: 'South', revenue: 250 }] },
            semantic_types: { region: 'Country', revenue: 'Price' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'revenue' }, y: { field: 'region' } } },
        } as never, { target: 'devextreme' });

        expect(plan.diagram!.argumentAxisChannel).toBe('y');

        const { options } = planToDevExtreme(plan);
        const argumentAxis = options.argumentAxis as Record<string, unknown>;
        const valueAxis = options.valueAxis as Record<string, unknown>;
        // The category (region) is the argument, regardless of which plan
        // channel it happened to land on.
        expect(argumentAxis.title).toBe('Region');
        expect(valueAxis.title).toBe('Revenue');
        // The zero baseline and gridlines belong to the measure, so they must
        // land on the projected valueAxis, not the projected argumentAxis.
        expect(valueAxis.showZero).toBe(true);
        expect((valueAxis.grid as Record<string, unknown>).visible).toBe(true);
        expect(argumentAxis.showZero).toBeUndefined();
        expect((argumentAxis.grid as Record<string, unknown>).visible).toBe(false);
    });

    // End-to-end guard for the multi-series defect: the dxChart options must
    // give every series a DIFFERENT valueField over a wide-format dataSource.
    // Identical valueFields over a shared long-format dataSource is exactly the
    // shape that made DevExtreme plot the whole table in every series.
    it('gives each grouped series a distinct valueField over one wide dataSource', () => {
        const { options } = planToDevExtreme(assembleDevExpressPlan(groupedInput));
        const series = options.series as Record<string, unknown>[];
        expect(series.map((s) => s.name)).toEqual(['North', 'South']);
        expect(series.map((s) => s.valueField)).toEqual(['North', 'South']);
        expect(new Set(series.map((s) => s.valueField)).size).toBe(series.length);
        expect(options.dataSource).toEqual([
            { quarter: 'Q1', North: 100, South: 50 },
            { quarter: 'Q2', North: 200, South: 75 },
        ]);
    });

    it('throws on an xtracharts-only view type', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.series[0].viewType = 'Waterfall';
        expect(() => planToDevExtreme(plan)).toThrow(/no dxChart series type/);
    });

    it('turns on series labels for Bar with a formatter built from the series valueFormat', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.series[0].valueFormat = { pattern: ',.2f', prefix: '$' };
        const { options } = planToDevExtreme(plan);
        const series = options.series as Record<string, unknown>[];
        const label = series[0].label as { visible: boolean; customizeText: (info: { value: number }) => string };
        expect(label.visible).toBe(true);
        expect(label.customizeText({ value: 1234.5 })).toBe('$1,234.50');
    });

    it('formats the Cartesian tooltip using the hovered series own valueFormat', () => {
        const plan = assembleDevExpressPlan(groupedInput);
        plan.series[0].valueFormat = { pattern: ',.0f', prefix: '$' };
        plan.series[1].valueFormat = { pattern: ',.0f', prefix: '$' };
        const { options } = planToDevExtreme(plan);
        const tooltip = options.tooltip as {
            customizeTooltip: (info: { seriesName: string; value: number }) => { text: string };
        };
        expect(tooltip.customizeTooltip({ seriesName: 'North', value: 100 })).toEqual({ text: 'North: $100' });
        expect(tooltip.customizeTooltip({ seriesName: 'South', value: 75 })).toEqual({ text: 'South: $75' });
    });

    // Regression: DevExtreme's RangeArea tooltip callback never carries a
    // `value` property — only rangeValue1/rangeValue2. The old customizer
    // assumed `value` and rendered a blank "Low–High: " tooltip.
    it('formats the Range Area tooltip from rangeValue1/rangeValue2, since DevExtreme never supplies `value` there', () => {
        const plan = assembleDevExpressPlan(rangeAreaInput);
        plan.series[0].valueFormat = { pattern: ',.2f' };
        const { options } = planToDevExtreme(plan);
        const tooltip = options.tooltip as {
            customizeTooltip: (info: { seriesName: string; rangeValue1: number; rangeValue2: number }) => { text: string };
        };
        expect(plan.series[0].name).toBe('Low–High');
        const { text } = tooltip.customizeTooltip({ seriesName: 'Low–High', rangeValue1: 149.03, rangeValue2: 152.79 });
        expect(text).toContain('149.03');
        expect(text).toContain('152.79');
        expect(text).toMatch(/149\.03\s*[-–]\s*152\.79/);
    });

    // Regression: DevExtreme's CandleStick tooltip callback exposes
    // openValue/highValue/lowValue/closeValue (plus a `value` alias for the
    // close price). The old customizer used only `value`, so the tooltip
    // showed the close price alone instead of all four OHLC values.
    it('formats the Candlestick tooltip with all four O/H/L/C values, not just the close alias', () => {
        const plan = assembleDevExpressPlan(candlestickInput);
        plan.series[0].valueFormat = { pattern: ',.2f' };
        const { options } = planToDevExtreme(plan);
        const tooltip = options.tooltip as {
            customizeTooltip: (info: {
                seriesName: string; value: number;
                openValue: number; highValue: number; lowValue: number; closeValue: number;
            }) => { text: string };
        };
        const { text } = tooltip.customizeTooltip({
            seriesName: 'Candlestick', value: 151.28,
            openValue: 150.41, highValue: 152.79, lowValue: 149.03, closeValue: 151.28,
        });
        expect(text).toContain('150.41');
        expect(text).toContain('152.79');
        expect(text).toContain('149.03');
        expect(text).toContain('151.28');
    });

    // Regression for the mid-plan fix this branch shipped: planToDevExtreme()
    // moved from server to client specifically because JSON.stringify silently
    // drops function-valued options (customizeText/customizeTooltip). This
    // guards that property directly: a plan that has crossed a JSON boundary
    // must still let planToDevExtreme() build a genuinely working formatter.
    it('still produces a working label formatter after the plan survives a JSON round trip', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.series[0].valueFormat = { pattern: ',.2f', prefix: '$' };
        const roundTripped = JSON.parse(JSON.stringify(plan));
        const { options } = planToDevExtreme(roundTripped);
        const series = options.series as Record<string, unknown>[];
        const label = series[0].label as { customizeText: unknown };
        expect(typeof label.customizeText).toBe('function');
        const text = (label.customizeText as (info: { value: number }) => string)({ value: 1234.5 });
        expect(text).toBe('$1,234.50');
    });

    it('adds a label and tooltip formatter to the Circular projection, which previously had neither', () => {
        const plan = assembleDevExpressPlan(pieInput);
        plan.series[0].labelsVisible = true;
        plan.series[0].valueFormat = { pattern: ',.1f' };
        const { options } = planToDevExtreme(plan);
        const series = (options.series as Record<string, unknown>[])[0];
        const label = series.label as {
            visible: boolean;
            customizeText: (info: { argument: string; value: number }) => string;
        };
        expect(label.visible).toBe(true);
        expect(label.customizeText({ argument: 'North', value: 10 })).toBe('North: 10.0');
        const tooltip = options.tooltip as {
            customizeTooltip: (info: { argument: string; value: number }) => { text: string };
        };
        expect(tooltip.customizeTooltip({ argument: 'North', value: 10 })).toEqual({ text: 'North: 10.0' });
    });

    it('projects a chart title with no subtitle as a plain string, exactly as before', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.titles = [{ text: 'Quarterly Revenue', role: 'chart' }];
        const { options } = planToDevExtreme(plan);
        expect(options.title).toBe('Quarterly Revenue');
    });

    it('projects a subtitle alongside the chart title', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.titles = [
            { text: 'Quarterly Revenue', role: 'chart' },
            { text: 'By region, 2026', role: 'subtitle' },
        ];
        const { options } = planToDevExtreme(plan);
        expect(options.title).toEqual({ text: 'Quarterly Revenue', subtitle: { text: 'By region, 2026' } });
    });

    it('merges a theme\'s title/subtitle fonts into the title options, alongside the text', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.titles = [
            { text: 'Quarterly Revenue', role: 'chart' },
            { text: 'By region, 2026', role: 'subtitle' },
        ];
        plan.typography.title = { family: 'Georgia', size: 24, weight: 700, color: '#1a1a1a' };
        plan.typography.subtitle = { size: 14, color: '#555555' };
        const { options } = planToDevExtreme(plan);
        expect(options.title).toEqual({
            text: 'Quarterly Revenue',
            font: { family: 'Georgia', size: 24, weight: 700, color: '#1a1a1a' },
            subtitle: { text: 'By region, 2026', font: { size: 14, color: '#555555' } },
        });
    });

    it('applies a theme\'s axis label and axis title fonts to both axes identically', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.typography.axisLabel = { size: 13, color: '#333333' };
        plan.typography.axisTitle = { family: 'Georgia', size: 14, weight: 600 };
        const { options } = planToDevExtreme(plan);
        const argumentAxis = options.argumentAxis as Record<string, unknown>;
        const valueAxis = options.valueAxis as Record<string, unknown>;
        expect((argumentAxis.label as Record<string, unknown>).font).toEqual({ size: 13, color: '#333333' });
        expect((valueAxis.label as Record<string, unknown>).font).toEqual({ size: 13, color: '#333333' });
        expect((argumentAxis.title as Record<string, unknown>).font).toEqual({ family: 'Georgia', size: 14, weight: 600 });
        expect((valueAxis.title as Record<string, unknown>).font).toEqual({ family: 'Georgia', size: 14, weight: 600 });
    });

    it('applies a theme\'s legend font', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.typography.legend = { size: 13, color: '#222222' };
        const { options } = planToDevExtreme(plan);
        expect((options.legend as Record<string, unknown>).font).toEqual({ size: 13, color: '#222222' });
    });

    it('applies a theme\'s data-label font to every Cartesian series', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.typography.dataLabel = { size: 12, weight: 700 };
        const { options } = planToDevExtreme(plan);
        const series = options.series as Array<Record<string, unknown>>;
        for (const s of series) {
            expect((s.label as Record<string, unknown>).font).toEqual({ size: 12, weight: 700 });
        }
    });

    it('applies a theme\'s data-label font to a Circular chart\'s series', () => {
        const plan = assembleDevExpressPlan(pieInput);
        plan.typography.dataLabel = { size: 12, weight: 700 };
        const { options } = planToDevExtreme(plan);
        const series = options.series as Array<Record<string, unknown>>;
        expect((series[0].label as Record<string, unknown>).font).toEqual({ size: 12, weight: 700 });
    });

    it('applies a theme\'s legend font to a Circular chart', () => {
        const plan = assembleDevExpressPlan(pieInput);
        plan.typography.legend = { size: 13, color: '#222222' };
        const { options } = planToDevExtreme(plan);
        expect((options.legend as Record<string, unknown>).font).toEqual({ size: 13, color: '#222222' });
    });

    it('leaves every option untouched when plan.typography is entirely empty, exactly as before', () => {
        const plan = assembleDevExpressPlan(barInput);
        const { options } = planToDevExtreme(plan);
        const argumentAxis = options.argumentAxis as Record<string, unknown>;
        expect(argumentAxis.label).toBeUndefined();
        expect((options.legend as Record<string, unknown>).font).toBeUndefined();
        const series = options.series as Array<Record<string, unknown>>;
        expect((series[0].label as Record<string, unknown>).font).toBeUndefined();
    });

    // Regression for §4.8: label.format used to receive axis.labelFormat verbatim
    // (a raw d3 pattern like ',.2f'), which DevExtreme cannot read, so ticks
    // rendered wrong; and the currency prefix core computed for this same field
    // reached point labels via valueFormat but never the axis, so ticks and
    // point labels disagreed on one chart.
    it('gives the axis an LDML format and keeps the currency prefix', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.diagram!.axisY.labelFormat = ',.2f';
        plan.diagram!.axisY.labelPrefix = '$';
        const { options } = planToDevExtreme(plan);

        const valueAxis = options.valueAxis as Record<string, unknown>;
        const label = valueAxis.label as {
            format: unknown;
            customizeText: (info: { value: number; valueText: string }) => string;
        };
        expect(label.format).toEqual({ type: 'fixedPoint', precision: 2, useThousandsSeparator: true });
        // The prefix core computed must reach the ticks, not only the point labels.
        expect(typeof label.customizeText).toBe('function');
        expect(label.customizeText({ value: 1234.5, valueText: '1,234.50' })).toBe('$1,234.50');
    });

    // A pattern outside the grammar core actually emits (or a hand-authored
    // spec that strays from it) must not reach dxChart as a raw string it
    // cannot read — leaving `format` unset lets DevExtreme fall back to its
    // own default instead of rendering syntax as text.
    it('leaves label.format unset for a pattern outside the supported grammar', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.diagram!.axisY.labelFormat = '$,.2s';
        const { options } = planToDevExtreme(plan);
        const valueAxis = options.valueAxis as Record<string, unknown>;
        const label = valueAxis.label as Record<string, unknown> | undefined;
        expect(label?.format).toBeUndefined();
    });

    // An axis with no prefix/suffix must not grow a customizeText it doesn't
    // need — only the currency/unit case threads one through.
    it('adds no customizeText when the axis carries no prefix or suffix', () => {
        const plan = assembleDevExpressPlan(barInput);
        const { options } = planToDevExtreme(plan);
        const valueAxis = options.valueAxis as Record<string, unknown>;
        const label = valueAxis.label as Record<string, unknown> | undefined;
        expect(label?.customizeText).toBeUndefined();
    });

    // End-to-end: a real Price/USD field through the normal assembly pipeline.
    // Core resolves both the axis format (field-semantics.ts:356) and the
    // point/tooltip valueFormat from the same annotation, so the two must read
    // the same value the same way once projected.
    it('renders axis ticks and point labels identically for a real currency chart', () => {
        const plan = assembleDevExpressPlan({
            data: { values: [{ quarter: 'Q1', revenue: 1234.5 }, { quarter: 'Q2', revenue: 987.65 }] },
            semantic_types: { quarter: 'Quarter', revenue: { semanticType: 'Price', unit: 'USD' } },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'quarter' }, y: { field: 'revenue' } } },
        } as never);

        expect(plan.diagram!.axisY.labelFormat).toBe(',.2f');
        expect(plan.diagram!.axisY.labelPrefix).toBe('$');
        expect(plan.series[0].valueFormat).toEqual({ pattern: ',.2f', prefix: '$' });

        const { options } = planToDevExtreme(plan);
        const valueAxis = options.valueAxis as Record<string, unknown>;
        const axisLabel = valueAxis.label as { customizeText: (info: { value: number; valueText: string }) => string };
        const tickReading = axisLabel.customizeText({ value: 1234.5, valueText: '1,234.50' });

        const series = options.series as Array<Record<string, unknown>>;
        const pointLabel = series[0].label as { customizeText: (info: { value: number }) => string };
        const pointReading = pointLabel.customizeText({ value: 1234.5 });

        expect(tickReading).toBe('$1,234.50');
        expect(pointReading).toBe('$1,234.50');
        expect(tickReading).toBe(pointReading);
    });
});
