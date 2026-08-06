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
});
