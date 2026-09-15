// flint-chart/packages/flint-js/src/devexpress/transforms.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Data transforms the DevExpress backend must perform itself.
 *
 * Vega-Lite does binning declaratively; XtraCharts and dxChart do not bin, so
 * the compiler materialises buckets while it still holds the rows.
 */

import type { ChartWarning } from '../core/types';

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

/**
 * One row per category, values summed.
 *
 * A circular plan's points map one-to-one onto sectors: dxPieChart draws a
 * separate slice for every row it is given, so two rows for the same category
 * become two same-named slices rather than one combined one. Cartesian families
 * do not need this — an axis re-uses its category — which is why the rollup
 * lives on the circular path only.
 *
 * Order follows the channel's canonical ordinal order where core supplies one
 * (core/resolve-semantics.ts:474-482 infers it from the field's semantic type,
 * e.g. Month/Day/Quarter — it is never read off the encoding), then first
 * appearance for anything outside it.
 *
 * A row whose category is null/undefined is dropped rather than rolled up —
 * there is no sector to attribute it to. That row loss is otherwise silent,
 * so an optional `warnings` sink lets a caller (circular.ts) report how many
 * rows were dropped, the same way splitSeries reports its own row collapse
 * via the `series-split-aggregated` warning. Omitting it keeps every existing
 * caller and test byte-for-byte compatible — this does not change the
 * drop itself, or the empty-result behaviour when every row is dropped.
 */
export function rollupCategories(
    rows: Record<string, unknown>[],
    categoryField: string,
    valueField: string,
    ordinalSortOrder?: string[],
    warnings?: ChartWarning[],
): Record<string, unknown>[] {
    const totals = new Map<string, { row: Record<string, unknown>; total: number }>();
    let droppedNullCategory = 0;
    for (const row of rows) {
        const raw = row?.[categoryField];
        if (raw == null) { droppedNullCategory += 1; continue; }
        const key = String(raw);
        const value = Number(row[valueField]);
        const entry = totals.get(key);
        if (entry) {
            entry.total += Number.isFinite(value) ? value : 0;
        } else {
            totals.set(key, { row, total: Number.isFinite(value) ? value : 0 });
        }
    }

    if (droppedNullCategory > 0 && warnings) {
        warnings.push({
            severity: 'info',
            code: 'category-rollup-null-dropped',
            message:
                `${droppedNullCategory} row${droppedNullCategory === 1 ? '' : 's'} had a null ` +
                `${categoryField} and were dropped before rolling up into sectors.`,
            channel: 'color',
            field: categoryField,
        });
    }

    const keys = [...totals.keys()];
    if (ordinalSortOrder?.length) {
        const canonical = ordinalSortOrder.map(String);
        const known = canonical.filter((k) => totals.has(k));
        const extra = keys.filter((k) => !canonical.includes(k));
        keys.length = 0;
        keys.push(...known, ...extra);
    }

    return keys.map((key) => {
        const { row, total } = totals.get(key)!;
        return { ...row, [valueField]: total };
    });
}
