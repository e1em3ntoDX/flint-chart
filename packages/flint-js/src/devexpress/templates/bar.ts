// flint-chart/packages/flint-js/src/devexpress/templates/bar.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChannelSemantics, ChartWarning, InstantiateContext } from '../../core/types';
import { detectBandedAxisFromSemantics } from '../../core/axis-detection';
import type { AxisPlan, DevExpressChartPlan, SeriesPlan, UnsupportedNote } from '../plan';
import {
    resolveArgumentScaleType, resolveIncludeZero, resolveLabelFormat,
    resolveLogarithmic, resolveReverse, resolveTooltipFormat, resolveValueScaleType,
} from '../semantics-bridge';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

export function fieldOf(context: InstantiateContext, channel: string): string | undefined {
    return context.channelSemantics[channel]?.field ?? context.encodings[channel]?.field;
}

/** Append an UnsupportedNote, keeping the array-init contract the frame sets up. */
export function noteUnsupported(plan: Draft, note: UnsupportedNote): void {
    plan.unsupported = [...(plan.unsupported ?? []), note];
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

/**
 * Which position channel carries the categories and which carries the measure.
 *
 * Never assume x=argument / y=value: a spec may legitimately put the measure on
 * x and the category on y, and a series built the other way round declares a
 * string column Numerical, which renders an empty chart. The decision itself is
 * core's — detectBandedAxisFromSemantics (core/axis-detection.ts:35) returns the
 * banded (category) axis, handling the discrete cases and the
 * quantitative/temporal tiebreaks — so we read it rather than re-deriving it.
 */
export function resolveAxisRoles(
    context: InstantiateContext,
): { categoryAxis: 'x' | 'y'; valueAxis: 'x' | 'y' } {
    const banded = detectBandedAxisFromSemantics(
        context.channelSemantics as Record<string, ChannelSemantics>,
        context.table,
        { preferAxis: 'x' },
    );
    const categoryAxis = banded?.axis ?? 'x';
    return { categoryAxis, valueAxis: categoryAxis === 'x' ? 'y' : 'x' };
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
    const { categoryAxis, valueAxis } = resolveAxisRoles(context);
    plan.diagram = {
        // dxChart renders the argument axis vertically when rotated, which is
        // what a category on y means. An explicit orient:'horizontal' asks for
        // the same thing, so either is sufficient.
        rotated: options.rotated || categoryAxis === 'y',
        axisX: axis(context, 'x', valueAxis === 'x'),
        axisY: axis(context, 'y', valueAxis === 'y'),
        // `rotated` alone cannot tell a renderer which AxisPlan plays which
        // role (see the field's own doc comment on DiagramPlan) — it has to be
        // stated here, where the role is actually decided.
        argumentAxisChannel: categoryAxis,
    };
    plan.legend = options.legend
        ? { visible: true, position: 'right' }
        : { visible: false, position: 'none' };
    plan.titles ??= [];
    plan.warnings ??= [];
    plan.unsupported ??= [];
}

/**
 * Whether a bound splitting channel (`'color'` or `'group'`) should become
 * one series per category.
 *
 * `group` resolves a type the same way `color` does — `ChannelSemantics.type`
 * (core/types.ts:126) is generic across channels, and `group` is a
 * first-class `ColorChannel` (core/color-decisions.ts:29,74) that gets the
 * same sequential/diverging (continuous) scheme types `color` does — so this
 * is one rule for both, not a color-specific one. A split turns each
 * distinct value into its own series, so it is only correct for a discrete
 * channel — nominal or ordinal. On a continuous (quantitative or temporal)
 * channel, splitting produces one degenerate series per row and a legend the
 * length of the dataset, where the request meant a continuous scale — which
 * dxChart has no per-point equivalent for on these view types. The channel
 * then carries no split encoding at all, which is `'rejected'`, not
 * `'downgraded'`: contrast the theme_spec note (assemble.ts:477-478), which
 * is `'downgraded'` because its palette did apply, just not its font style
 * or mark geometry.
 *
 * Presence is read via `fieldOf` (channelSemantics first, encodings
 * fallback) rather than raw `context.encodings[channel]`, so this gate can
 * never disagree with `splitSeries`'s own `!splitField` decline path
 * (splitSeries, below) about whether a channel is actually bound.
 *
 * Side-effecting: on decline this appends an `UnsupportedNote` via
 * `noteUnsupported`. Call at most once per `instantiate` per channel — a
 * second call for the same channel would duplicate the note.
 */
export function resolveSplitChannel(plan: Draft, context: InstantiateContext, channel: string): boolean {
    if (!fieldOf(context, channel)) return false;
    const type = context.channelSemantics[channel]?.type;
    if (type === 'nominal' || type === 'ordinal') return true;
    noteUnsupported(plan, {
        feature: channel,
        action: 'rejected',
        detail: `A ${type ?? 'continuous'} ${channel} channel is not discrete; dxChart splits `
            + `series by category only, so the ${channel} encoding was not applied.`,
    });
    return false;
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
    const { categoryAxis, valueAxis } = resolveAxisRoles(context);
    const argumentField = fieldOf(context, categoryAxis)!;
    const valueField = fieldOf(context, valueAxis)!;
    return {
        name: humanizeFieldName(valueField)!,
        viewType,
        argumentField,
        valueFields: [valueField],
        argumentScaleType: resolveArgumentScaleType(context.channelSemantics[categoryAxis]),
        valueScaleType: resolveValueScaleType(context.channelSemantics[valueAxis]),
        labelsVisible: false,
        valueFormat: resolveTooltipFormat(context.channelSemantics[valueAxis]),
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
    labelsVisible: boolean,
): { series: SeriesPlan[]; points?: Record<string, unknown>[]; warnings: ChartWarning[] } {
    const values = splitValues(context, channel);
    const splitField = fieldOf(context, channel);
    const base = baseSeries(context, viewType);
    if (!splitField || values.length === 0) {
        return { series: [{ ...base, labelsVisible }], warnings: [] };
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
            labelsVisible,
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
    labelsVisible: boolean,
): void {
    const split = splitSeries(context, channel, viewType, labelsVisible);
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
        spec.series = [{ ...baseSeries(context, 'Bar'), labelsVisible: true }];
        if (context.encodings.color != null) {
            // Grouped Bar Chart and Stacked Bar Chart already exist as the
            // dedicated templates for a color split — silently picking one of
            // those shapes for a caller who asked for plain "Bar Chart" would
            // quietly change what they asked for. So this stays a single,
            // unsplit series, and the note names the templates that do split.
            noteUnsupported(spec, {
                feature: 'color',
                action: 'rejected',
                detail: 'Bar Chart renders a single, unsplit series; the color encoding was '
                    + 'not applied. Use "Grouped Bar Chart" or "Stacked Bar Chart" to split by category.',
            });
        }
        if (context.encodings.opacity != null) {
            noteUnsupported(spec, {
                feature: 'opacity',
                action: 'rejected',
                detail: 'dxChart has no data-driven per-point opacity channel; '
                    + 'the encoding was ignored.',
            });
        }
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
        // 'group' resolves a type the same way 'color' does (see
        // resolveSplitChannel's doc comment) — a continuous field bound here
        // hits the exact same one-series-per-row bug as a continuous color,
        // so it goes through the same gate, computed once and reused for
        // both the legend and the split/no-split branch.
        const splitsByGroup = resolveSplitChannel(spec, context, 'group');
        applyCartesianFrame(spec, context, { rotated: isHorizontal(context), legend: splitsByGroup });
        if (splitsByGroup) {
            applySplitSeries(spec, context, 'group', 'Bar', true);
        } else {
            spec.series = [{ ...baseSeries(context, 'Bar'), labelsVisible: true }];
        }
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
        // Computed once, before the frame: the legend must follow whether a
        // split actually happened, not merely whether `color` was bound —
        // otherwise a continuous color (declined below) would still turn the
        // legend on to label a single series. Calling resolveSplitChannel
        // here and reusing the result (rather than calling it again inside
        // the branch) also keeps the rejection note from firing twice.
        const splitsByColor = resolveSplitChannel(spec, context, 'color');
        applyCartesianFrame(spec, context, { rotated: isHorizontal(context), legend: splitsByColor });
        // stackable is core's decision about the MEASURE channel, so it has to
        // be read off whichever channel resolveAxisRoles found the value on,
        // not off literal y — a reversed chart's stackable flag lives on x.
        const { valueAxis } = resolveAxisRoles(context);
        const normalized = context.channelSemantics[valueAxis]?.stackable === 'normalize';
        const viewType = normalized ? 'FullStackedBar' : 'StackedBar';
        if (splitsByColor) {
            applySplitSeries(spec, context, 'color', viewType, true);
        } else {
            spec.series = [{ ...baseSeries(context, viewType), labelsVisible: true }];
        }
    },
};

registerTemplate(barChart);
registerTemplate(groupedBarChart);
registerTemplate(stackedBarChart);
