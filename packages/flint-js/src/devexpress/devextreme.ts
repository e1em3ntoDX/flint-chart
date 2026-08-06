// flint-chart/packages/flint-js/src/devexpress/devextreme.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Projects a DevExpress chart plan onto DevExtreme component options.
 *
 * The plan speaks XtraCharts ViewType names because that vocabulary is shared
 * with XRChart and WinForms ChartControl. This file is the only place that
 * knows DevExtreme's own series-type strings.
 */

import type { AxisPlan, DevExpressChartPlan, SeriesPlan } from './plan';

const VIEW_TYPE_TO_DX: Record<string, string> = {
    Bar: 'bar',
    StackedBar: 'stackedbar',
    FullStackedBar: 'fullstackedbar',
    Line: 'line',
    Spline: 'spline',
    StepLine: 'stepline',
    ScatterLine: 'line',
    Area: 'area',
    StackedArea: 'stackedarea',
    FullStackedArea: 'fullstackedarea',
    RangeArea: 'rangearea',
    Point: 'scatter',
    Bubble: 'bubble',
    CandleStick: 'candlestick',
    Pie: 'pie',
    Doughnut: 'doughnut',
};

export interface DevExtremeProjection {
    component: 'dxChart' | 'dxPieChart';
    options: Record<string, unknown>;
}

function dxSeriesType(viewType: string): string {
    const mapped = VIEW_TYPE_TO_DX[viewType];
    if (!mapped) {
        throw new Error(`View type ${viewType} has no dxChart series type.`);
    }
    return mapped;
}

function cartesianSeries(series: SeriesPlan): Record<string, unknown> {
    const type = dxSeriesType(series.viewType);
    const base: Record<string, unknown> = {
        name: series.name,
        type,
        argumentField: series.argumentField,
        label: { visible: series.labelsVisible },
    };
    if (series.color) base.color = series.color;

    if (type === 'rangearea') {
        base.rangeValue1Field = series.valueFields[0];
        base.rangeValue2Field = series.valueFields[1];
    } else if (type === 'candlestick') {
        const [high, low, open, close] = series.valueFields;
        Object.assign(base, {
            highValueField: high, lowValueField: low,
            openValueField: open, closeValueField: close,
        });
    } else if (type === 'bubble') {
        base.valueField = series.valueFields[0];
        base.sizeField = series.valueFields[1];
    } else {
        base.valueField = series.valueFields[0];
    }
    return base;
}

function axisOptions(axis: AxisPlan, isValueAxis: boolean): Record<string, unknown> {
    const options: Record<string, unknown> = {
        title: axis.title,
        grid: { visible: axis.gridLines },
        inverted: axis.reverse,
    };
    if (axis.labelFormat) options.label = { format: axis.labelFormat };
    if (axis.logarithmic) options.type = 'logarithmic';
    if (isValueAxis) options.showZero = axis.includeZero;
    return options;
}

export function planToDevExtreme(plan: DevExpressChartPlan): DevExtremeProjection {
    if (plan.family === 'Circular') {
        const series = plan.series[0];
        return {
            component: 'dxPieChart',
            options: {
                dataSource: plan.data.points,
                palette: plan.palette.colors,
                legend: { visible: plan.legend.visible, position: 'outside' },
                title: plan.titles.find((t) => t.role === 'chart')?.text,
                series: [{
                    type: dxSeriesType(series.viewType),
                    argumentField: series.argumentField,
                    valueField: series.valueFields[0],
                    label: { visible: series.labelsVisible },
                }],
            },
        };
    }

    const diagram = plan.diagram!;
    return {
        component: 'dxChart',
        options: {
            dataSource: plan.data.points,
            palette: plan.palette.colors,
            rotated: diagram.rotated,
            argumentAxis: axisOptions(diagram.axisX, false),
            valueAxis: axisOptions(diagram.axisY, true),
            legend: { visible: plan.legend.visible, position: 'outside' },
            title: plan.titles.find((t) => t.role === 'chart')?.text,
            tooltip: { enabled: true },
            series: plan.series.map(cartesianSeries),
        },
    };
}
