// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DEVEXPRESS_PLAN_SCHEMA, type DevExpressChartPlan, type RenderTarget } from './plan';

/** ViewType member names available on every DevExpress chart target. */
export const SHARED_VIEW_TYPES = [
    'Bar', 'StackedBar', 'FullStackedBar',
    'Line', 'Spline', 'StepLine', 'ScatterLine',
    'Area', 'StackedArea', 'FullStackedArea', 'RangeArea',
    'Point', 'Bubble',
    'CandleStick',
    'Pie', 'Doughnut',
] as const;

/** ViewType member names that exist in XtraCharts but not in the dxChart series list. */
export const XTRACHARTS_ONLY_VIEW_TYPES = [
    'Waterfall', 'BoxPlot', 'Gantt', 'RadarLine', 'RadarArea', 'Funnel',
] as const;

export const SUPPORTED_VIEW_TYPES = [
    ...SHARED_VIEW_TYPES,
    ...XTRACHARTS_ONLY_VIEW_TYPES,
] as const;

export const VIEW_TYPES_BY_TARGET: Record<RenderTarget, ReadonlySet<string>> = {
    devextreme: new Set<string>(SHARED_VIEW_TYPES),
    xtracharts: new Set<string>(SUPPORTED_VIEW_TYPES),
};

const allViewTypes = new Set<string>(SUPPORTED_VIEW_TYPES);

/**
 * Validates an untrusted value as a DevExpress chart plan.
 * This is the trust boundary between model-influenced input and a live control.
 */
export function prepareDevExpressPlan(value: unknown): DevExpressChartPlan {
    if (!value || typeof value !== 'object') {
        throw new Error('DevExpress plan must be an object.');
    }
    const plan = value as Partial<DevExpressChartPlan>;

    if (plan.schema !== DEVEXPRESS_PLAN_SCHEMA) {
        throw new Error(`Expected a ${DEVEXPRESS_PLAN_SCHEMA} plan.`);
    }
    if (plan.target !== 'devextreme' && plan.target !== 'xtracharts') {
        throw new Error('DevExpress plan target must be devextreme or xtracharts.');
    }
    if (plan.family !== 'Cartesian' && plan.family !== 'Circular') {
        throw new Error('DevExpress plan family must be Cartesian or Circular.');
    }
    if (plan.dataMode !== 'materialized') {
        throw new Error('DevExpress plan dataMode must be materialized.');
    }
    if (!plan.data || !Array.isArray(plan.data.points) || plan.data.points.length === 0) {
        throw new Error('DevExpress plan requires at least one data point.');
    }
    if (!Array.isArray(plan.series) || plan.series.length === 0) {
        throw new Error('DevExpress plan requires at least one series.');
    }

    const allowed = VIEW_TYPES_BY_TARGET[plan.target];
    for (const series of plan.series) {
        if (typeof series.viewType !== 'string' || !allViewTypes.has(series.viewType)) {
            throw new Error(`Unsupported DevExpress view type: ${String(series.viewType)}.`);
        }
        if (!allowed.has(series.viewType)) {
            throw new Error(
                `View type ${series.viewType} is not available on target ${plan.target}.`,
            );
        }
        if (!Array.isArray(series.valueFields) || series.valueFields.length === 0) {
            throw new Error(`Series ${series.name} requires at least one value field.`);
        }
        if (typeof series.argumentField !== 'string' || series.argumentField.length === 0) {
            throw new Error(`Series ${series.name} requires an argument field.`);
        }
    }

    if (plan.family === 'Cartesian' && !plan.diagram) {
        throw new Error('A Cartesian plan requires a diagram.');
    }
    if (!Array.isArray(plan.warnings) || !Array.isArray(plan.unsupported)) {
        throw new Error('DevExpress plan requires warnings and unsupported arrays.');
    }

    return plan as DevExpressChartPlan;
}
