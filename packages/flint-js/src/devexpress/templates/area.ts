// flint-chart/packages/flint-js/src/devexpress/templates/area.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { InstantiateContext } from '../../core/types';
import type { DevExpressChartPlan, SeriesPlan } from '../plan';
import { applyCartesianFrame, applySplitSeries, baseSeries, humanizeFieldName } from './bar';
import { resolveArgumentScaleType, resolveTooltipFormat, resolveValueScaleType } from '../semantics-bridge';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

function areaViewType(context: InstantiateContext): string {
    switch (context.channelSemantics.y?.stackable) {
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
        const hasColor = context.encodings.color != null;
        applyCartesianFrame(spec, context, { rotated: false, legend: hasColor });
        const viewType = areaViewType(context);
        if (hasColor) {
            applySplitSeries(spec, context, 'color', viewType);
        } else {
            spec.series = [baseSeries(context, viewType)];
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
    },
};

registerTemplate(areaChart);
registerTemplate(rangeAreaChart);
