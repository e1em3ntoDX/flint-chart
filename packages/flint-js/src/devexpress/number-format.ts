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
