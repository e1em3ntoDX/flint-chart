import { describe, it, expect } from 'vitest';
import { prepareDevExpressPlan } from '../../src/devexpress/artifact';
import type { DevExpressChartPlan } from '../../src/devexpress/plan';

function validPlan(): DevExpressChartPlan {
    return {
        schema: 'flint.devexpress.chart/v1',
        chartType: 'Bar Chart',
        target: 'devextreme',
        family: 'Cartesian',
        dataMode: 'materialized',
        data: { points: [{ quarter: 'Q1', revenue: 1200 }] },
        series: [{
            name: 'revenue',
            viewType: 'Bar',
            argumentField: 'quarter',
            valueFields: ['revenue'],
            argumentScaleType: 'Qualitative',
            valueScaleType: 'Numerical',
            labelsVisible: false,
        }],
        diagram: {
            rotated: false,
            axisX: { includeZero: false, logarithmic: false, gridLines: false, reverse: false },
            axisY: { includeZero: true, logarithmic: false, gridLines: true, reverse: false },
        },
        legend: { visible: false, position: 'none' },
        palette: { class: 'categorical', colors: ['#4E79A7'] },
        titles: [],
        warnings: [],
        unsupported: [],
    };
}

describe('prepareDevExpressPlan', () => {
    it('accepts a valid plan', () => {
        expect(prepareDevExpressPlan(validPlan()).chartType).toBe('Bar Chart');
    });

    it('rejects a non-object', () => {
        expect(() => prepareDevExpressPlan(null)).toThrow(/must be an object/);
    });

    it('rejects a wrong schema discriminator', () => {
        const plan = { ...validPlan(), schema: 'flint.excel.chart/v1' };
        expect(() => prepareDevExpressPlan(plan)).toThrow(/flint\.devexpress\.chart\/v1/);
    });

    it('rejects a view type unknown to DevExpress', () => {
        const plan = validPlan();
        plan.series[0].viewType = 'Violin';
        expect(() => prepareDevExpressPlan(plan)).toThrow(/Unsupported DevExpress view type: Violin/);
    });

    it('rejects a view type not available on the requested target', () => {
        const plan = validPlan();
        plan.series[0].viewType = 'Waterfall';   // xtracharts-only
        expect(() => prepareDevExpressPlan(plan)).toThrow(/not available on target devextreme/);
    });

    it('accepts an xtracharts-only view type when the target is xtracharts', () => {
        const plan = validPlan();
        plan.target = 'xtracharts';
        plan.series[0].viewType = 'Waterfall';
        expect(prepareDevExpressPlan(plan).series[0].viewType).toBe('Waterfall');
    });

    it('rejects an empty series list', () => {
        const plan = { ...validPlan(), series: [] };
        expect(() => prepareDevExpressPlan(plan)).toThrow(/at least one series/);
    });

    it('rejects a Cartesian plan with no diagram', () => {
        const plan = { ...validPlan(), diagram: null };
        expect(() => prepareDevExpressPlan(plan)).toThrow(/Cartesian plan requires a diagram/);
    });

    it('rejects a series whose valueFields is empty', () => {
        const plan = validPlan();
        plan.series[0].valueFields = [];
        expect(() => prepareDevExpressPlan(plan)).toThrow(/at least one value field/);
    });
});
