// flint-chart/packages/flint-js/tests/devexpress/schema.test.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { SUPPORTED_VIEW_TYPES, prepareDevExpressPlan } from '../../src/devexpress/artifact';

const schemaPath = resolve(__dirname, '../../../../../schema/flint.devexpress.chart.v1.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validate = new Ajv2020({ strict: true }).compile(schema);

function validPlan() {
    return {
        schema: 'flint.devexpress.chart/v1',
        chartType: 'Bar Chart',
        target: 'devextreme',
        family: 'Cartesian',
        dataMode: 'materialized',
        data: { points: [{ quarter: 'Q1', revenue: 1200 }] },
        series: [{
            name: 'revenue', viewType: 'Bar', argumentField: 'quarter', valueFields: ['revenue'],
            argumentScaleType: 'Qualitative', valueScaleType: 'Numerical', labelsVisible: false,
        }],
        diagram: {
            rotated: false,
            axisX: { includeZero: false, logarithmic: false, gridLines: false, reverse: false },
            axisY: { includeZero: true, logarithmic: false, gridLines: true, reverse: false },
        },
        legend: { visible: false, position: 'none' },
        palette: { class: 'categorical', colors: ['#4E79A7'] },
        titles: [],
        typography: {},
        warnings: [],
        unsupported: [],
    };
}

describe('flint.devexpress.chart/v1 schema', () => {
    it('accepts a plan that the TypeScript validator also accepts', () => {
        const plan = validPlan();
        expect(prepareDevExpressPlan(plan)).toBeDefined();
        expect(validate(plan), JSON.stringify(validate.errors)).toBe(true);
    });

    it('rejects an unknown top-level property', () => {
        expect(validate({ ...validPlan(), bogus: 1 })).toBe(false);
    });

    it('rejects an empty series array', () => {
        expect(validate({ ...validPlan(), series: [] })).toBe(false);
    });

    it('enumerates exactly the view types the code supports', () => {
        const enumerated = schema.$defs.viewType.enum as string[];
        expect([...enumerated].sort()).toEqual([...SUPPORTED_VIEW_TYPES].sort());
    });
});

/**
 * The schema is the cross-language contract; `prepareDevExpressPlan` is the
 * runtime gate the TypeScript side actually executes. They are two expressions
 * of one rule, written in two languages, so the only thing keeping them honest
 * is this: one corpus, both validators, same verdict.
 *
 * Written because the final whole-branch review found the runtime gate was
 * accepting plans the schema had always rejected — the schema was, in practice,
 * documentation.
 */
describe('schema and prepareDevExpressPlan agree', () => {
    function circularPlan() {
        const plan = validPlan();
        plan.family = 'Circular';
        plan.diagram = null as never;
        plan.series[0].viewType = 'Pie';
        return plan;
    }

    const accepted: Array<[string, () => unknown]> = [
        ['a Cartesian bar plan', validPlan],
        ['a Circular pie plan', circularPlan],
        ['a plan carrying titles, warnings and unsupported notes', () => ({
            ...validPlan(),
            titles: [{ text: 'Revenue by quarter', role: 'chart' }],
            warnings: [{ severity: 'info', code: 'series-split-aggregated', message: 'combined' }],
            unsupported: [{ feature: 'facet', action: 'rejected', detail: 'no facet grid' }],
        })],
        ['a multi-series plan with one value column per series', () => ({
            ...validPlan(),
            data: { points: [{ quarter: 'Q1', North: 100, South: 50 }] },
            series: [
                {
                    name: 'North', viewType: 'Bar', argumentField: 'quarter', valueFields: ['North'],
                    argumentScaleType: 'Qualitative', valueScaleType: 'Numerical', labelsVisible: false,
                },
                {
                    name: 'South', viewType: 'Bar', argumentField: 'quarter', valueFields: ['South'],
                    argumentScaleType: 'Qualitative', valueScaleType: 'Numerical', labelsVisible: false,
                },
            ],
        })],
        ['a plan with a series valueFormat', () => {
            const p = validPlan();
            (p.series[0] as Record<string, unknown>).valueFormat = { pattern: ',.2f', prefix: '$' };
            return p;
        }],
        ['a plan carrying resolved typography', () => ({
            ...validPlan(),
            typography: {
                title: { family: 'Georgia', size: 24, weight: 700, color: '#1a1a1a' },
                axisLabel: { size: 13 },
            },
        })],
    ];

    const rejected: Array<[string, () => unknown]> = [
        ['no palette', () => { const p = validPlan(); delete (p as Record<string, unknown>).palette; return p; }],
        ['no legend', () => { const p = validPlan(); delete (p as Record<string, unknown>).legend; return p; }],
        ['no titles', () => { const p = validPlan(); delete (p as Record<string, unknown>).titles; return p; }],
        ['no diagram key at all', () => { const p = validPlan(); delete (p as Record<string, unknown>).diagram; return p; }],
        ['no warnings', () => { const p = validPlan(); delete (p as Record<string, unknown>).warnings; return p; }],
        ['no unsupported', () => { const p = validPlan(); delete (p as Record<string, unknown>).unsupported; return p; }],
        ['no typography', () => { const p = validPlan(); delete (p as Record<string, unknown>).typography; return p; }],
        ['a typography font with a non-string family', () => ({
            ...validPlan(), typography: { title: { family: 42 } },
        })],
        ['a typography font with a non-number size', () => ({
            ...validPlan(), typography: { axisLabel: { size: '14px' } },
        })],
        ['a numeric chartType', () => ({ ...validPlan(), chartType: 42 })],
        ['an invalid legend position', () => ({ ...validPlan(), legend: { visible: true, position: 'moon' } })],
        ['an invalid palette class', () => ({ ...validPlan(), palette: { class: 'rainbow', colors: [] } })],
        ['an unknown view type', () => {
            const p = validPlan(); p.series[0].viewType = 'Violin'; return p;
        }],
        ['an empty series list', () => ({ ...validPlan(), series: [] })],
        ['a non-boolean axis flag', () => {
            const p = validPlan();
            (p.diagram.axisY as Record<string, unknown>).includeZero = 'yes';
            return p;
        }],
        ['an invalid argument scale type', () => {
            const p = validPlan(); p.series[0].argumentScaleType = 'Ordinal'; return p;
        }],
        ['a title with an unknown role', () => ({
            ...validPlan(), titles: [{ text: 'x', role: 'footer' }],
        })],
        ['a warning with an unknown severity', () => ({
            ...validPlan(), warnings: [{ severity: 'fatal', code: 'x', message: 'y' }],
        })],
        ['an unsupported note with an unknown action', () => ({
            ...validPlan(), unsupported: [{ feature: 'f', action: 'ignored', detail: 'd' }],
        })],
        ['a non-object data point', () => ({ ...validPlan(), data: { points: [[1, 2]] } })],
        ['a non-string value field', () => {
            const p = validPlan(); p.series[0].valueFields = [7 as never]; return p;
        }],
        ['a valueFormat with a non-string pattern', () => {
            const p = validPlan();
            (p.series[0] as Record<string, unknown>).valueFormat = { pattern: 42 };
            return p;
        }],
    ];

    // A Circular plan that still carries a diagram is the one case the JSON
    // Schema cannot express on its own (it has no `family`-conditional), so the
    // runtime gate has to catch it alone. Recorded here rather than in the
    // shared corpus so the asymmetry is deliberate and visible.
    it('rejects a Circular plan with a diagram at runtime, which the schema alone cannot', () => {
        const plan = validPlan();
        plan.family = 'Circular';
        plan.series[0].viewType = 'Pie';
        expect(() => prepareDevExpressPlan(plan)).toThrow(/Circular plan must have a null diagram/);
        expect(validate(plan)).toBe(true);
    });

    for (const [name, build] of accepted) {
        it(`both accept ${name}`, () => {
            const plan = build();
            expect(validate(plan), JSON.stringify(validate.errors)).toBe(true);
            expect(() => prepareDevExpressPlan(plan)).not.toThrow();
        });
    }

    for (const [name, build] of rejected) {
        it(`both reject ${name}`, () => {
            const plan = build();
            expect(validate(plan)).toBe(false);
            expect(() => prepareDevExpressPlan(plan)).toThrow();
        });
    }
});
