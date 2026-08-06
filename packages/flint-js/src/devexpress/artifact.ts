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

const LEGEND_POSITIONS = ['right', 'bottom', 'none'] as const;
const PALETTE_CLASSES = ['categorical', 'sequential', 'diverging'] as const;
const TITLE_ROLES = ['chart', 'subtitle'] as const;
const ARGUMENT_SCALE_TYPES = ['Qualitative', 'Numerical', 'DateTime'] as const;
const VALUE_SCALE_TYPES = ['Numerical', 'DateTime'] as const;
const WARNING_SEVERITIES = ['info', 'warning', 'error'] as const;
const UNSUPPORTED_ACTIONS = ['rejected', 'downgraded'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, what: string): Record<string, unknown> {
    if (!isPlainObject(value)) {
        throw new Error(`DevExpress plan ${what} must be an object (got ${JSON.stringify(value)}).`);
    }
    return value;
}

function requireString(value: unknown, what: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(
            `DevExpress plan ${what} must be a non-empty string (got ${JSON.stringify(value)}).`,
        );
    }
    return value;
}

function requireBoolean(value: unknown, what: string): void {
    if (typeof value !== 'boolean') {
        throw new Error(
            `DevExpress plan ${what} must be a boolean (got ${JSON.stringify(value)}).`,
        );
    }
}

/** Free text: the schema puts no minimum length on it, so neither does this. */
function requireText(value: unknown, what: string): void {
    if (typeof value !== 'string') {
        throw new Error(
            `DevExpress plan ${what} must be a string (got ${JSON.stringify(value)}).`,
        );
    }
}

function requireOptionalString(value: unknown, what: string): void {
    if (value !== undefined && typeof value !== 'string') {
        throw new Error(
            `DevExpress plan ${what} must be a string when present (got ${JSON.stringify(value)}).`,
        );
    }
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): void {
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
        throw new Error(
            `DevExpress plan ${what} must be one of ${allowed.join(', ')} ` +
            `(got ${JSON.stringify(value)}).`,
        );
    }
}

function requireArray(value: unknown, what: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`DevExpress plan ${what} must be an array (got ${JSON.stringify(value)}).`);
    }
    return value;
}

function validateAxis(value: unknown, what: string): void {
    const axis = requireObject(value, what);
    requireBoolean(axis.includeZero, `${what}.includeZero`);
    requireBoolean(axis.logarithmic, `${what}.logarithmic`);
    requireBoolean(axis.gridLines, `${what}.gridLines`);
    requireBoolean(axis.reverse, `${what}.reverse`);
    requireOptionalString(axis.title, `${what}.title`);
    requireOptionalString(axis.labelFormat, `${what}.labelFormat`);
}

/**
 * Validates an untrusted value as a DevExpress chart plan.
 * This is the trust boundary between model-influenced input and a live control.
 *
 * The checks below mirror `/schema/flint.devexpress.chart.v1.schema.json`
 * field for field — that schema is the cross-language contract, so it, not this
 * file, is the source of truth for what a valid plan is. They are hand-written
 * rather than an ajv run against the schema file for two reasons that are about
 * shipping, not taste: `flint-chart` is a browser-targeted bundle, so a runtime
 * `node:fs` read of a JSON file (which lives outside this package, in the
 * consuming repo's `/schema`) is not available to it, and ajv is a
 * devDependency whose promotion to a runtime dependency would put a JSON-Schema
 * compiler in every consumer's bundle for a fixed, closed object shape.
 *
 * Drift is prevented by test instead: `tests/devexpress/schema.test.ts` runs one
 * corpus of malformed plans through BOTH ajv-against-the-real-schema-file and
 * this function, and fails if the two ever disagree.
 *
 * Two deliberate divergences, both in the direction of "reject at least as much
 * as the schema does":
 *   - The schema sets `additionalProperties: false` everywhere; this function
 *     ignores unknown properties, so a newer producer's plan stays usable by an
 *     older renderer.
 *   - Fields that name something a renderer must resolve — `chartType`, a
 *     series' `name`/`argumentField`/`valueFields`, palette colours — must be
 *     non-empty here, where the schema only says `type: string`. An empty
 *     field name resolves to nothing and would render an empty chart.
 */
export function prepareDevExpressPlan(value: unknown): DevExpressChartPlan {
    if (!value || typeof value !== 'object') {
        throw new Error('DevExpress plan must be an object.');
    }
    const plan = value as Partial<DevExpressChartPlan>;

    if (plan.schema !== DEVEXPRESS_PLAN_SCHEMA) {
        throw new Error(`Expected a ${DEVEXPRESS_PLAN_SCHEMA} plan.`);
    }
    requireString(plan.chartType, 'chartType');
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
    for (const [index, point] of plan.data.points.entries()) {
        requireObject(point, `data.points[${index}]`);
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
        for (const [index, field] of series.valueFields.entries()) {
            requireString(field, `series ${series.name} valueFields[${index}]`);
        }
        if (typeof series.argumentField !== 'string' || series.argumentField.length === 0) {
            throw new Error(`Series ${series.name} requires an argument field.`);
        }
        requireString(series.name, 'series name');
        requireEnum(
            series.argumentScaleType, ARGUMENT_SCALE_TYPES,
            `series ${series.name} argumentScaleType`,
        );
        requireEnum(
            series.valueScaleType, VALUE_SCALE_TYPES,
            `series ${series.name} valueScaleType`,
        );
        requireBoolean(series.labelsVisible, `series ${series.name} labelsVisible`);
        requireOptionalString(series.color, `series ${series.name} color`);
        requireOptionalString(series.markerKind, `series ${series.name} markerKind`);
    }

    if (plan.family === 'Cartesian') {
        if (!plan.diagram) {
            throw new Error('A Cartesian plan requires a diagram.');
        }
        const diagram = requireObject(plan.diagram, 'diagram');
        requireBoolean(diagram.rotated, 'diagram.rotated');
        validateAxis(diagram.axisX, 'diagram.axisX');
        validateAxis(diagram.axisY, 'diagram.axisY');
    } else if (plan.diagram != null) {
        // A Circular plan with a diagram is not a harmless extra: it says the
        // producer thinks this is a Cartesian chart, and a renderer that trusts
        // `family` would silently drop axes the plan claims to have.
        throw new Error('A Circular plan must have a null diagram.');
    }

    const legend = requireObject(plan.legend, 'legend');
    requireBoolean(legend.visible, 'legend.visible');
    requireEnum(legend.position, LEGEND_POSITIONS, 'legend.position');

    const palette = requireObject(plan.palette, 'palette');
    requireEnum(palette.class, PALETTE_CLASSES, 'palette.class');
    for (const [index, color] of requireArray(palette.colors, 'palette.colors').entries()) {
        requireString(color, `palette.colors[${index}]`);
    }

    for (const [index, title] of requireArray(plan.titles, 'titles').entries()) {
        const entry = requireObject(title, `titles[${index}]`);
        requireText(entry.text, `titles[${index}].text`);
        requireEnum(entry.role, TITLE_ROLES, `titles[${index}].role`);
    }

    if (!Array.isArray(plan.warnings) || !Array.isArray(plan.unsupported)) {
        throw new Error('DevExpress plan requires warnings and unsupported arrays.');
    }
    for (const [index, warning] of plan.warnings.entries()) {
        const entry = requireObject(warning, `warnings[${index}]`);
        requireEnum(entry.severity, WARNING_SEVERITIES, `warnings[${index}].severity`);
        requireText(entry.code, `warnings[${index}].code`);
        requireText(entry.message, `warnings[${index}].message`);
    }
    for (const [index, note] of plan.unsupported.entries()) {
        const entry = requireObject(note, `unsupported[${index}]`);
        requireText(entry.feature, `unsupported[${index}].feature`);
        requireEnum(entry.action, UNSUPPORTED_ACTIONS, `unsupported[${index}].action`);
        requireText(entry.detail, `unsupported[${index}].detail`);
    }

    return plan as DevExpressChartPlan;
}
