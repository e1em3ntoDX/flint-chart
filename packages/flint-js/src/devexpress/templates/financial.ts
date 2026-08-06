// flint-chart/packages/flint-js/src/devexpress/templates/financial.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { InstantiateContext } from '../../core/types';
import type { DevExpressChartPlan } from '../plan';
import { resolveArgumentScaleType } from '../semantics-bridge';
import { applyCartesianFrame } from './bar';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

function fieldOf(context: InstantiateContext, channel: string): string | undefined {
    return context.channelSemantics[channel]?.field ?? context.encodings[channel]?.field;
}

const candlestickChart: DxTemplateDef = {
    chart: 'Candlestick Chart',
    template: {},
    channels: ['x', 'open', 'high', 'low', 'close'],
    requiredChannels: ['x', 'open', 'high', 'low', 'close'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'position',
    instantiate(spec: Draft, context: InstantiateContext) {
        applyCartesianFrame(spec, context, { rotated: false, legend: false });
        const argumentField = fieldOf(context, 'x')!;
        const high = fieldOf(context, 'high')!;
        const low = fieldOf(context, 'low')!;
        const open = fieldOf(context, 'open')!;
        const close = fieldOf(context, 'close')!;
        spec.series = [{
            name: 'candlestick',
            viewType: 'CandleStick',
            argumentField,
            // XtraCharts financial views expect [high, low, open, close], not
            // the o/h/l/c order the channels are declared in.
            valueFields: [high, low, open, close],
            argumentScaleType: resolveArgumentScaleType(context.channelSemantics.x),
            valueScaleType: 'Numerical',
            labelsVisible: false,
        }];
    },
};

registerTemplate(candlestickChart);
