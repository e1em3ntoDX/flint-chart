// flint-chart/packages/flint-js/src/devexpress/templates/point.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { InstantiateContext } from '../../core/types';
import type { DevExpressChartPlan, SeriesPlan } from '../plan';
import { binHistogram } from '../transforms';
import {
    applyCartesianFrame, applySplitSeries, baseSeries, fieldOf, noteUnsupported, resolveAxisRoles,
    resolveSplitChannel,
} from './bar';
import { registerTemplate, type DxTemplateDef } from './index';

type Draft = Partial<DevExpressChartPlan>;

const scatterPlot: DxTemplateDef = {
    chart: 'Scatter Plot',
    template: {},
    channels: ['x', 'y', 'color', 'size', 'opacity'],
    requiredChannels: ['x', 'y'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'position',
    instantiate(spec: Draft, context: InstantiateContext) {
        const hasColor = context.encodings.color != null;
        const sizeField = fieldOf(context, 'size');
        // A Bubble series rejects color outright (see below) — structurally,
        // whatever the channel's type — so resolveSplitChannel's continuous-
        // channel check must not even run there, or a continuous color on a
        // Bubble would earn two notes for the same channel: this one and the
        // Bubble one below. The legend follows whether a split actually
        // happened, not merely whether a color channel was bound — otherwise
        // it turns on with nothing in it to label.
        const splitsByColor = !sizeField && resolveSplitChannel(spec, context, 'color');
        applyCartesianFrame(spec, context, { rotated: false, legend: splitsByColor });
        if (sizeField) {
            // Bubble encodes the third measure in the marker area, so a color
            // split would need a series per category *and* per bubble size —
            // dxChart has no such shape. Report rather than drop.
            const { valueAxis } = resolveAxisRoles(context);
            const series: SeriesPlan = {
                ...baseSeries(context, 'Bubble'),
                valueFields: [fieldOf(context, valueAxis)!, sizeField],
            };
            spec.series = [series];
            if (hasColor) {
                noteUnsupported(spec, {
                    feature: 'color',
                    action: 'rejected',
                    detail: 'A Bubble series already spends its value fields on the size measure; '
                        + 'dxChart cannot also split it by category.',
                });
            }
        } else if (splitsByColor) {
            applySplitSeries(spec, context, 'color', 'Point', false);
            for (const series of spec.series ?? []) series.markerKind = 'Circle';
        } else {
            spec.series = [{ ...baseSeries(context, 'Point'), markerKind: 'Circle' }];
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

const connectedScatterPlot: DxTemplateDef = {
    chart: 'Connected Scatter Plot',
    template: {},
    channels: ['x', 'y', 'color'],
    requiredChannels: ['x', 'y'],
    family: 'Cartesian',
    targets: ['devextreme', 'xtracharts'],
    markCognitiveChannel: 'position',
    instantiate(spec: Draft, context: InstantiateContext) {
        const splitsByColor = resolveSplitChannel(spec, context, 'color');
        applyCartesianFrame(spec, context, { rotated: false, legend: splitsByColor });
        if (splitsByColor) {
            applySplitSeries(spec, context, 'color', 'ScatterLine', false);
        } else {
            spec.series = [baseSeries(context, 'ScatterLine')];
        }
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
        // fullTable, not table: filterOverflow may have dropped values to fit
        // the canvas (core/filter-overflow.ts), and a histogram binned over a
        // truncated table reports a distorted distribution with nothing said
        // about it. fullTable is the pre-filtering table for exactly this
        // (core/types.ts:480-492, "Templates that need an honest view of the
        // raw data").
        const source = context.fullTable ?? context.table;
        const bins = binHistogram(source, field);
        const binnedContext: InstantiateContext = { ...context, table: bins };
        applyCartesianFrame(spec, binnedContext, { rotated: false, legend: false });
        // Histogram declares only channel x, so applyCartesianFrame's value
        // axis (axisY here — resolveAxisRoles puts the bin labels on x as the
        // category, count on y as the value) had no channel semantics to
        // read: it came out untitled with includeZero:false, which unanchors
        // the bars from zero and breaks the one invariant a histogram has —
        // bar height proportional to frequency. Set it explicitly here, where
        // the count field is known. Spread the existing axis object (rather
        // than replacing spec.diagram wholesale) so argumentAxisChannel,
        // which applyCartesianFrame just set, survives.
        const { categoryAxis, valueAxis } = resolveAxisRoles(binnedContext);
        const axisKey = valueAxis === 'x' ? 'axisX' : 'axisY';
        spec.diagram![axisKey] = {
            ...spec.diagram![axisKey],
            title: 'Count',
            includeZero: true,
        };
        // The argument axis's channel semantics still describe the
        // PRE-BINNING quantitative field (binnedContext only swaps `table`,
        // not `channelSemantics`), so axis() upstream in applyCartesianFrame
        // may have set a numeric labelFormat or a currency labelPrefix/
        // labelSuffix from it. But the values this axis actually renders are
        // `bin`, the pre-formatted string labels binHistogram already
        // produced (e.g. "100–107") — reformatting or re-affixing them would
        // print "$100–107". Clear all three so the bin strings render as-is.
        const argumentAxisKey = categoryAxis === 'x' ? 'axisX' : 'axisY';
        spec.diagram![argumentAxisKey] = {
            ...spec.diagram![argumentAxisKey],
            labelFormat: undefined,
            labelPrefix: undefined,
            labelSuffix: undefined,
        };
        spec.series = [{
            name: 'Count',
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
