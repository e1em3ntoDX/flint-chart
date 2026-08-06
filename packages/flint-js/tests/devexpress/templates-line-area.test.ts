import { describe, it, expect } from 'vitest';
import { dxGetTemplateDef } from '../../src/devexpress/templates';
import type { DevExpressChartPlan } from '../../src/devexpress/plan';
import type { InstantiateContext } from '../../src/core/types';

function draft(): Partial<DevExpressChartPlan> {
    return { series: [], titles: [], warnings: [], unsupported: [] };
}

function context(overrides: Partial<InstantiateContext> = {}): InstantiateContext {
    return {
        channelSemantics: {
            x: { field: 'month', type: 'temporal' } as never,
            y: { field: 'sales', type: 'quantitative', zero: true } as never,
        },
        layout: {} as never,
        table: [{ month: '2026-01', sales: 10 }, { month: '2026-02', sales: 14 }],
        resolvedEncodings: {},
        encodings: { x: { field: 'month' }, y: { field: 'sales' } },
        canvasSize: { width: 400, height: 320 },
        semanticTypes: { month: 'YearMonth', sales: 'Price' },
        chartType: 'Line Chart',
        ...overrides,
    } as InstantiateContext;
}

describe('Line Chart template', () => {
    it('emits a Line series with a DateTime argument axis', () => {
        const def = dxGetTemplateDef('Line Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context());
        expect(plan.series![0].viewType).toBe('Line');
        expect(plan.series![0].argumentScaleType).toBe('DateTime');
    });

    it('honours the interpolate chart property', () => {
        const def = dxGetTemplateDef('Line Chart', 'devextreme')!;
        for (const [value, expected] of [['spline', 'Spline'], ['step', 'StepLine']] as const) {
            const plan = draft();
            def.instantiate(plan, context({ chartProperties: { interpolate: value } }));
            expect(plan.series![0].viewType).toBe(expected);
        }
    });

    it('emits one series per colour value', () => {
        const def = dxGetTemplateDef('Line Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            encodings: { x: { field: 'month' }, y: { field: 'sales' }, color: { field: 'sku' } },
            channelSemantics: {
                x: { field: 'month', type: 'temporal' } as never,
                y: { field: 'sales', type: 'quantitative' } as never,
                color: { field: 'sku', type: 'nominal' } as never,
            },
            table: [
                { month: '2026-01', sales: 10, sku: 'A' },
                { month: '2026-01', sales: 20, sku: 'B' },
            ],
        }));
        expect(plan.series!.map((s) => s.name)).toEqual(['A', 'B']);
        expect(plan.legend!.visible).toBe(true);
    });

    it('never rotates — Flint omits transpose for line charts', () => {
        const def = dxGetTemplateDef('Line Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({ chartProperties: { orient: 'horizontal' } }));
        expect(plan.diagram!.rotated).toBe(false);
    });
});

describe('Area Chart template', () => {
    it('uses Area, StackedArea and FullStackedArea per stackable', () => {
        const def = dxGetTemplateDef('Area Chart', 'devextreme')!;
        const cases: Array<[unknown, string]> = [
            [undefined, 'Area'], ['sum', 'StackedArea'], ['normalize', 'FullStackedArea'],
        ];
        for (const [stackable, expected] of cases) {
            const plan = draft();
            def.instantiate(plan, context({
                chartType: 'Area Chart',
                encodings: { x: { field: 'month' }, y: { field: 'sales' }, color: { field: 'sku' } },
                channelSemantics: {
                    x: { field: 'month', type: 'temporal' } as never,
                    y: { field: 'sales', type: 'quantitative', stackable } as never,
                    color: { field: 'sku', type: 'nominal' } as never,
                },
                table: [{ month: '2026-01', sales: 10, sku: 'A' }],
            }));
            expect(plan.series![0].viewType).toBe(expected);
        }
    });
});

describe('Range Area Chart template', () => {
    it('emits a RangeArea series with two value fields', () => {
        const def = dxGetTemplateDef('Range Area Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Range Area Chart',
            encodings: { x: { field: 'month' }, y: { field: 'low' }, y2: { field: 'high' } },
            channelSemantics: {
                x: { field: 'month', type: 'temporal' } as never,
                y: { field: 'low', type: 'quantitative' } as never,
                y2: { field: 'high', type: 'quantitative' } as never,
            },
            table: [{ month: '2026-01', low: 5, high: 15 }],
        }));
        expect(plan.series![0].viewType).toBe('RangeArea');
        expect(plan.series![0].valueFields).toEqual(['low', 'high']);
    });

    it('requires the y2 channel', () => {
        const def = dxGetTemplateDef('Range Area Chart', 'devextreme')!;
        expect(def.requiredChannels).toContain('y2');
    });
});
