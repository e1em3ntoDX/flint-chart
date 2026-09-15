// flint-chart/packages/flint-js/src/devexpress/transforms.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Data transforms the DevExpress backend must perform itself.
 *
 * Vega-Lite does binning declaratively; XtraCharts and dxChart do not bin, so
 * the compiler materialises buckets while it still holds the rows.
 */

export interface HistogramBin extends Record<string, unknown> {
    bin: string;
    binStart: number;
    binEnd: number;
    count: number;
}

function formatBound(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function binHistogram(
    rows: Record<string, unknown>[],
    field: string,
    // Sturges-style ceil(sqrt(n)), capped at 20. This is a backend-local rule
    // by necessity, not by preference: ChannelSemantics.binningSuggested
    // (core/types.ts:177) is a boolean — core says whether to bin, never into
    // how many buckets — so there is no core decision to defer to. Revisit if
    // core ever grows a bin-count signal.
    maxBins = 20,
): HistogramBin[] {
    const values = rows
        .map((row) => row[field])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length === 0) return [];

    // Not Math.min(...values)/Math.max(...values): spreading the array onto
    // the call stack throws RangeError past V8's argument-count limit
    // (~65536-125000), a real ceiling given the MCP guide recommends a local
    // server precisely "for large datasets".
    let min = values[0];
    let max = values[0];
    for (const value of values) {
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (min === max) {
        return [{
            bin: formatBound(min), binStart: min, binEnd: min, count: values.length,
        }];
    }

    const binCount = Math.max(1, Math.min(maxBins, Math.ceil(Math.sqrt(values.length))));
    const width = (max - min) / binCount;
    const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => {
        const binStart = min + i * width;
        const binEnd = i === binCount - 1 ? max : binStart + width;
        return {
            bin: `${formatBound(binStart)}–${formatBound(binEnd)}`,
            binStart, binEnd, count: 0,
        };
    });

    for (const value of values) {
        // Clamp so the maximum lands in the last bin instead of overflowing.
        const index = Math.min(binCount - 1, Math.floor((value - min) / width));
        bins[index].count += 1;
    }
    return bins;
}
