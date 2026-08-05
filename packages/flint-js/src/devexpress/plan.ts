// flint-chart/packages/flint-js/src/devexpress/plan.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * DevExpress backend plan types.
 *
 * The plan is a declarative, target-neutral description of a DevExpress chart:
 * resolved data points plus series view types, axes, legend, palette and titles.
 * A host renders it — DevExtreme via planToDevExtreme(), or a .NET renderer that
 * builds ChartControl / XRChart from the same JSON.
 *
 * Deliberately carries no pixel geometry: the DevExpress control lays itself out.
 */

import type { ChartWarning } from '../core/types';

export const DEVEXPRESS_PLAN_SCHEMA = 'flint.devexpress.chart/v1' as const;

/** Which rendering target a plan was compiled for. */
export type RenderTarget = 'devextreme' | 'xtracharts';

/**
 * Chart family, deliberately target-neutral. DevExtreme maps Cartesian to
 * dxChart and Circular to dxPieChart; XtraCharts serves both from a single
 * ChartControl, differing only in diagram type.
 */
export type PlanFamily = 'Cartesian' | 'Circular';

export type ArgumentScaleType = 'Qualitative' | 'Numerical' | 'DateTime';
export type ValueScaleType = 'Numerical' | 'DateTime';

export interface SeriesPlan {
    /** Legend/series name. */
    name: string;
    /** DevExpress.XtraCharts.ViewType member NAME. Never a numeric value. */
    viewType: string;
    /** Field supplying point arguments. */
    argumentField: string;
    /** Fields supplying point values. More than one for range and financial views. */
    valueFields: string[];
    argumentScaleType: ArgumentScaleType;
    valueScaleType: ValueScaleType;
    /** Explicit series colour, when Flint's colour decisions assigned one. */
    color?: string;
    labelsVisible: boolean;
    /** Marker kind name for point-family views, e.g. "Circle". */
    markerKind?: string;
}

export interface AxisPlan {
    title?: string;
    /** Format string for tick labels. */
    labelFormat?: string;
    /** From Flint's zero decision. Ignored on qualitative axes. */
    includeZero: boolean;
    logarithmic: boolean;
    gridLines: boolean;
    reverse: boolean;
}

export interface DiagramPlan {
    /** True for horizontal bars. */
    rotated: boolean;
    axisX: AxisPlan;
    axisY: AxisPlan;
}

export interface PalettePlan {
    class: 'categorical' | 'sequential' | 'diverging';
    /** Ordered hex colours. */
    colors: string[];
}

export interface TitlePlan {
    text: string;
    role: 'chart' | 'subtitle';
}

/** A capability the source spec asked for that the plan could not honour verbatim. */
export interface UnsupportedNote {
    feature: string;
    action: 'rejected' | 'downgraded';
    detail: string;
}

export interface DevExpressChartPlan {
    schema: typeof DEVEXPRESS_PLAN_SCHEMA;
    /** The Flint chart type this plan was compiled from, for provenance. */
    chartType: string;
    target: RenderTarget;
    family: PlanFamily;
    dataMode: 'materialized';
    data: { points: Record<string, unknown>[] };
    series: SeriesPlan[];
    /** Null when family is Circular. */
    diagram: DiagramPlan | null;
    legend: { visible: boolean; position: 'right' | 'bottom' | 'none' };
    palette: PalettePlan;
    titles: TitlePlan[];
    /** Flint assembler warnings: overflow truncation, colour capping, aggregation. */
    warnings: ChartWarning[];
    unsupported: UnsupportedNote[];
}
