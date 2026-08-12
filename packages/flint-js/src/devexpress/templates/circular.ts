// flint-chart/packages/flint-js/src/devexpress/templates/circular.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { InstantiateContext } from '../../core/types';
import type { DevExpressChartPlan } from '../plan';
import { fieldOf, humanizeFieldName } from './bar';
import { resolveTooltipFormat } from '../semantics-bridge';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

/**
 * Shared Circular scaffolding. Deliberately does not call applyCartesianFrame:
 * that helper builds a `diagram`, which Circular plans must not have.
 */
function applyCircularFrame(spec: Draft, context: InstantiateContext, viewType: string): void {
    const argumentField = fieldOf(context, 'color')!;
    const valueField = fieldOf(context, 'size')!;
    spec.family = 'Circular';
    spec.chartType = context.chartType;
    spec.dataMode = 'materialized';
    spec.data = { points: context.table };
    spec.diagram = null;
    spec.legend = { visible: true, position: 'right' };
    spec.series = [{
        name: humanizeFieldName(valueField)!,
        viewType,
        argumentField,
        valueFields: [valueField],
        argumentScaleType: 'Qualitative',
        valueScaleType: 'Numerical',
        labelsVisible: false,
        valueFormat: resolveTooltipFormat(context.channelSemantics.size),
    }];
    spec.titles ??= [];
    spec.warnings ??= [];
    spec.unsupported ??= [];
}

const pieChart: DxTemplateDef = {
    chart: 'Pie Chart',
    template: {},
    channels: ['color', 'size'],
    requiredChannels: ['color', 'size'],
    family: 'Circular',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'area',
    instantiate(spec: Draft, context: InstantiateContext) {
        applyCircularFrame(spec, context, 'Pie');
    },
};

const donutChart: DxTemplateDef = {
    chart: 'Donut Chart',
    template: {},
    channels: ['color', 'size'],
    requiredChannels: ['color', 'size'],
    family: 'Circular',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'area',
    instantiate(spec: Draft, context: InstantiateContext) {
        applyCircularFrame(spec, context, 'Doughnut');
    },
};

registerTemplate(pieChart);
registerTemplate(donutChart);
