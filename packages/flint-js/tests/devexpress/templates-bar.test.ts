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
            x: { field: 'quarter', type: 'nominal' } as never,
            y: { field: 'revenue', type: 'quantitative', zero: true } as never,
        },
        layout: {} as never,
        table: [{ quarter: 'Q1', revenue: 1200 }, { quarter: 'Q2', revenue: 1450 }],
        resolvedEncodings: {},
        encodings: { x: { field: 'quarter' }, y: { field: 'revenue' } },
        canvasSize: { width: 400, height: 320 },
        semanticTypes: { quarter: 'Quarter', revenue: 'Price' },
        chartType: 'Bar Chart',
        ...overrides,
    } as InstantiateContext;
}

describe('Bar Chart template', () => {
    it('emits one Bar series bound to the x and y fields', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context());
        expect(plan.series).toHaveLength(1);
        expect(plan.series![0].viewType).toBe('Bar');
        expect(plan.series![0].argumentField).toBe('quarter');
        expect(plan.series![0].valueFields).toEqual(['revenue']);
        expect(plan.series![0].argumentScaleType).toBe('Qualitative');
    });

    it('carries the zero decision onto the value axis', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context());
        expect(plan.diagram!.axisY.includeZero).toBe(true);
        expect(plan.diagram!.rotated).toBe(false);
    });

    it('rotates when chartProperties.orient is horizontal', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({ chartProperties: { orient: 'horizontal' } }));
        expect(plan.diagram!.rotated).toBe(true);
    });

    it('writes no layout geometry into the plan', () => {
        const def = dxGetTemplateDef('Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context());
        const json = JSON.stringify(plan);
        for (const forbidden of ['subplotWidth', 'xStep', 'titleFontSize', 'legendFontSize']) {
            expect(json).not.toContain(forbidden);
        }
    });
});

describe('Grouped Bar Chart template', () => {
    it('emits one Bar series per group value', () => {
        const def = dxGetTemplateDef('Grouped Bar Chart', 'devextreme')!;
        const plan = draft();
        def.instantiate(plan, context({
            chartType: 'Grouped Bar Chart',
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, group: { field: 'region' } },
            channelSemantics: {
                x: { field: 'quarter', type: 'nominal' } as never,
                y: { field: 'revenue', type: 'quantitative', zero: true } as never,
                group: { field: 'region', type: 'nominal' } as never,
            },
            table: [
                { quarter: 'Q1', revenue: 100, region: 'North' },
                { quarter: 'Q1', revenue: 200, region: 'South' },
                { quarter: 'Q2', revenue: 150, region: 'North' },
            ],
        }));
        expect(plan.series!.map((s) => s.name).sort()).toEqual(['North', 'South']);
        expect(plan.series!.every((s) => s.viewType === 'Bar')).toBe(true);
    });
});

describe('Stacked Bar Chart template', () => {
    it('uses StackedBar, and FullStackedBar when normalized', () => {
        const def = dxGetTemplateDef('Stacked Bar Chart', 'devextreme')!;
        const base = context({
            chartType: 'Stacked Bar Chart',
            encodings: { x: { field: 'quarter' }, y: { field: 'revenue' }, color: { field: 'region' } },
            channelSemantics: {
                x: { field: 'quarter', type: 'nominal' } as never,
                y: { field: 'revenue', type: 'quantitative', zero: true, stackable: 'sum' } as never,
                color: { field: 'region', type: 'nominal' } as never,
            },
            table: [
                { quarter: 'Q1', revenue: 100, region: 'North' },
                { quarter: 'Q1', revenue: 200, region: 'South' },
            ],
        });

        const stacked = draft();
        def.instantiate(stacked, base);
        expect(stacked.series!.every((s) => s.viewType === 'StackedBar')).toBe(true);

        const full = draft();
        def.instantiate(full, context({
            ...base,
            channelSemantics: {
                ...base.channelSemantics,
                y: { field: 'revenue', type: 'quantitative', stackable: 'normalize' } as never,
            },
        }));
        expect(full.series!.every((s) => s.viewType === 'FullStackedBar')).toBe(true);
    });
});
