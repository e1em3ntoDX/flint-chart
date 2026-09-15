// flint-chart/packages/flint-js/src/devexpress/semantics-bridge.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Defensive readers over ChannelSemantics.
 *
 * Core may express a decision as a primitive or as a descriptor object. Every
 * such read is funnelled through this file so a core refactor breaks one place.
 * Concrete observed shapes are recorded in docs/devexpress-core-api-notes.md.
 *
 * Reconciliation notes (see docs/devexpress-core-api-notes.md):
 * - `zero`: `resolveChannelSemantics` never sets it; each backend assembler
 *   calls `computeZeroDecision` itself and merges the result onto the channel
 *   semantics object it already has, before this reader ever sees it. The real
 *   shape is the whole `ZeroDecision` descriptor — core declares
 *   `ChannelSemantics.zero` as `ZeroDecision` (core/types.ts:148) and reads it
 *   as an object (`zero?.zero`, core/compute-layout.ts:588/592/1753/1757) — so
 *   the object branch below is the one that fires, on its `'zero'` key. The
 *   `boolean` branch and the other candidate keys are defensive fallbacks.
 * - `format`: core DOES populate it, in two real cases — currency with a known
 *   symbol (core/field-semantics.ts:356, `{ pattern: ',.2f', prefix: '$' }`) and
 *   a 0–1 percent with an intrinsicDomain (`:376`, `{ pattern: '.N~%' }`). An
 *   earlier version of this note claimed the opposite; the reader was always
 *   live. Its shape is the real `FormatSpec = { pattern?; prefix?; suffix?;
 *   abbreviate? }` (field-semantics.ts:89), and `pattern` is checked first.
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
import type { ArgumentScaleType, PalettePlan, ValueFormatSpec, ValueScaleType } from './plan';

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
    // A bare boolean is not the real shape (see the reconciliation note above);
    // it is tolerated only so a hand-built fixture or a differently shaped core
    // version still reads sensibly.
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
        // 'pattern' is the real FormatSpec key (field-semantics.ts:89) and is
        // already checked first; the rest remain as defensive fallbacks.
        for (const key of ['pattern', 'format', 'specifier', 'formatString']) {
            if (typeof record[key] === 'string') return record[key] as string;
        }
    }
    return undefined;
}

export function resolveTooltipFormat(sem: Loose | undefined): ValueFormatSpec | undefined {
    const format = (sem?.tooltipFormat ?? sem?.format) as unknown;
    const record = asRecord(format);
    if (!record) return undefined;
    const result: ValueFormatSpec = {};
    if (typeof record.pattern === 'string') result.pattern = record.pattern;
    if (typeof record.prefix === 'string') result.prefix = record.prefix;
    if (typeof record.suffix === 'string') result.suffix = record.suffix;
    if (typeof record.abbreviate === 'boolean') result.abbreviate = record.abbreviate;
    return Object.keys(result).length > 0 ? result : undefined;
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

/**
 * The real, polarity-aware diverging scheme name core computes per channel
 * (e.g. `'blueorange'` for a warm-high intensity measure, `'redblue'` for a
 * signed/valence one) — confirmed at `core/semantic-types.ts`'s `getRecommendedColorScheme`,
 * distinct from (and unrelated to) `ColorDecision.schemeId`, which core leaves
 * unset on the auto-decision path every chat-generated chart takes.
 */
export function resolveDivergingScheme(sem: Loose | undefined): string | undefined {
    const scheme = asRecord(sem?.colorScheme);
    const value = scheme?.scheme;
    return typeof value === 'string' ? value : undefined;
}
