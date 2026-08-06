// flint-chart/packages/flint-js/src/devexpress/templates/line.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { InstantiateContext } from '../../core/types';
import type { DevExpressChartPlan } from '../plan';
import { applyCartesianFrame, baseSeries, splitSeries } from './bar';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

function lineViewType(context: InstantiateContext): string {
    switch (context.chartProperties?.interpolate) {
        case 'spline': return 'Spline';
        case 'step': return 'StepLine';
        default: return 'Line';
    }
}

const lineChart: DxTemplateDef = {
    chart: 'Line Chart',
    template: {},
    channels: ['x', 'y', 'color', 'strokeDash', 'detail', 'opacity'],
    requiredChannels: ['x', 'y'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'position',
    instantiate(spec: Draft, context: InstantiateContext) {
        // Line charts are never rotated: Flint omits the transpose operator for them.
        const hasColor = context.encodings.color != null;
        applyCartesianFrame(spec, context, { rotated: false, legend: hasColor });
        const viewType = lineViewType(context);
        spec.series = hasColor
            ? splitSeries(context, 'color', viewType)
            : [baseSeries(context, viewType)];
    },
};

registerTemplate(lineChart);
