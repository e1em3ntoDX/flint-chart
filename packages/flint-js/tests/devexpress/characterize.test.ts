// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * DEVEXPRESS CHARACTERIZATION TEST
 * =============================================================================
 *
 * This test asserts almost nothing about Flint's behavior. Its purpose is to
 * PRINT the real runtime shapes of a handful of Flint core functions so they
 * can be transcribed, verbatim, into docs/flint-api-notes.md at the root of
 * the DevExpress spike repo. Every later task in the DevExpress backend plan
 * depends on those notes being accurate rather than assumed.
 *
 * Do not add assertions here beyond "it ran and produced a shape" — the point
 * is observation, not verification of Flint's own correctness (that's covered
 * by Flint's own test suite).
 * =============================================================================
 */
import { describe, it, expect } from 'vitest';
import { resolveChannelSemantics, convertTemporalData } from '../../src/core/resolve-semantics';
import { computeZeroDecision } from '../../src/core/semantic-types';
import { computeChannelBudgets } from '../../src/core/compute-layout';
import { filterOverflow } from '../../src/core/filter-overflow';
import { computeLayout } from '../../src/core/compute-layout';
import type { ChartEncoding } from '../../src/core/types';

const data = [
    { quarter: 'Q1', revenue: 1200, region: 'North' },
    { quarter: 'Q2', revenue: 1450, region: 'North' },
    { quarter: 'Q3', revenue: 980, region: 'South' },
    { quarter: 'Q4', revenue: 1800, region: 'South' },
];

const semanticTypes: Record<string, string> = {
    quarter: 'Quarter',
    revenue: 'Price',
    region: 'Country',
};

const encodings: Record<string, ChartEncoding> = {
    x: { field: 'quarter' },
    y: { field: 'revenue' },
    color: { field: 'region' },
};

describe('flint core shapes (devexpress characterization)', () => {
    it('convertTemporalData: shape of the pre-conversion pass', () => {
        const converted = convertTemporalData(data, semanticTypes);
        console.log('=== convertTemporalData ===');
        console.log(JSON.stringify(converted, null, 2));
        expect(Array.isArray(converted)).toBe(true);
    });

    it('resolveChannelSemantics: real ChannelSemantics record per channel', () => {
        const convertedData = convertTemporalData(data, semanticTypes);
        const sem = resolveChannelSemantics(encodings, data, semanticTypes, convertedData);
        console.log('=== resolveChannelSemantics ===');
        console.log(JSON.stringify(sem, null, 2));
        expect(sem.y).toBeDefined();
        expect(sem.y.type).toBe('quantitative');
        // zero is NOT resolved by resolveChannelSemantics -- it is finalized
        // by each backend's assembler after this call, via computeZeroDecision.
        expect(sem.y.zero).toBeUndefined();
    });

    it('computeZeroDecision: real ZeroDecision shape for a bar-mark quantitative channel', () => {
        const values = data.map(r => r.revenue);
        const decision = computeZeroDecision('Price', 'y', 'bar', values);
        console.log('=== computeZeroDecision ===');
        console.log(JSON.stringify(decision, null, 2));
        expect(typeof decision.zero).toBe('boolean');
    });

    it('computeChannelBudgets -> filterOverflow -> computeLayout: full Phase 0/1 pipeline shapes', () => {
        const convertedData = convertTemporalData(data, semanticTypes);
        const channelSemantics = resolveChannelSemantics(encodings, data, semanticTypes, convertedData);

        const declaration = {
            resolvedTypes: {
                x: channelSemantics.x?.type,
                y: channelSemantics.y?.type,
                color: channelSemantics.color?.type,
            },
        };
        const canvasSize = { width: 400, height: 320 };
        const options = {};

        const budgets = computeChannelBudgets(channelSemantics, declaration, data, canvasSize, options);
        console.log('=== computeChannelBudgets ===');
        console.log(JSON.stringify(budgets, null, 2));

        const overflow = filterOverflow(
            channelSemantics, declaration, encodings, data, budgets, new Set(['bar']),
        );
        console.log('=== filterOverflow ===');
        console.log(JSON.stringify(overflow, null, 2));

        const layout = computeLayout(
            channelSemantics, declaration, overflow.filteredData ?? data, canvasSize, options,
        );
        console.log('=== computeLayout ===');
        console.log(JSON.stringify(layout, null, 2));

        expect(budgets).toBeDefined();
        expect(overflow).toBeDefined();
        expect(layout).toBeDefined();
    });

    it('filterOverflow: real ChartWarning/TruncationWarning shape when a channel overflows', () => {
        // Force overflow: many more discrete x categories than a tiny canvas can fit.
        const wideData = Array.from({ length: 200 }, (_, i) => ({
            category: `Cat${i}`,
            revenue: 100 + i,
            region: i % 2 === 0 ? 'North' : 'South',
        }));
        const wideSemanticTypes: Record<string, string> = {
            category: 'Category',
            revenue: 'Price',
            region: 'Country',
        };
        const wideEncodings: Record<string, ChartEncoding> = {
            x: { field: 'category' },
            y: { field: 'revenue' },
            color: { field: 'region' },
        };
        const convertedData = convertTemporalData(wideData, wideSemanticTypes);
        const channelSemantics = resolveChannelSemantics(
            wideEncodings, wideData, wideSemanticTypes, convertedData,
        );
        const declaration = {
            resolvedTypes: {
                x: channelSemantics.x?.type,
                y: channelSemantics.y?.type,
                color: channelSemantics.color?.type,
            },
        };
        const canvasSize = { width: 400, height: 320 };
        const budgets = computeChannelBudgets(channelSemantics, declaration, wideData, canvasSize, {});
        const overflow = filterOverflow(
            channelSemantics, declaration, wideEncodings, wideData, budgets, new Set(['bar']),
        );
        console.log('=== filterOverflow (forced overflow) ===');
        console.log(JSON.stringify({ nominalCounts: overflow.nominalCounts, truncations: overflow.truncations, warnings: overflow.warnings }, null, 2));
        expect(overflow.filteredData.length).toBeLessThanOrEqual(wideData.length);
    });
});
