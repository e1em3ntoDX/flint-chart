// flint-chart/packages/flint-js/src/devexpress/typography.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Resolves a Flint `TypeRole` (a theme's font role — headline, deck, axisLabel,
 * etc.) into a DevExtreme-ready `FontSpec`.
 *
 * `TypeRole.size` is often a design-token string (`"text.300"`), not a raw
 * pixel number. The table that resolves it — `TEXT_TOKENS`/`tokenToPx()` — is
 * a real, stable design-token scale, but it lives PRIVATE inside
 * `core/theme/ground.ts:241-254`, reachable only via the full `groundTheme()`
 * grounding pipeline (Level 2), which needs a much larger `GroundingContext`
 * (mark types, positional channels, stacking, etc.) than this backend
 * currently assembles anywhere. This file deliberately duplicates just that
 * one small, fixed table locally rather than adopting the whole pipeline — a
 * documented, cited duplicate, not independently-invented behavior.
 */

import type { TypeRole } from '../core/theme';
import type { FontSpec } from './plan';

/** Mirrors core/theme/ground.ts:241-244's TEXT_TOKENS exactly. */
const TEXT_TOKENS: Record<string, number> = {
    '100': 10, '200': 12, '300': 14, '400': 16, '500': 20, '600': 24,
    hero700: 28, hero800: 32, hero900: 40, hero1000: 68,
};

/** Mirrors core/theme/ground.ts:246's WEIGHTS exactly. */
const WEIGHTS: Record<string, number> = { regular: 400, medium: 500, semibold: 600, bold: 700 };

/** Mirrors core/theme/ground.ts:248-254's tokenToPx() exactly. */
function tokenToPx(size: string | number | undefined): number | undefined {
    if (size == null) return undefined;
    if (typeof size === 'number') return size;
    const m = /^text\.(.+)$/.exec(size);
    if (m && TEXT_TOKENS[m[1]] != null) return TEXT_TOKENS[m[1]];
    const n = Number(size);
    return Number.isFinite(n) ? n : undefined;
}

/**
 * Converts one Flint `TypeRole` into a DevExtreme-ready `FontSpec`. Only sets
 * a field when the source `TypeRole` field is present and resolvable — a
 * theme that sets only `size`/`color` (e.g. Economist's real `type.deck`)
 * leaves `family`/`weight` unset, so DevExtreme's own defaults apply for
 * those. `TypeRole.style` (italic) and `.case` (upper/lower/title-case) have
 * no DevExtreme font-object equivalent and are deliberately never read here
 * — the caller is responsible for naming them in an unsupported note.
 */
export function resolveTypeRole(role: TypeRole | undefined): FontSpec | undefined {
    if (!role) return undefined;
    const font: FontSpec = {};
    if (role.family) font.family = role.family;
    const size = tokenToPx(role.size);
    if (size !== undefined) font.size = size;
    if (role.weight) font.weight = WEIGHTS[role.weight];
    if (role.color) font.color = role.color;
    return font;
}
