// flint-chart/packages/flint-js/src/devexpress/templates/point.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { InstantiateContext } from '../../core/types';
import type { DevExpressChartPlan, SeriesPlan } from '../plan';
import { binHistogram } from '../transforms';
import { applyCartesianFrame, baseSeries } from './bar';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

function fieldOf(context: InstantiateContext, channel: string): string | undefined {
    return context.channelSemantics[channel]?.field ?? context.encodings[channel]?.field;
}

const scatterPlot: DxTemplateDef = {
    chart: 'Scatter Plot',
    template: {},
    channels: ['x', 'y', 'color', 'size', 'opacity'],
    requiredChannels: ['x', 'y'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'position',
    instantiate(spec: Draft, context: InstantiateContext) {
        applyCartesianFrame(spec, context, { rotated: false, legend: false });
        const sizeField = fieldOf(context, 'size');
        const series: SeriesPlan = sizeField
            ? { ...baseSeries(context, 'Bubble'), valueFields: [fieldOf(context, 'y')!, sizeField] }
            : { ...baseSeries(context, 'Point'), markerKind: 'Circle' };
        spec.series = [series];
    },
};

const connectedScatterPlot: DxTemplateDef = {
    chart: 'Connected Scatter Plot',
    template: {},
    channels: ['x', 'y', 'color'],
    requiredChannels: ['x', 'y'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'position',
    instantiate(spec: Draft, context: InstantiateContext) {
        applyCartesianFrame(spec, context, { rotated: false, legend: false });
        spec.series = [baseSeries(context, 'ScatterLine')];
    },
};

const histogram: DxTemplateDef = {
    chart: 'Histogram',
    template: {},
    channels: ['x'],
    requiredChannels: ['x'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'length',
    instantiate(spec: Draft, context: InstantiateContext) {
        const field = fieldOf(context, 'x')!;
        const bins = binHistogram(context.table, field);
        const binnedContext: InstantiateContext = { ...context, table: bins };
        applyCartesianFrame(spec, binnedContext, { rotated: false, legend: false });
        spec.series = [{
            name: 'count',
            viewType: 'Bar',
            argumentField: 'bin',
            valueFields: ['count'],
            argumentScaleType: 'Qualitative',
            valueScaleType: 'Numerical',
            labelsVisible: false,
        }];
    },
};

registerTemplate(scatterPlot);
registerTemplate(connectedScatterPlot);
registerTemplate(histogram);
