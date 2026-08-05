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
