// flint-chart/packages/flint-js/src/devexpress/number-format.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Formats a raw data value for display in a chart label or tooltip.
 *
 * `spec.pattern` carries the small subset of d3-format syntax Flint core's
 * `resolveFormat` (core/field-semantics.ts) actually emits today: an
 * optional leading `+`, an optional grouping comma, then either `d`
 * (integer) or `.<N>f` (fixed decimals) — or a percent form `.<N>%` /
 * `.<N>~%` (the `~` trims a trailing ".0"). This is not a general d3-format
 * implementation; only this exact grammar is ever produced by core, so only
 * this grammar is interpreted. Anything else, or no spec at all, falls back
 * to a generic grouped format.
 */

import type { ValueFormatSpec } from './plan';

function applyPattern(value: number, pattern: string): string {
    const isPercent = pattern.endsWith('%');
    const scaled = isPercent ? value * 100 : value;
    const grouped = pattern.includes(',');
    const signed = pattern.startsWith('+');

    const fixedMatch = pattern.match(/\.(\d+)f/);
    const percentMatch = pattern.match(/\.(\d+)~?%/);
    const decimals = fixedMatch ? Number(fixedMatch[1]) : percentMatch ? Number(percentMatch[1]) : 0;

    let digits = Math.abs(scaled).toFixed(decimals);
    if (isPercent && pattern.includes('~')) {
        digits = digits.replace(/\.?0+$/, '');
    }
    if (grouped) {
        const [whole, frac] = digits.split('.');
        const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        digits = frac ? `${withCommas}.${frac}` : withCommas;
    }

    const sign = scaled < 0 ? '-' : (signed && scaled > 0 ? '+' : '');
    return `${sign}${digits}${isPercent ? '%' : ''}`;
}

function abbreviateValue(value: number): { scaled: number; unit: string } {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return { scaled: value / 1_000_000_000, unit: 'B' };
    if (abs >= 1_000_000) return { scaled: value / 1_000_000, unit: 'M' };
    if (abs >= 1_000) return { scaled: value / 1_000, unit: 'K' };
    return { scaled: value, unit: '' };
}

function genericFormat(value: number): string {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** DevExtreme's numeric-format object; see `label.format` in the dxChart docs. */
export interface DevExtremeNumberFormat {
    type: 'fixedPoint' | 'percent';
    precision: number;
    useThousandsSeparator?: boolean;
}

/**
 * The DevExtreme `label.format` equivalent of a d3 pattern, or undefined when
 * the pattern falls outside the subset core emits.
 *
 * DevExtreme's `label.format` accepts a format name, a `{ type, precision }`
 * object, or an LDML pattern — never d3 syntax, so passing a pattern like
 * ',.2f' straight through renders the ticks wrong. This returns the object
 * form rather than an LDML string: it needs no locale-pattern escaping, and
 * `useThousandsSeparator` carries the grouping flag that a `,` encodes in d3.
 * One representation only, so callers and tests cannot disagree on shape.
 * Anything unrecognised returns undefined and the caller leaves `format`
 * unset rather than handing dxChart a string it cannot read.
 *
 * The grammar parsed here is the same one applyPattern above interprets: an
 * optional leading '+', an optional grouping ',', then 'd' or '.Nf', or a
 * percent form '.N%' / '.N~%'.
 *
 * Known limitation: the `~` in `.1~%` means "trim a trailing zero" (0.40 ->
 * "40%" instead of "40.0%"), which the `{ type, precision }` object form
 * cannot express — `precision` always shows that many decimals, so a
 * `.1~%` axis reads "12.0%". applyPattern above still honours `~` for point
 * labels and tooltips, so on such an axis the ticks and the point labels can
 * differ by a trailing ".0". That is narrower than the bug this function
 * fixes (ticks rendering raw d3 syntax outright), but it is real.
 *
 * Same admission for the leading `+`: the object form has no sign-forcing
 * equivalent, so a `+`-prefixed pattern would render without the forced sign
 * on the axis. Currently unreachable in practice — core only ever populates
 * `.format` (the axis-bound field) from the currency and 0–1-percent
 * branches (field-semantics.ts:356, :376), and neither passes `signMode: '+'`
 * to precisionFormat — but the grammar comment above still lists `+`, so this
 * function should say plainly that it drops it rather than let a reader
 * assume it's handled.
 */
export function patternToDevExtremeFormat(pattern: string): DevExtremeNumberFormat | undefined {
    const useThousandsSeparator = pattern.includes(',');
    const percentMatch = pattern.match(/\.(\d+)~?%/);
    if (pattern.endsWith('%') && percentMatch) {
        return { type: 'percent', precision: Number(percentMatch[1]), useThousandsSeparator };
    }
    const fixedMatch = pattern.match(/\.(\d+)f/);
    if (fixedMatch) {
        return { type: 'fixedPoint', precision: Number(fixedMatch[1]), useThousandsSeparator };
    }
    if (/(^|[^a-z])d$/.test(pattern)) {
        return { type: 'fixedPoint', precision: 0, useThousandsSeparator };
    }
    return undefined;
}

export function formatValue(raw: unknown, spec?: ValueFormatSpec): string {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return raw == null ? '' : String(raw);
    }

    let value = raw;
    let unit = '';
    if (spec?.abbreviate) {
        const result = abbreviateValue(value);
        value = result.scaled;
        unit = result.unit;
    }

    const body = spec?.pattern ? applyPattern(value, spec.pattern) : genericFormat(value);
    return `${spec?.prefix ?? ''}${body}${unit}${spec?.suffix ?? ''}`;
}
