// flint-chart/packages/flint-js/src/devexpress/semantics-bridge.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Defensive readers over ChannelSemantics.
 *
 * Core may express a decision as a primitive or as a descriptor object. Every
 * such read is funnelled through this file so a core refactor breaks one place.
 * Concrete observed shapes are recorded in docs/flint-api-notes.md.
 *
 * Reconciliation notes (Task 5, Step 5 — see docs/flint-api-notes.md):
 * - `zero`: `resolveChannelSemantics` never sets it; each backend assembler
 *   calls `computeZeroDecision` itself and merges the plain boolean `zero`
 *   field onto the channel semantics object it already has, before this
 *   reader ever sees it. So in production `sem.zero` is a plain `boolean` —
 *   the `typeof zero === 'boolean'` branch below is the one that actually
 *   fires. The `{ includeZero }`-style object branch is speculative/defensive
 *   only (kept as a fallback in case a future core version wraps the
 *   decision in a descriptor) and is deliberately left in place, unordered
 *   relative to itself, since it was never observed for real.
 * - `format`: real captures never populate `.format` (only `.tooltipFormat`,
 *   out of scope here), but when a backend sets `.format` its shape is the
 *   real `FormatSpec = { pattern?; prefix?; suffix?; abbreviate? }`
 *   (field-semantics.ts:69). `pattern` was already first in the candidate
 *   list; confirmed correct, left unchanged.
 * - `colorScheme`: real shape is `ColorSchemeRecommendation =
 *   { scheme: string; type: ColorSchemeType; reason: string; domainMid?: number }`
 *   (semantic-types.ts:591), where `type` carries the class
 *   ('sequential'|'diverging'|'categorical'). The original candidate order
 *   `class ?? kind ?? type ?? schemeClass` checked `type` third; reordered to
 *   `type ?? class ?? kind ?? schemeClass` so the confirmed-real key is
 *   checked first. Fallback keys kept, unchanged, in case a differently
 *   shaped recommendation object shows up from another core version.
 */

import type { ChannelSemantics } from '../core/types';
import type { ArgumentScaleType, PalettePlan, ValueScaleType } from './plan';

// Note: intentionally *not* intersected with `Record<string, unknown>`. An
// interface without an index signature (ChannelSemantics has none) is not
// assignable to a type requiring one, so real callers passing an actual
// `ChannelSemantics` value (e.g. `context.channelSemantics.x` from
// InstantiateContext) would fail to type-check against these readers. Tests
// that build ad hoc fixtures already cast with `as never`, so they don't need
// the extra looseness.
type Loose = Partial<ChannelSemantics>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

export function resolveIncludeZero(sem: Loose | undefined): boolean {
    const zero = sem?.zero as unknown;
    // Real shape (post-assembler merge of computeZeroDecision's result): a
    // plain boolean. Checked first because this is the branch confirmed to
    // fire in practice — see reconciliation note above.
    if (typeof zero === 'boolean') return zero;
    const record = asRecord(zero);
    if (record) {
        for (const key of ['includeZero', 'include', 'zero', 'value']) {
            if (typeof record[key] === 'boolean') return record[key] as boolean;
        }
    }
    return false;
}

export function resolveLabelFormat(sem: Loose | undefined): string | undefined {
    const format = sem?.format as unknown;
    if (typeof format === 'string') return format;
    const record = asRecord(format);
    if (record) {
        // 'pattern' is the real FormatSpec key (field-semantics.ts:69) and is
        // already checked first; the rest remain as defensive fallbacks.
        for (const key of ['pattern', 'format', 'specifier', 'formatString']) {
            if (typeof record[key] === 'string') return record[key] as string;
        }
    }
    return undefined;
}

export function resolveLogarithmic(sem: Loose | undefined): boolean {
    return sem?.scaleType === 'log' || sem?.scaleType === 'symlog';
}

export function resolveReverse(sem: Loose | undefined): boolean {
    return sem?.reversed === true || sem?.sortDirection === 'descending';
}

export function resolveArgumentScaleType(sem: Loose | undefined): ArgumentScaleType {
    switch (sem?.type) {
        case 'temporal': return 'DateTime';
        case 'quantitative': return 'Numerical';
        case 'nominal':
        case 'ordinal': return 'Qualitative';
        default: return 'Qualitative';
    }
}

export function resolveValueScaleType(sem: Loose | undefined): ValueScaleType {
    return sem?.type === 'temporal' ? 'DateTime' : 'Numerical';
}

export function resolvePaletteClass(sem: Loose | undefined): PalettePlan['class'] {
    const scheme = asRecord(sem?.colorScheme);
    // 'type' is the real ColorSchemeRecommendation key (semantic-types.ts:591)
    // and is checked first now; the rest remain as defensive fallbacks in
    // case another core version names the field differently.
    const raw = scheme
        ? (scheme.type ?? scheme.class ?? scheme.kind ?? scheme.schemeClass)
        : undefined;
    if (raw === 'sequential' || raw === 'diverging' || raw === 'categorical') return raw;
    return 'categorical';
}
