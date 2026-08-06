// flint-chart/packages/flint-js/src/devexpress/assemble.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type {
    AssembleOptions, ChannelSemantics, ChartAssemblyInput, ChartEncoding, ChartWarning,
    InstantiateContext, LayoutDeclaration, LayoutResult, MarkCognitiveChannel,
} from '../core/types';
import { applyEncodingOverrides } from '../core/encoding-overrides';
import { decideColorMaps, type ColorDecisionResult } from '../core/color-decisions';
import { computeChannelBudgets, computeLayout } from '../core/compute-layout';
import { filterOverflow } from '../core/filter-overflow';
import { convertTemporalData, resolveChannelSemantics } from '../core/resolve-semantics';
import { computeZeroDecision } from '../core/semantic-types';
import { normalizeStaticSeries } from '../core/static-series';
import { prepareDevExpressPlan } from './artifact';
import {
    DEVEXPRESS_PLAN_SCHEMA, type DevExpressChartPlan, type RenderTarget,
} from './plan';
import { resolvePaletteClass } from './semantics-bridge';
import { assertNoFacets, assertRequiredChannels, dxGetTemplateDef, type DxTemplateDef } from './templates';

export interface AssembleDevExpressOptions {
    target?: RenderTarget;
}

/**
 * Fallback categorical ramp, used when Flint's colour decisions carry no
 * concrete colours (the current `ColorDecision` shape only names a scheme
 * *class* and an optional scheme id — picking the actual swatches is left to
 * each backend). Eight entries: DevExpress palettes cycle after that anyway.
 */
const DEFAULT_CATEGORICAL_COLORS = [
    '#5f8b95', '#ba4d51', '#af8a53', '#955f71', '#859666',
    '#7e688c', '#4f6b8f', '#a6656a',
];

/** Default canvas Flint lays out against when the caller states no base size. */
const DEFAULT_CANVAS = { width: 400, height: 320 };

/**
 * Mark type fed to `computeZeroDecision`.
 *
 * `computeZeroDecision(semanticType, channel, markType, values)` branches on
 * *Vega-Lite mark names* ('bar' | 'area' | 'rect' are length/area marks whose
 * baseline is structural; 'point' | 'circle' are scatter marks that default to
 * data-fit) — see core/semantic-types.ts:454-500. DevExpress templates carry no
 * VL mark (`template: {}`), so we map from the one piece of mark cognition they
 * do declare, `ChartTemplateDef.markCognitiveChannel`. A template that ever does
 * declare a VL mark wins, exactly as in vegalite/assemble.ts:224-225.
 */
const MARK_TYPE_BY_COGNITIVE_CHANNEL: Record<MarkCognitiveChannel, string> = {
    length: 'bar',
    area: 'area',
    color: 'rect',
    position: 'point',
};

function markTypeOf(def: DxTemplateDef): string {
    const mark = (def.template as { mark?: string | { type?: string } } | undefined)?.mark;
    const declared = typeof mark === 'string' ? mark : mark?.type;
    // `|| 'point'` mirrors vegalite/assemble.ts:235 (`templateMarkType || 'point'`).
    return declared || MARK_TYPE_BY_COGNITIVE_CHANNEL[def.markCognitiveChannel] || 'point';
}

interface CoreStageResult {
    channelSemantics: Record<string, ChannelSemantics>;
    layout: LayoutResult;
    table: any[];
    fullTable: any[];
    resolvedEncodings: Record<string, any>;
    encodings: Record<string, ChartEncoding>;
    colorDecisions: ColorDecisionResult;
    warnings: ChartWarning[];
    paletteColors: string[];
}

/**
 * Runs Flint's backend-agnostic stages 1-2 (`docs/adding-a-backend.md` §2)
 * unchanged, in the order `src/vegalite/assemble.ts` establishes. Every call's
 * real signature is the one characterized in `docs/flint-api-notes.md`.
 *
 * Deliberately *not* re-derived here: zero baseline, formats, scale types and
 * colour classes all come out of core; this function only sequences them.
 */
function runCoreStages(
    input: ChartAssemblyInput,
    def: DxTemplateDef,
    chartType: string,
): CoreStageResult {
    const semanticTypes = input.semantic_types ?? {};
    const chartProperties = input.chart_spec.chartProperties;
    const canvasSize = input.chart_spec.baseSize ?? DEFAULT_CANVAS;
    const warnings: ChartWarning[] = [];

    // ── PRE-PHASE ────────────────────────────────────────────────────────
    // normalizeStaticSeries (core/static-series.ts:88) also expands bare-string
    // encoding shorthand, so everything downstream sees real ChartEncoding
    // objects — which is what resolveChannelSemantics requires.
    const rawData = input.data.values ?? [];
    const normalized = normalizeStaticSeries(input.chart_spec.encodings, rawData, semanticTypes);
    const data: any[] = normalized.data;
    // applyEncodingOverrides (core/encoding-overrides.ts:28) is a no-op unless
    // the template declares encodingActions and the host stored a choice.
    const encodings = applyEncodingOverrides(def, normalized.encodings, chartProperties);

    // ── PHASE 0: semantics ───────────────────────────────────────────────
    // convertTemporalData (core/resolve-semantics.ts:242) MUST run first: its
    // output is the 4th argument of resolveChannelSemantics
    // (core/resolve-semantics.ts:310), so temporal format detection sees
    // canonicalized values. Cf. vegalite/assemble.ts:228-232.
    const convertedData = convertTemporalData(data, semanticTypes);
    const channelSemantics = resolveChannelSemantics(
        encodings, data, semanticTypes, convertedData,
    );

    // ── PHASE 0b: finalize the zero baseline ─────────────────────────────
    // resolveChannelSemantics deliberately leaves `zero` unset: the decision
    // needs template mark knowledge that only an assembler has (confirmed
    // empirically — docs/flint-api-notes.md, "zero is absent"). So, exactly as
    // vegalite/assemble.ts:234-245 does, we call computeZeroDecision
    // (core/semantic-types.ts:454) per quantitative position channel and merge
    // the result onto the semantics the templates will read.
    //
    // We merge the plain boolean `ZeroDecision.zero` rather than the whole
    // descriptor: the DevExpress plan's AxisPlan.includeZero is a boolean, and
    // semantics-bridge's resolveIncludeZero is documented (Task 5) to expect
    // this merged-boolean shape as the real one. The cast is needed because
    // core types `ChannelSemantics.zero` as the full ZeroDecision.
    const markType = markTypeOf(def);
    for (const channel of ['x', 'y'] as const) {
        const sem = channelSemantics[channel];
        if (!sem?.field || sem.type !== 'quantitative') continue;
        const numericValues = data
            .map((row) => row?.[sem.field])
            .filter((v: any) => typeof v === 'number' && !Number.isNaN(v));
        const decision = computeZeroDecision(
            sem.semanticAnnotation.semanticType, channel, markType, numericValues,
        );
        (sem as unknown as { zero?: boolean }).zero = decision.zero;
    }

    // A log/symlog scale only reads correctly on a continuous *position* mark.
    // On length/area marks the baseline carries the magnitude and log destroys
    // it, so strip any core-recommended log scale — vegalite/assemble.ts:296-305.
    if (def.markCognitiveChannel !== 'position') {
        for (const channel of ['x', 'y'] as const) {
            const sem = channelSemantics[channel];
            if (sem?.scaleType === 'log' || sem?.scaleType === 'symlog') {
                sem.scaleType = undefined;
            }
        }
    }

    // ── STEP 0a: template layout declaration ─────────────────────────────
    const declaration: LayoutDeclaration = def.declareLayoutMode
        ? def.declareLayoutMode(channelSemantics, data, chartProperties)
        : {};
    const effectiveOptions: AssembleOptions = {
        ...(input.options ?? {}),
        ...(declaration.paramOverrides ?? {}),
    };

    // ── STEP 0c: budgets → overflow filtering ────────────────────────────
    // Fixed order (docs/flint-api-notes.md): computeChannelBudgets
    // (core/compute-layout.ts:1310) → filterOverflow (core/filter-overflow.ts:54)
    // → computeLayout (core/compute-layout.ts:264). Faceting is rejected before
    // we get here, so budgets.facetGrid is always undefined.
    const budgets = computeChannelBudgets(
        channelSemantics, declaration, convertedData, canvasSize, effectiveOptions,
    );
    const overflow = filterOverflow(
        channelSemantics, declaration, encodings, convertedData,
        budgets, new Set<string>([markType]),
    );
    // The result field is `filteredData`, NOT `data` — see the note in
    // docs/flint-api-notes.md under filterOverflow.
    const table: any[] = overflow.filteredData;
    warnings.push(...overflow.warnings);

    // ── PHASE 1: layout ──────────────────────────────────────────────────
    // Run for orchestration-contract compliance (core owns overflow/step
    // sizing, and templates may consult the result). The LayoutResult reaches
    // the InstantiateContext and stops there: a DevExpress plan carries no
    // pixel geometry, the control lays itself out.
    const layout = computeLayout(
        channelSemantics, declaration, table, canvasSize, effectiveOptions, budgets.facetGrid,
    );
    layout.truncations = overflow.truncations;

    const colorDecisions = decideColorMaps({
        chartType, encodings, channelSemantics, table, background: 'light',
    });

    return {
        channelSemantics,
        layout,
        table,
        fullTable: data,
        // DevExpress templates read fields off ChannelSemantics/encodings
        // directly; there is no backend-specific encoding IR to build (the VL
        // backend's buildVLEncodings step has no DevExpress analogue), so the
        // normalized encodings stand in.
        resolvedEncodings: { ...encodings },
        encodings,
        colorDecisions,
        warnings,
        paletteColors: resolvePaletteColors(colorDecisions),
    };
}

/**
 * Concrete swatches for the plan's palette. Core's ColorDecision names a
 * scheme class (and sometimes an id) but not colours, so this is a defensive
 * read: honour explicit colours if a core version ever supplies them,
 * otherwise fall back to the module ramp.
 */
function resolvePaletteColors(decisions: ColorDecisionResult | undefined): string[] {
    for (const decision of [decisions?.color, decisions?.group, decisions?.fill, decisions?.stroke]) {
        const colors = (decision as { colors?: unknown } | undefined)?.colors;
        if (Array.isArray(colors) && colors.length > 0 && colors.every((c) => typeof c === 'string')) {
            return colors as string[];
        }
    }
    return [...DEFAULT_CATEGORICAL_COLORS];
}

export function assembleDevExpressPlan(
    input: ChartAssemblyInput,
    options: AssembleDevExpressOptions = {},
): DevExpressChartPlan {
    const target = options.target ?? 'devextreme';
    const { chartType, encodings } = input.chart_spec;

    // Reject before doing any work: faceting is unsupported, not downgraded.
    assertNoFacets(encodings);

    const def = dxGetTemplateDef(chartType, target);
    if (!def) {
        throw new Error(
            `Chart type "${chartType}" is not supported by the DevExpress ${target} target.`,
        );
    }
    assertRequiredChannels(def, encodings);

    // Stages 1-2: run core unchanged. See docs/flint-api-notes.md for exact signatures.
    const pipeline = runCoreStages(input, def, chartType);

    const context: InstantiateContext = {
        channelSemantics: pipeline.channelSemantics,
        layout: pipeline.layout,
        table: pipeline.table,
        fullTable: pipeline.fullTable,
        resolvedEncodings: pipeline.resolvedEncodings,
        encodings: pipeline.encodings,
        chartProperties: input.chart_spec.chartProperties,
        canvasSize: input.chart_spec.baseSize ?? DEFAULT_CANVAS,
        semanticTypes: input.semantic_types ?? {},
        chartType,
        assembleOptions: input.options,
        colorDecisions: pipeline.colorDecisions,
    };

    const draft: Partial<DevExpressChartPlan> = {
        schema: DEVEXPRESS_PLAN_SCHEMA,
        chartType,
        target,
        titles: [],
        warnings: pipeline.warnings,
        unsupported: [],
    };

    // Stage 3: the template fills family, data, series, diagram, legend.
    def.instantiate(draft, context);
    def.postProcess?.(draft, context);

    draft.palette ??= {
        class: resolvePaletteClass(context.channelSemantics.color),
        colors: pipeline.paletteColors,
    };

    // Validate our own output: the assembler must never emit a plan the
    // renderer would reject.
    return prepareDevExpressPlan(draft);
}
