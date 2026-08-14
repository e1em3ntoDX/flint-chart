// flint-chart/packages/flint-js/tests/devexpress/semantics-bridge.test.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
    resolveIncludeZero, resolveLabelFormat, resolveLogarithmic, resolveTooltipFormat,
    resolveDivergingScheme, resolveArgumentScaleType, resolveValueScaleType, resolvePaletteClass,
} from '../../src/devexpress/semantics-bridge';

describe('resolveIncludeZero', () => {
    it('is false when semantics are absent', () => {
        expect(resolveIncludeZero(undefined)).toBe(false);
    });
    it('reads a boolean zero decision', () => {
        expect(resolveIncludeZero({ zero: true } as never)).toBe(true);
        expect(resolveIncludeZero({ zero: false } as never)).toBe(false);
    });
    it('reads an object zero decision', () => {
        expect(resolveIncludeZero({ zero: { includeZero: true } } as never)).toBe(true);
        expect(resolveIncludeZero({ zero: { includeZero: false } } as never)).toBe(false);
    });
    it('falls back to false for an unrecognised shape', () => {
        expect(resolveIncludeZero({ zero: 'maybe' } as never)).toBe(false);
    });

    // Reconciliation (docs/flint-api-notes.md): resolveChannelSemantics never
    // sets `zero` at all — the doc comment says zero-baseline "requires
    // template mark knowledge that belongs to the assembler." Each backend
    // assembler calls computeZeroDecision itself (real return shape:
    // { zero: boolean; domainPadFraction; zeroClass; forced; uncertain }) and
    // merges the plain boolean `zero` field onto the ChannelSemantics object
    // it already has, before instantiate() runs. So by the time this reader
    // sees a real object in production, sem.zero is a plain boolean sitting
    // alongside a full set of ChannelSemantics fields — not an isolated
    // `{ zero: true }` fixture and not an `{ includeZero }` descriptor.
    it('reads the real merged shape: plain boolean zero on a full ChannelSemantics-like object', () => {
        const semWithZeroTrue = {
            field: 'revenue',
            semanticAnnotation: { semanticType: 'Price' },
            type: 'quantitative',
            aggregationDefault: 'average',
            sortDirection: 'ascending',
            nice: true,
            stackable: false,
            zero: true, // merged in by the assembler after computeZeroDecision
        };
        expect(resolveIncludeZero(semWithZeroTrue as never)).toBe(true);

        const semWithZeroFalse = { ...semWithZeroTrue, zero: false };
        expect(resolveIncludeZero(semWithZeroFalse as never)).toBe(false);
    });
});

describe('resolveLabelFormat', () => {
    it('is undefined when no format is present', () => {
        expect(resolveLabelFormat(undefined)).toBeUndefined();
    });
    it('passes a string format through', () => {
        expect(resolveLabelFormat({ format: '$#,##0' } as never)).toBe('$#,##0');
    });
    it('reads a format object', () => {
        expect(resolveLabelFormat({ format: { pattern: '0.0%' } } as never)).toBe('0.0%');
    });

    // Reconciliation (docs/flint-api-notes.md): the real capture never
    // populated `.format` (only `.tooltipFormat`, out of scope for this
    // reader) — but the FormatSpec shape it and `.format` share, per
    // field-semantics.ts:69, is
    // `{ pattern?: string; prefix?: string; suffix?: string; abbreviate?: boolean }`.
    // `pattern` is already first in the candidate list; this asserts against
    // the full real shape (all optional keys present) rather than a
    // minimal `{ pattern }` fixture.
    it('reads the real FormatSpec shape, with prefix/suffix/abbreviate also present', () => {
        const format = { pattern: ',.2f', prefix: '$', suffix: 'k', abbreviate: true };
        expect(resolveLabelFormat({ format } as never)).toBe(',.2f');
    });
});

describe('resolveTooltipFormat', () => {
    it('is undefined when no tooltipFormat or format is present', () => {
        expect(resolveTooltipFormat(undefined)).toBeUndefined();
        expect(resolveTooltipFormat({} as never)).toBeUndefined();
    });

    it('reads a real tooltipFormat with a prefix', () => {
        const tooltipFormat = { pattern: ',.2f', prefix: '$' };
        expect(resolveTooltipFormat({ tooltipFormat } as never)).toEqual({ pattern: ',.2f', prefix: '$' });
    });

    it('reads a real tooltipFormat with a suffix', () => {
        const tooltipFormat = { pattern: ',d', suffix: '%' };
        expect(resolveTooltipFormat({ tooltipFormat } as never)).toEqual({ pattern: ',d', suffix: '%' });
    });

    it('falls back to .format when .tooltipFormat is absent', () => {
        const format = { pattern: '.1%' };
        expect(resolveTooltipFormat({ format } as never)).toEqual({ pattern: '.1%' });
    });

    it('prefers .tooltipFormat over .format when both are present', () => {
        const sem = { format: { pattern: 'x' }, tooltipFormat: { pattern: ',.2f' } };
        expect(resolveTooltipFormat(sem as never)).toEqual({ pattern: ',.2f' });
    });
});

describe('scale types', () => {
    it('maps nominal and ordinal arguments to Qualitative', () => {
        expect(resolveArgumentScaleType({ type: 'nominal' } as never)).toBe('Qualitative');
        expect(resolveArgumentScaleType({ type: 'ordinal' } as never)).toBe('Qualitative');
    });
    it('maps temporal to DateTime and quantitative to Numerical', () => {
        expect(resolveArgumentScaleType({ type: 'temporal' } as never)).toBe('DateTime');
        expect(resolveArgumentScaleType({ type: 'quantitative' } as never)).toBe('Numerical');
    });
    it('defaults values to Numerical', () => {
        expect(resolveValueScaleType(undefined)).toBe('Numerical');
        expect(resolveValueScaleType({ type: 'temporal' } as never)).toBe('DateTime');
    });
});

describe('resolveLogarithmic and resolvePaletteClass', () => {
    it('detects a log scale', () => {
        expect(resolveLogarithmic({ scaleType: 'log' } as never)).toBe(true);
        expect(resolveLogarithmic({ scaleType: 'linear' } as never)).toBe(false);
    });
    it('defaults the palette class to categorical', () => {
        expect(resolvePaletteClass(undefined)).toBe('categorical');
    });

    // Reconciliation (docs/flint-api-notes.md): the real colorScheme shape is
    // ColorSchemeRecommendation (semantic-types.ts:591):
    // { scheme: string; type: ColorSchemeType; reason: string; domainMid?: number }
    // where `type` is one of 'sequential' | 'diverging' | 'categorical'. The
    // original candidate list checked `class ?? kind ?? type ?? schemeClass`
    // (type third); reordered to `type ?? class ?? kind ?? schemeClass` so
    // the confirmed-real key is checked first. This asserts against the
    // actual captured shape, including the non-palette-class fields
    // (`scheme`, `reason`) that a real recommendation always carries too.
    it('reads the real ColorSchemeRecommendation shape (categorical)', () => {
        const colorScheme = {
            scheme: 'set2',
            type: 'categorical',
            reason: 'geographic regions use distinct pastels',
        };
        expect(resolvePaletteClass({ colorScheme } as never)).toBe('categorical');
    });
    it('reads the real ColorSchemeRecommendation shape (diverging, with domainMid)', () => {
        const colorScheme = {
            scheme: 'redblue',
            type: 'diverging',
            reason: 'values diverge around a meaningful midpoint',
            domainMid: 0,
        };
        expect(resolvePaletteClass({ colorScheme } as never)).toBe('diverging');
    });
});

describe('resolveDivergingScheme', () => {
    it('is undefined when no colorScheme is present', () => {
        expect(resolveDivergingScheme(undefined)).toBeUndefined();
        expect(resolveDivergingScheme({} as never)).toBeUndefined();
    });

    it('reads the real scheme name for a warm-high (intensity) measure', () => {
        const colorScheme = { scheme: 'blueorange', type: 'diverging', reason: 'measure with no valence, warm end high' };
        expect(resolveDivergingScheme({ colorScheme } as never)).toBe('blueorange');
    });

    it('reads the real scheme name for a warm-low (signed/valence) measure', () => {
        const colorScheme = { scheme: 'redblue', type: 'diverging', reason: 'signed measure, red is the negative side' };
        expect(resolveDivergingScheme({ colorScheme } as never)).toBe('redblue');
    });
});
