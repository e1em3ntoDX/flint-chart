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

import type { AxisPlan, DevExpressChartPlan, SeriesPlan, TitlePlan } from './plan';
import { formatValue } from './number-format';

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
        label: {
            visible: series.labelsVisible,
            customizeText: (info: { value?: unknown }) => formatValue(info.value, series.valueFormat),
        },
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

/**
 * A single tooltip callback shared by the whole dxChart, looked up per hover
 * by series name — a per-series closure won't do, since DevExtreme's
 * tooltip.customizeTooltip is configured once at the chart level.
 */
function buildCartesianTooltipCustomizer(series: SeriesPlan[]) {
    const formatBySeries = new Map(series.map((s) => [s.name, s.valueFormat]));
    return (info: {
        seriesName?: unknown; value?: unknown;
        rangeValue1?: unknown; rangeValue2?: unknown;
        openValue?: unknown; highValue?: unknown; lowValue?: unknown; closeValue?: unknown;
    }) => {
        const name = String(info.seriesName ?? '');
        const fmt = formatBySeries.get(name);
        // RangeArea/RangeBar tooltips never carry `value` — DevExtreme hands
        // back rangeValue1/rangeValue2 instead. CandleStick/Stock tooltips
        // carry openValue/highValue/lowValue/closeValue; `value` does exist
        // there too (aliased to the close price) but showing only close
        // silently drops open/high/low, so branch on the OHLC shape first.
        if (info.rangeValue1 !== undefined || info.rangeValue2 !== undefined) {
            return { text: `${name}: ${formatValue(info.rangeValue1, fmt)} – ${formatValue(info.rangeValue2, fmt)}` };
        }
        if (info.openValue !== undefined || info.highValue !== undefined
            || info.lowValue !== undefined || info.closeValue !== undefined) {
            return {
                text: `${name}\nO: ${formatValue(info.openValue, fmt)}  H: ${formatValue(info.highValue, fmt)}  `
                    + `L: ${formatValue(info.lowValue, fmt)}  C: ${formatValue(info.closeValue, fmt)}`,
            };
        }
        return { text: `${name}: ${formatValue(info.value, fmt)}` };
    };
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

/** A bare string when there's only a chart title; an object with `subtitle` when both are present; `undefined` when there's no title at all. */
function titleOptions(titles: TitlePlan[]): Record<string, unknown> | string | undefined {
    const chartTitle = titles.find((t) => t.role === 'chart')?.text;
    const subtitle = titles.find((t) => t.role === 'subtitle')?.text;
    if (!chartTitle) return undefined;
    return subtitle ? { text: chartTitle, subtitle: { text: subtitle } } : chartTitle;
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
                title: titleOptions(plan.titles),
                tooltip: {
                    enabled: true,
                    customizeTooltip: (info: { argument?: unknown; value?: unknown }) => (
                        { text: `${info.argument}: ${formatValue(info.value, series.valueFormat)}` }
                    ),
                },
                series: [{
                    type: dxSeriesType(series.viewType),
                    argumentField: series.argumentField,
                    valueField: series.valueFields[0],
                    label: {
                        visible: series.labelsVisible,
                        customizeText: (info: { argument?: unknown; value?: unknown }) => (
                            `${info.argument}: ${formatValue(info.value, series.valueFormat)}`
                        ),
                    },
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
            title: titleOptions(plan.titles),
            tooltip: {
                enabled: true,
                customizeTooltip: buildCartesianTooltipCustomizer(plan.series),
            },
            series: plan.series.map(cartesianSeries),
        },
    };
}
