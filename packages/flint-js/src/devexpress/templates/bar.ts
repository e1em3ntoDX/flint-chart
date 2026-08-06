// flint-chart/packages/flint-js/src/devexpress/templates/bar.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { InstantiateContext } from '../../core/types';
import type { AxisPlan, DevExpressChartPlan, SeriesPlan } from '../plan';
import {
    resolveArgumentScaleType, resolveIncludeZero, resolveLabelFormat,
    resolveLogarithmic, resolveReverse, resolveValueScaleType,
} from '../semantics-bridge';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

function fieldOf(context: InstantiateContext, channel: string): string | undefined {
    return context.channelSemantics[channel]?.field ?? context.encodings[channel]?.field;
}

function axis(context: InstantiateContext, channel: string, applyZero: boolean): AxisPlan {
    const sem = context.channelSemantics[channel];
    return {
        title: fieldOf(context, channel),
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
        name: valueField,
        viewType,
        argumentField,
        valueFields: [valueField],
        argumentScaleType: resolveArgumentScaleType(context.channelSemantics.x),
        valueScaleType: resolveValueScaleType(context.channelSemantics.y),
        labelsVisible: false,
    };
}

/** One series per value of a split channel, sharing the same argument field. */
export function splitSeries(context: InstantiateContext, channel: string, viewType: string): SeriesPlan[] {
    const values = splitValues(context, channel);
    if (values.length === 0) return [baseSeries(context, viewType)];
    return values.map((value) => ({ ...baseSeries(context, viewType), name: value }));
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
        spec.series = splitSeries(context, 'group', 'Bar');
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
        spec.series = splitSeries(context, 'color', normalized ? 'FullStackedBar' : 'StackedBar');
    },
};

registerTemplate(barChart);
registerTemplate(groupedBarChart);
registerTemplate(stackedBarChart);
