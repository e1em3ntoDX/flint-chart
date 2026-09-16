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

import type { AxisPlan, DevExpressChartPlan, FontSpec, SeriesPlan, TitlePlan, TypographyPlan } from './plan';
import { formatValue, patternToDevExtremeFormat } from './number-format';

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

function cartesianSeries(series: SeriesPlan, dataLabelFont: FontSpec | undefined): Record<string, unknown> {
    const type = dxSeriesType(series.viewType);
    const label: Record<string, unknown> = {
        visible: series.labelsVisible,
        customizeText: (info: { value?: unknown }) => formatValue(info.value, series.valueFormat),
    };
    if (dataLabelFont) label.font = dataLabelFont;
    const base: Record<string, unknown> = {
        name: series.name,
        type,
        argumentField: series.argumentField,
        label,
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

function axisOptions(
    axis: AxisPlan, isValueAxis: boolean,
    labelFont: FontSpec | undefined, titleFont: FontSpec | undefined,
): Record<string, unknown> {
    const options: Record<string, unknown> = {
        title: titleFont && axis.title ? { text: axis.title, font: titleFont } : axis.title,
        grid: { visible: axis.gridLines },
        inverted: axis.reverse,
    };
    const label: Record<string, unknown> = {};
    // axis.labelFormat carries a d3-format pattern (see plan.ts's own doc
    // comment), which DevExtreme's label.format cannot read directly — it
    // wants a format name, a { type, precision } object, or an LDML pattern.
    // patternToDevExtremeFormat translates the subset core actually emits;
    // anything outside that grammar leaves `format` unset so dxChart falls
    // back to its own default instead of rendering d3 syntax as text.
    const fmt = axis.labelFormat ? patternToDevExtremeFormat(axis.labelFormat) : undefined;
    if (fmt) label.format = fmt;
    if (axis.labelPrefix || axis.labelSuffix) {
        // Ticks must read the same as the point labels, which already carry
        // the prefix/suffix through SeriesPlan.valueFormat (see
        // cartesianSeries above). DevExtreme has no prefix/suffix option on an
        // axis label, so wrap valueText instead.
        //
        // This is a function, so it cannot survive JSON.stringify — consistent
        // with Task 8 dropping the projection from the MCP tool response, and
        // with the standing rule that planToDevExtreme() runs client-side, not
        // on the server that produces the plan.
        const prefix = axis.labelPrefix ?? '';
        const suffix = axis.labelSuffix ?? '';
        // Read from the callback argument (DevExtreme also binds `this` to the
        // same object, but every other customizeText in this file — see
        // cartesianSeries above — reads the argument, so this stays consistent
        // and works regardless of how the caller invokes it).
        label.customizeText = (info: { valueText: string }) => `${prefix}${info.valueText}${suffix}`;
    }
    if (labelFont) label.font = labelFont;
    if (Object.keys(label).length > 0) options.label = label;
    if (axis.logarithmic) options.type = 'logarithmic';
    if (isValueAxis) options.showZero = axis.includeZero;
    return options;
}

/** A bare string when there's only a chart title and no font; an object with `font`/`subtitle` when either is present; `undefined` when there's no title at all. */
function titleOptions(titles: TitlePlan[], typography: TypographyPlan): Record<string, unknown> | string | undefined {
    const chartTitle = titles.find((t) => t.role === 'chart')?.text;
    const subtitleText = titles.find((t) => t.role === 'subtitle')?.text;
    if (!chartTitle) return undefined;
    const titleFont = typography.title;
    const subtitleFont = typography.subtitle;
    if (!subtitleText && !titleFont) return chartTitle;
    const result: Record<string, unknown> = { text: chartTitle };
    if (titleFont) result.font = titleFont;
    if (subtitleText) {
        const subtitle: Record<string, unknown> = { text: subtitleText };
        if (subtitleFont) subtitle.font = subtitleFont;
        result.subtitle = subtitle;
    }
    return result;
}

export function planToDevExtreme(plan: DevExpressChartPlan): DevExtremeProjection {
    if (plan.family === 'Circular') {
        const series = plan.series[0];
        const circularLabel: Record<string, unknown> = {
            visible: series.labelsVisible,
            customizeText: (info: { argument?: unknown; value?: unknown }) => (
                `${info.argument}: ${formatValue(info.value, series.valueFormat)}`
            ),
        };
        if (plan.typography.dataLabel) circularLabel.font = plan.typography.dataLabel;
        const circularLegend: Record<string, unknown> = { visible: plan.legend.visible, position: 'outside' };
        if (plan.typography.legend) circularLegend.font = plan.typography.legend;
        return {
            component: 'dxPieChart',
            options: {
                dataSource: plan.data.points,
                palette: plan.palette.colors,
                legend: circularLegend,
                title: titleOptions(plan.titles, plan.typography),
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
                    label: circularLabel,
                }],
            },
        };
    }

    const diagram = plan.diagram!;
    const cartesianLegend: Record<string, unknown> = { visible: plan.legend.visible, position: 'outside' };
    if (plan.typography.legend) cartesianLegend.font = plan.typography.legend;
    // dxChart's argumentAxis/valueAxis options are ROLE-based (argument vs
    // value), not screen-position-based: `rotated` only swaps which side of
    // the screen each role renders on, and cannot itself disambiguate which
    // AxisPlan plays which role (see DiagramPlan.argumentAxisChannel's own
    // doc comment — the same `rotated:true` covers both an explicit
    // orient:'horizontal' request with the category still on x, and a
    // category genuinely detected on y). So route by the plan's explicit
    // argumentAxisChannel rather than assuming axisX is always the argument.
    // Test `=== 'y'` (not `=== 'x'`): an absent or unrecognised value must
    // fall back to the conventional x-argument layout, which is both
    // backward compatible with plans predating this field and the safe
    // default — failing open as 'x' rather than silently inverting roles.
    const argumentAxisPlan = diagram.argumentAxisChannel === 'y' ? diagram.axisY : diagram.axisX;
    const valueAxisPlan = diagram.argumentAxisChannel === 'y' ? diagram.axisX : diagram.axisY;
    return {
        component: 'dxChart',
        options: {
            dataSource: plan.data.points,
            palette: plan.palette.colors,
            rotated: diagram.rotated,
            argumentAxis: axisOptions(argumentAxisPlan, false, plan.typography.axisLabel, plan.typography.axisTitle),
            valueAxis: axisOptions(valueAxisPlan, true, plan.typography.axisLabel, plan.typography.axisTitle),
            legend: cartesianLegend,
            title: titleOptions(plan.titles, plan.typography),
            tooltip: {
                enabled: true,
                customizeTooltip: buildCartesianTooltipCustomizer(plan.series),
            },
            series: plan.series.map((s) => cartesianSeries(s, plan.typography.dataLabel)),
        },
    };
}
