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

/**
 * The final whole-branch review probed the trust boundary with these plans and
 * found every one of them accepted, only to blow up later inside
 * `planToDevExtreme` as an unhelpful `TypeError`. The JSON Schema in `/schema`
 * already rejected all of them — nothing on the live code path ran it. Each
 * case now has to fail here, with a message that names the offending field.
 */
describe('prepareDevExpressPlan — malformed plans the renderer would choke on', () => {
    it('rejects a plan with no palette', () => {
        const { palette: _palette, ...plan } = validPlan();
        expect(() => prepareDevExpressPlan(plan)).toThrow(/palette must be an object/);
    });

    it('rejects a plan with no legend', () => {
        const { legend: _legend, ...plan } = validPlan();
        expect(() => prepareDevExpressPlan(plan)).toThrow(/legend must be an object/);
    });

    it('rejects a plan with no titles', () => {
        const { titles: _titles, ...plan } = validPlan();
        expect(() => prepareDevExpressPlan(plan)).toThrow(/titles must be an array/);
    });

    it('rejects a non-string chartType', () => {
        const plan = { ...validPlan(), chartType: 42 };
        expect(() => prepareDevExpressPlan(plan)).toThrow(/chartType must be a non-empty string/);
    });

    it('rejects an invalid legend position', () => {
        const plan = validPlan();
        plan.legend = { visible: true, position: 'moon' as never };
        expect(() => prepareDevExpressPlan(plan))
            .toThrow(/legend\.position must be one of right, bottom, none/);
    });

    it('rejects an invalid palette class', () => {
        const plan = validPlan();
        plan.palette = { class: 'rainbow' as never, colors: ['#4E79A7'] };
        expect(() => prepareDevExpressPlan(plan))
            .toThrow(/palette\.class must be one of categorical, sequential, diverging/);
    });

    it('rejects a Circular plan that still carries a diagram', () => {
        const plan = validPlan();
        plan.family = 'Circular';
        plan.series[0].viewType = 'Pie';
        expect(() => prepareDevExpressPlan(plan)).toThrow(/Circular plan must have a null diagram/);
    });

    it('accepts a Circular plan with a null diagram', () => {
        const plan = validPlan();
        plan.family = 'Circular';
        plan.diagram = null;
        plan.series[0].viewType = 'Pie';
        expect(prepareDevExpressPlan(plan).family).toBe('Circular');
    });

    it('rejects a malformed axis inside an otherwise valid diagram', () => {
        const plan = validPlan();
        plan.diagram!.axisY.includeZero = 'yes' as never;
        expect(() => prepareDevExpressPlan(plan))
            .toThrow(/diagram\.axisY\.includeZero must be a boolean/);
    });

    it('rejects a non-object diagram', () => {
        const plan = { ...validPlan(), diagram: 'xy' };
        expect(() => prepareDevExpressPlan(plan)).toThrow(/diagram must be an object/);
    });

    it('rejects an invalid series scale type', () => {
        const plan = validPlan();
        plan.series[0].argumentScaleType = 'Ordinal' as never;
        expect(() => prepareDevExpressPlan(plan))
            .toThrow(/argumentScaleType must be one of Qualitative, Numerical, DateTime/);
    });

    it('rejects a non-boolean labelsVisible', () => {
        const plan = validPlan();
        plan.series[0].labelsVisible = 1 as never;
        expect(() => prepareDevExpressPlan(plan)).toThrow(/labelsVisible must be a boolean/);
    });

    it('rejects a non-string value field', () => {
        const plan = validPlan();
        plan.series[0].valueFields = [7 as never];
        expect(() => prepareDevExpressPlan(plan)).toThrow(/valueFields\[0\] must be a non-empty string/);
    });

    it('rejects a non-string palette colour', () => {
        const plan = validPlan();
        plan.palette.colors = [null as never];
        expect(() => prepareDevExpressPlan(plan)).toThrow(/palette\.colors\[0\] must be a non-empty string/);
    });

    it('rejects a title with an unknown role', () => {
        const plan = validPlan();
        plan.titles = [{ text: 'Revenue', role: 'footer' as never }];
        expect(() => prepareDevExpressPlan(plan))
            .toThrow(/titles\[0\]\.role must be one of chart, subtitle/);
    });

    it('rejects a warning with an unknown severity', () => {
        const plan = validPlan();
        plan.warnings = [{ severity: 'fatal' as never, code: 'x', message: 'y' }];
        expect(() => prepareDevExpressPlan(plan))
            .toThrow(/warnings\[0\]\.severity must be one of info, warning, error/);
    });

    it('rejects an unsupported note with an unknown action', () => {
        const plan = validPlan();
        plan.unsupported = [{ feature: 'facet', action: 'ignored' as never, detail: 'd' }];
        expect(() => prepareDevExpressPlan(plan))
            .toThrow(/unsupported\[0\]\.action must be one of rejected, downgraded/);
    });

    it('rejects a data point that is not an object', () => {
        const plan = validPlan();
        plan.data.points = [[1, 2] as never];
        expect(() => prepareDevExpressPlan(plan)).toThrow(/data\.points\[0\] must be an object/);
    });
});
