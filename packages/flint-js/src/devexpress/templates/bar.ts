// flint-chart/packages/flint-js/src/devexpress/templates/bar.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChartWarning, InstantiateContext } from '../../core/types';
import type { AxisPlan, DevExpressChartPlan, SeriesPlan } from '../plan';
import {
    resolveArgumentScaleType, resolveIncludeZero, resolveLabelFormat,
    resolveLogarithmic, resolveReverse, resolveTooltipFormat, resolveValueScaleType,
} from '../semantics-bridge';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

export function fieldOf(context: InstantiateContext, channel: string): string | undefined {
    return context.channelSemantics[channel]?.field ?? context.encodings[channel]?.field;
}

/**
 * Turns a raw field name into Title Case for display as an axis title or
 * series name: `fuel_type` -> "Fuel Type", `avgSessionSeconds` -> "Avg
 * Session Seconds". Plain word-capitalization only — acronyms like `hp` or
 * `gwh` become "Hp"/"Gwh" rather than "HP"/"GWh"; an accepted simplification.
 * Never applied to raw data VALUES (category names), only to field names we
 * generate display text from ourselves.
 */
export function humanizeFieldName(field: string | undefined): string | undefined {
    if (!field) return field;
    const words = field
        .replace(/_/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(' ')
        .filter(Boolean);
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function axis(context: InstantiateContext, channel: string, applyZero: boolean): AxisPlan {
    const sem = context.channelSemantics[channel];
    return {
        title: humanizeFieldName(fieldOf(context, channel)),
        labelFormat: resolveLabelFormat(sem),
        includeZero: applyZero ? resolveIncludeZero(sem) : false,
        logarithmic: resolveLogarithmic(sem),
        gridLines: applyZero,
        reverse: resolveReverse(sem),
    };
}

/** Shared Cartesian scaffolding: diagram, legend, palette. */
export function applyCartesianFrame(
    plan: Draft,
    context: InstantiateContext,
    options: { rotated: boolean; legend: boolean },
): void {
    plan.family = 'Cartesian';
    plan.chartType = context.chartType;
    plan.dataMode = 'materialized';
    plan.data = { points: context.table };
    plan.diagram = {
        rotated: options.rotated,
        axisX: axis(context, 'x', false),
        axisY: axis(context, 'y', true),
    };
    plan.legend = options.legend
        ? { visible: true, position: 'right' }
        : { visible: false, position: 'none' };
    plan.titles ??= [];
    plan.warnings ??= [];
    plan.unsupported ??= [];
}

/** Distinct values of a splitting channel, in Flint's canonical order when available. */
export function splitValues(context: InstantiateContext, channel: string): string[] {
    const field = fieldOf(context, channel);
    if (!field) return [];
    const ordered = context.channelSemantics[channel]?.ordinalSortOrder;
    const seen = new Set<string>();
    for (const row of context.table) {
        const value = row?.[field];
        if (value != null) seen.add(String(value));
    }
    if (ordered?.length) {
        const known = ordered.filter((v) => seen.has(v));
        const extra = [...seen].filter((v) => !ordered.includes(v)).sort();
        return [...known, ...extra];
    }
    return [...seen].sort();
}

function isHorizontal(context: InstantiateContext): boolean {
    return context.chartProperties?.orient === 'horizontal';
}

export function baseSeries(context: InstantiateContext, viewType: string): SeriesPlan {
    const argumentField = fieldOf(context, 'x')!;
    const valueField = fieldOf(context, 'y')!;
    return {
        name: humanizeFieldName(valueField)!,
        viewType,
        argumentField,
        valueFields: [valueField],
        argumentScaleType: resolveArgumentScaleType(context.channelSemantics.x),
        valueScaleType: resolveValueScaleType(context.channelSemantics.y),
        labelsVisible: false,
        valueFormat: resolveTooltipFormat(context.channelSemantics.y),
    };
}

/**
 * Stable identity for an argument value, so rows for the same argument land in
 * the same pivoted point. The type tag keeps the number 1 and the string "1"
 * apart, which `String(value)` alone would merge.
 */
function argumentKey(value: unknown): string {
    if (value instanceof Date) return `date:${value.getTime()}`;
    return `${typeof value}:${String(value)}`;
}

/**
 * Column name for one series inside the pivoted table. Normally the group value
 * itself — readable in the plan JSON and in the DevExtreme options — but a group
 * value that collides with the argument column has to be qualified, or one
 * series would silently overwrite the arguments.
 */
function pivotColumn(value: string, splitField: string, taken: ReadonlySet<string>): string {
    if (!taken.has(value)) return value;
    const qualified = `${splitField}: ${value}`;
    if (!taken.has(qualified)) return qualified;
    let suffix = 2;
    while (taken.has(`${qualified} (${suffix})`)) suffix += 1;
    return `${qualified} (${suffix})`;
}

/**
 * One series per value of a split channel, plus the wide-format table those
 * series need.
 *
 * DevExtreme (and XtraCharts, and XRChart) resolve a series against the shared
 * data source using `argumentField` + `valueField` alone; there is no "and only
 * the rows where region = 'North'" in that contract. So N series that differ
 * only by `name` all plot the WHOLE long-format table — every series draws
 * every row, and a stacked view sums across groups. That is not a projection
 * bug: `SeriesPlan.valueFields` being per-series *is* the statement that each
 * series owns a distinct value column, and the plan has to honour it.
 *
 * So the split materialises that contract here, while the assembler still holds
 * the rows: the long table (one row per argument × group) is pivoted into one
 * row per argument value with one column per group, and each series points at
 * its own column. Rows for a group that has no value at some argument get an
 * explicit `null`, which every target renders as a gap rather than a zero.
 */
export function splitSeries(
    context: InstantiateContext,
    channel: string,
    viewType: string,
): { series: SeriesPlan[]; points?: Record<string, unknown>[]; warnings: ChartWarning[] } {
    const values = splitValues(context, channel);
    const splitField = fieldOf(context, channel);
    const base = baseSeries(context, viewType);
    if (!splitField || values.length === 0) {
        return { series: [base], warnings: [] };
    }

    const { argumentField, valueFields: [valueField] } = base;
    const taken = new Set<string>([argumentField]);
    const columnFor = new Map<string, string>();
    for (const value of values) {
        const column = pivotColumn(value, splitField, taken);
        taken.add(column);
        columnFor.set(value, column);
    }
    const columns = [...columnFor.values()];

    const points: Record<string, unknown>[] = [];
    const byArgument = new Map<string, Record<string, unknown>>();
    let collapsed = false;

    for (const row of context.table) {
        const group = row?.[splitField];
        if (group == null) continue;
        const column = columnFor.get(String(group));
        if (!column) continue;

        const argument = row?.[argumentField];
        const key = argumentKey(argument);
        let point = byArgument.get(key);
        if (!point) {
            point = { [argumentField]: argument };
            for (const c of columns) point[c] = null;
            byArgument.set(key, point);
            points.push(point);
        }

        const incoming = row?.[valueField] ?? null;
        const existing = point[column];
        if (existing == null) {
            point[column] = incoming;
        } else if (typeof existing === 'number' && typeof incoming === 'number') {
            // Two rows for the same argument *and* the same group: the caller
            // did not pre-aggregate and did not ask Flint to. Summing matches
            // what the stacked/grouped view is asking for, but it is a real
            // data decision, so it is reported rather than made silently.
            point[column] = existing + incoming;
            collapsed = true;
        } else if (incoming != null) {
            point[column] = incoming;
            collapsed = true;
        }
    }

    const warnings: ChartWarning[] = collapsed ? [{
        severity: 'info',
        code: 'series-split-aggregated',
        message:
            `More than one row shared the same ${argumentField} and ${splitField}; ` +
            `their ${valueField} values were combined into a single point per series.`,
        channel,
        field: valueField,
    }] : [];

    return {
        series: values.map((value) => ({
            ...base,
            name: value,
            valueFields: [columnFor.get(value)!],
        })),
        points,
        warnings,
    };
}

/**
 * Writes a split into a draft plan: series, the pivoted data the series depend
 * on, and any warning the pivot produced. Callers must run
 * `applyCartesianFrame` first — this overwrites the frame's `data`.
 */
export function applySplitSeries(
    plan: Draft,
    context: InstantiateContext,
    channel: string,
    viewType: string,
): void {
    const split = splitSeries(context, channel, viewType);
    plan.series = split.series;
    if (split.points) plan.data = { points: split.points };
    if (split.warnings.length > 0) {
        plan.warnings = [...(plan.warnings ?? []), ...split.warnings];
    }
}

const barChart: DxTemplateDef = {
    chart: 'Bar Chart',
    template: {},
    channels: ['x', 'y', 'color', 'opacity'],
    requiredChannels: ['x', 'y'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'length',
    instantiate(spec: Draft, context: InstantiateContext) {
        applyCartesianFrame(spec, context, { rotated: isHorizontal(context), legend: false });
        spec.series = [baseSeries(context, 'Bar')];
    },
};

const groupedBarChart: DxTemplateDef = {
    chart: 'Grouped Bar Chart',
    template: {},
    channels: ['x', 'y', 'group'],
    requiredChannels: ['x', 'y'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'length',
    instantiate(spec: Draft, context: InstantiateContext) {
        applyCartesianFrame(spec, context, { rotated: isHorizontal(context), legend: true });
        applySplitSeries(spec, context, 'group', 'Bar');
    },
};

const stackedBarChart: DxTemplateDef = {
    chart: 'Stacked Bar Chart',
    template: {},
    channels: ['x', 'y', 'color'],
    requiredChannels: ['x', 'y'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'length',
    instantiate(spec: Draft, context: InstantiateContext) {
        applyCartesianFrame(spec, context, { rotated: isHorizontal(context), legend: true });
        const normalized = context.channelSemantics.y?.stackable === 'normalize';
        applySplitSeries(spec, context, 'color', normalized ? 'FullStackedBar' : 'StackedBar');
    },
};

registerTemplate(barChart);
registerTemplate(groupedBarChart);
registerTemplate(stackedBarChart);
