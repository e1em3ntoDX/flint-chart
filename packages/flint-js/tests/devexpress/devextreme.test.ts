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

    it('throws on an xtracharts-only view type', () => {
        const plan = assembleDevExpressPlan(barInput);
        plan.series[0].viewType = 'Waterfall';
        expect(() => planToDevExtreme(plan)).toThrow(/no dxChart series type/);
    });
});
