// flint-chart/packages/flint-js/src/devexpress/templates/area.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { InstantiateContext } from '../../core/types';
import type { DevExpressChartPlan, SeriesPlan } from '../plan';
import {
    applyCartesianFrame, applySplitSeries, baseSeries, humanizeFieldName, noteUnsupported, resolveAxisRoles,
    resolveColorSplit,
} from './bar';
import { resolveArgumentScaleType, resolveTooltipFormat, resolveValueScaleType } from '../semantics-bridge';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

/**
 * stackable is core's decision about the MEASURE channel, so it must be read
 * off whichever channel resolveAxisRoles resolved as the value axis, not off
 * literal y — a reversed Area Chart's stackable flag lives on x.
 */
function areaViewType(context: InstantiateContext): string {
    const { valueAxis } = resolveAxisRoles(context);
    switch (context.channelSemantics[valueAxis]?.stackable) {
        case 'normalize': return 'FullStackedArea';
        case 'sum': return 'StackedArea';
        default: return 'Area';
    }
}

const areaChart: DxTemplateDef = {
    chart: 'Area Chart',
    template: {},
    channels: ['x', 'y', 'color', 'opacity'],
    requiredChannels: ['x', 'y'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'area',
    instantiate(spec: Draft, context: InstantiateContext) {
        const hasColor = resolveColorSplit(spec, context);
        applyCartesianFrame(spec, context, { rotated: false, legend: hasColor });
        const viewType = areaViewType(context);
        if (hasColor) {
            applySplitSeries(spec, context, 'color', viewType, false);
        } else {
            spec.series = [baseSeries(context, viewType)];
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

const rangeAreaChart: DxTemplateDef = {
    chart: 'Range Area Chart',
    template: {},
    channels: ['x', 'y', 'y2', 'color'],
    requiredChannels: ['x', 'y', 'y2'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'area',
    instantiate(spec: Draft, context: InstantiateContext) {
        applyCartesianFrame(spec, context, { rotated: false, legend: false });
        const argumentField = context.channelSemantics.x!.field;
        const low = context.channelSemantics.y!.field;
        const high = context.channelSemantics.y2!.field;
        const series: SeriesPlan = {
            name: `${humanizeFieldName(low)}–${humanizeFieldName(high)}`,
            viewType: 'RangeArea',
            argumentField,
            valueFields: [low, high],
            argumentScaleType: resolveArgumentScaleType(context.channelSemantics.x),
            valueScaleType: resolveValueScaleType(context.channelSemantics.y),
            labelsVisible: false,
            valueFormat: resolveTooltipFormat(context.channelSemantics.y),
        };
        spec.series = [series];
        if (context.encodings.color != null) {
            // RangeArea plots one fixed low/high band; there is no per-series
            // shape here for a category split to land on. Report rather than
            // drop.
            noteUnsupported(spec, {
                feature: 'color',
                action: 'rejected',
                detail: 'Range Area Chart renders a single low/high band and does not split by '
                    + 'category; the encoding was ignored.',
            });
        }
    },
};

registerTemplate(areaChart);
registerTemplate(rangeAreaChart);
