// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Concrete DevExpress palettes for a core colour decision.
 *
 * Core's ColorDecision names a scheme *class* (categorical/sequential/
 * diverging) and sometimes an explicit schemeId, but never concrete
 * swatches — picking the actual palette is left to each backend's own
 * colormap module, based on schemeType / categoryCount / backend theme
 * (see core/color-decisions.ts). This module is that pick, mirroring the
 * pattern echarts/colormap.ts and chartjs/colormap.ts already establish
 * for their own backends.
 */

import type { ColorDecision, ColorMapType } from '../core/color-decisions';

export interface DevExpressColorMapDef {
    id: string;
    type: ColorMapType;
    maxCategories?: number;
    diverging?: boolean;
    colors: string[];
}

const DEVEXPRESS_COLOR_MAPS: DevExpressColorMapDef[] = [
    {
        id: 'dx8',
        type: 'categorical',
        maxCategories: 8,
        colors: [
            '#5f8b95', '#ba4d51', '#af8a53', '#955f71',
            '#859666', '#7e688c', '#4f6b8f', '#a6656a',
        ],
    },
    {
        id: 'dx20',
        type: 'categorical',
        maxCategories: 20,
        colors: [
            '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
            '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#d48265',
            '#749f83', '#ca8622', '#bda29a', '#6e7074', '#546570',
            '#c4ccd3', '#4b565b', '#2f4554', '#61a0a8', '#c23531',
        ],
    },
    {
        id: 'viridis',
        type: 'sequential',
        colors: [
            '#440154', '#46327e', '#365c8d', '#277f8e',
            '#1fa187', '#4ac16d', '#a0da39', '#fde725',
        ],
    },
    {
        id: 'redblue',
        type: 'diverging',
        diverging: true,
        colors: [
            '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7',
            '#d1e5f0', '#92c5de', '#4393c3', '#2166ac',
        ],
    },
    {
        id: 'blueorange',
        type: 'diverging',
        diverging: true,
        colors: [
            '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7',
            '#fee0b6', '#fdb863', '#e08214', '#b35806',
        ],
    },
];

/** The ramp DevExpress has always used when nothing else matches. */
export const DEVEXPRESS_DEFAULT_CATEGORICAL_COLORS: string[] = DEVEXPRESS_COLOR_MAPS[0].colors;

function getMapById(id: string | undefined): DevExpressColorMapDef | undefined {
    if (!id) return undefined;
    const key = id.toLowerCase();
    return DEVEXPRESS_COLOR_MAPS.find((m) => m.id.toLowerCase() === key);
}

/**
 * Picks a concrete DevExpress palette for a core colour decision.
 *
 * 1. An explicit `schemeId` (set only when the caller named a scheme
 *    directly) wins if it maps to a known palette.
 * 2. Otherwise auto-select by `schemeType` + `categoryCount`: categorical
 *    picks the smallest map whose `maxCategories` covers the real count;
 *    sequential/diverging pick this module's one map of that type.
 * 3. Falls back to the default categorical ramp when nothing matches —
 *    the same ramp this backend has always used.
 */
export function pickDevExpressPalette(decision: ColorDecision | undefined): string[] {
    if (!decision) {
        return [...DEVEXPRESS_DEFAULT_CATEGORICAL_COLORS];
    }

    const { schemeType, schemeId, categoryCount } = decision;

    if (schemeId) {
        const byId = getMapById(schemeId);
        if (byId && byId.colors.length > 0) {
            return [...byId.colors];
        }
    }

    const mapsOfType = DEVEXPRESS_COLOR_MAPS.filter((m) => m.type === schemeType);

    if (schemeType === 'categorical') {
        const k = categoryCount ?? 0;
        const byCapacity = mapsOfType
            .filter((m) => m.maxCategories == null || m.maxCategories >= k)
            .sort((a, b) => (a.maxCategories ?? Infinity) - (b.maxCategories ?? Infinity));
        const byDescendingCapacity = [...mapsOfType]
            .sort((a, b) => (b.maxCategories ?? Infinity) - (a.maxCategories ?? Infinity));
        const picked = byCapacity[0] ?? byDescendingCapacity[0];
        if (picked && picked.colors.length > 0) {
            return [...picked.colors];
        }
    } else if (schemeType === 'sequential') {
        const seq = mapsOfType[0] ?? getMapById('viridis');
        if (seq && seq.colors.length > 0) {
            return [...seq.colors];
        }
    } else if (schemeType === 'diverging') {
        // No explicit schemeId (the common case: this is the auto-decision path
        // every chat-generated chart takes) defaults to redblue, unchanged from
        // before this task — blueorange is only reachable via an explicit schemeId.
        const div = getMapById('redblue') ?? mapsOfType.find((m) => m.diverging);
        if (div && div.colors.length > 0) {
            return [...div.colors];
        }
    }

    return [...DEVEXPRESS_DEFAULT_CATEGORICAL_COLORS];
}
