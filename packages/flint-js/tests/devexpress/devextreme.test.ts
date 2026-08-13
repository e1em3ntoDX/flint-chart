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
});
