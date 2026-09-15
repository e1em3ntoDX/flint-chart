// flint-chart/packages/flint-js/src/devexpress/assemble.ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type {
    AssembleOptions, ChannelSemantics, ChartAssemblyInput, ChartEncoding, ChartWarning,
    InstantiateContext, LayoutDeclaration, LayoutResult, MarkCognitiveChannel,
} from '../core/types';
import { resolveThemeSpec, type ThemeSpec } from '../core/theme';
import { applyAggregation } from '../core/aggregate';
import { applyEncodingOverrides } from '../core/encoding-overrides';
import { decideColorMaps, type ColorDecision, type ColorDecisionResult } from '../core/color-decisions';
import { computeChannelBudgets, computeLayout } from '../core/compute-layout';
import { filterOverflow } from '../core/filter-overflow';
import { convertTemporalData, resolveChannelSemantics } from '../core/resolve-semantics';
import { computeZeroDecision } from '../core/semantic-types';
import { normalizeStaticSeries } from '../core/static-series';
import { prepareDevExpressPlan } from './artifact';
import { pickDevExpressPalette } from './colormap';
import {
    DEVEXPRESS_PLAN_SCHEMA, type DevExpressChartPlan, type RenderTarget, type TypographyPlan,
} from './plan';
import { resolveDivergingScheme, resolvePaletteClass } from './semantics-bridge';
import { assertNoFacets, assertRequiredChannels, dxGetTemplateDef, type DxTemplateDef } from './templates';
import { resolveAxisRoles } from './templates/bar';
import { resolveTypeRole } from './typography';

export interface AssembleDevExpressOptions {
    target?: RenderTarget;
}

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
 * declare a VL mark wins, exactly as in vegalite/assemble.ts:277-278.
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
    // `|| 'point'` mirrors vegalite/assemble.ts:288 (`templateMarkType || 'point'`).
    return declared || MARK_TYPE_BY_COGNITIVE_CHANNEL[def.markCognitiveChannel] || 'point';
}

/**
 * Merge core's ZeroDecision onto each quantitative position channel, then apply
 * the caller's explicit `includeZero_x` / `includeZero_y` overrides — the
 * PHASE 0 override contract docs/adding-a-backend.md §2 requires, mirroring
 * vegalite/assemble.ts:287-318.
 *
 * `mark` carries both facts the decision needs, together so they cannot drift
 * apart: `type` is the Vega-Lite mark name computeZeroDecision branches on, and
 * `cognitiveChannel` is what decides whether the baseline is the reader's
 * choice at all.
 *
 * Exported so the merged shape can be asserted directly: the whole descriptor
 * has to survive, because core reads it as an object (`zero?.zero`).
 */
export function applyZeroDecisions(
    channelSemantics: Record<string, ChannelSemantics>,
    mark: { type: string; cognitiveChannel: MarkCognitiveChannel },
    data: Record<string, unknown>[],
    chartProperties?: Record<string, unknown>,
): void {
    for (const channel of ['x', 'y'] as const) {
        const sem = channelSemantics[channel];
        if (!sem?.field || sem.type !== 'quantitative') continue;
        const numericValues = data
            .map((row) => row?.[sem.field])
            .filter((v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v));
        sem.zero = computeZeroDecision(
            sem.semanticAnnotation.semanticType, channel, mark.type, numericValues,
        );
        // The baseline is only the reader's to choose on a position-cognitive
        // mark, so the override is gated exactly as vegalite/assemble.ts:300-318
        // gates it. On a length/area mark the baseline is structural, not a
        // preference — a bar's height IS its value measured from zero, and core
        // states the reason outright at core/semantic-types.ts:469 ("a bar's
        // length is meaningless without zero. Not debatable.") by returning
        // forced: true there. Honouring the override on such a mark would leave
        // bars whose heights are no longer proportional to their values.
        if (mark.cognitiveChannel !== 'position') continue;
        // An explicit caller override wins, but only over the boolean — the
        // rest of the descriptor (padding, class) stays core's.
        const override = chartProperties?.[`includeZero_${channel}`];
        if (typeof override === 'boolean') {
            sem.zero = { ...sem.zero, zero: override };
        }
    }
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
 * real signature is the one characterized in `docs/devexpress-core-api-notes.md`.
 *
 * Deliberately *not* re-derived here: zero baseline, formats, scale types and
 * colour classes all come out of core; this function only sequences them.
 */
function runCoreStages(
    input: ChartAssemblyInput,
    def: DxTemplateDef,
    chartType: string,
    theme: ThemeSpec | undefined,
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
    let data: any[] = normalized.data;
    // applyEncodingOverrides (core/encoding-overrides.ts:28) is a no-op unless
    // the template declares encodingActions and the host stored a choice.
    const encodings = applyEncodingOverrides(def, normalized.encodings, chartProperties);

    // Optional aggregation transform: when an encoding sets `aggregate`, collapse
    // the rows here (grouping by the dimension channels) so the derived
    // `${field}_${op}` / `_count` columns the assemblers reference actually
    // exist. No-op when no encoding requests it or the data is pre-aggregated.
    // Same relative position as vegalite/assemble.ts (right after encoding
    // overrides/normalization, before convertTemporalData + resolveChannelSemantics);
    // DevExpress templates have no `normalizeEncodings` step, so this runs
    // directly after applyEncodingOverrides.
    data = applyAggregation(encodings, data);

    // Axis dtype override (`xAxisType` / `yAxisType`, docs/adding-a-backend.md
    // §2 PHASE 0): a date-like field can legitimately read either as a
    // continuous time scale or as discrete bands, and the host may force the
    // choice. Written onto the *encoding* rather than the resolved semantics,
    // because resolveChannelSemantics treats an explicit `encoding.type` as
    // authoritative (core/resolve-semantics.ts:375) — so the whole of PHASE 0
    // (format, temporalFormat, ordinalSortOrder, scaleType, zero) is derived
    // under the forced type instead of being left behind at the old one.
    // Same placement and the same two accepted values as
    // vegalite/assemble.ts:223-237, whose control declares exactly
    // 'temporal' | 'nominal' (vegalite/templates/index.ts:195-211).
    for (const channel of ['x', 'y'] as const) {
        const choice = chartProperties?.[`${channel}AxisType`];
        if ((choice === 'temporal' || choice === 'nominal') && encodings[channel]?.field) {
            encodings[channel] = { ...encodings[channel], type: choice };
        }
    }

    // ── PHASE 0: semantics ───────────────────────────────────────────────
    // convertTemporalData (core/resolve-semantics.ts:259) MUST run first: its
    // output is the 4th argument of resolveChannelSemantics
    // (core/resolve-semantics.ts:332), so temporal format detection sees
    // canonicalized values. Cf. vegalite/assemble.ts:280-285.
    const convertedData = convertTemporalData(data, semanticTypes);
    const channelSemantics = resolveChannelSemantics(
        encodings, data, semanticTypes, convertedData,
    );

    // ── PHASE 0b: finalize the zero baseline ─────────────────────────────
    // resolveChannelSemantics deliberately leaves `zero` unset: the decision
    // needs template mark knowledge that only an assembler has (confirmed
    // empirically — docs/devexpress-core-api-notes.md, "zero is absent"). So,
    // exactly as vegalite/assemble.ts:287-317 does, we call computeZeroDecision
    // (core/semantic-types.ts:454) per quantitative position channel and merge
    // the WHOLE ZeroDecision onto the semantics the templates will read.
    //
    // The whole descriptor, not just its `zero` boolean: core types
    // ChannelSemantics.zero as ZeroDecision and reads it as an object
    // (`zero?.zero`). A bare boolean makes `.zero` undefined, and
    // domainPadFraction / zeroClass / uncertain are lost outright. The reader
    // that matters here is computeLayout (core/compute-layout.ts:588, 592) —
    // computeChannelBudgets and filterOverflow never look at `zero`, and core's
    // other pair of reads sits in computeFacetGrid (:1753, 1757), which this
    // backend never reaches because faceting is rejected upfront.
    const markType = markTypeOf(def);
    applyZeroDecisions(
        channelSemantics,
        { type: markType, cognitiveChannel: def.markCognitiveChannel },
        data,
        chartProperties,
    );

    // Log-scale override (`logScale_x` / `logScale_y`, docs/adding-a-backend.md
    // §2 PHASE 0): core recommends log conservatively in resolveScaleType
    // (core/field-semantics.ts:533 — additive open-domain measure, >= 10 values
    // spanning >= 6 orders of magnitude); this is the host's per-axis on/off
    // override of that recommendation, mirroring vegalite/assemble.ts:320-348.
    // `false` clears the recommendation rather than writing 'linear': core only
    // ever branches on log/symlog (compute-layout.ts:479-480, 1641-1642,
    // 1901-1902), and `undefined` is the only "no log scale" value the rest of
    // the pipeline produces. Deliberately placed BEFORE the non-position strip
    // below, which keeps the last word on length/area marks.
    for (const channel of ['x', 'y'] as const) {
        const sem = channelSemantics[channel];
        if (!sem?.field || sem.type !== 'quantitative') continue;
        const logOverride = chartProperties?.[`logScale_${channel}`];
        if (typeof logOverride !== 'boolean') continue;
        sem.scaleType = logOverride
            // log(0) is undefined, so zeros in the data demand symlog.
            ? (data.some((row) => row?.[sem.field] === 0) ? 'symlog' : 'log')
            : undefined;
    }

    // A log/symlog scale only reads correctly on a continuous *position* mark.
    // On length/area marks the baseline carries the magnitude and log destroys
    // it, so strip any core-recommended log scale — vegalite/assemble.ts:349-358.
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
    // Fixed order (docs/devexpress-core-api-notes.md): computeChannelBudgets
    // (core/compute-layout.ts:1431) → filterOverflow (core/filter-overflow.ts:54)
    // → computeLayout (core/compute-layout.ts:284). Faceting is rejected before
    // we get here, so budgets.facetGrid is always undefined.
    const budgets = computeChannelBudgets(
        channelSemantics, declaration, convertedData, canvasSize, effectiveOptions,
    );
    const overflow = filterOverflow(
        channelSemantics, declaration, encodings, convertedData,
        budgets, new Set<string>([markType]),
    );
    // The result field is `filteredData`, NOT `data` — see the note in
    // docs/devexpress-core-api-notes.md under filterOverflow.
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
        paletteColors: resolvePaletteColors(colorDecisions, channelSemantics, theme),
    };
}

/**
 * Concrete swatches for the plan's palette. Prefers a resolved theme's own
 * colors when present and large enough for the chart's real category count;
 * otherwise delegates to `colormap.ts`, which knows how to turn core's
 * abstract scheme type/id/categoryCount into real DevExpress-appropriate hex
 * values (including the polarity-aware diverging pick).
 */
function resolvePaletteColors(
    decisions: ColorDecisionResult | undefined,
    channelSemantics: Record<string, ChannelSemantics>,
    theme: ThemeSpec | undefined,
): string[] {
    const decision = primaryColorDecision(decisions);
    const channelName = decision?.channel;

    const themeColors = themePaletteColors(theme, decision?.schemeType, decision?.categoryCount);
    if (themeColors) return [...themeColors];

    // Only override when the decision is diverging AND the caller didn't already
    // name an explicit scheme — an explicit schemeId (set only when a caller asks
    // for one directly) must keep winning over our own auto-derived polarity pick.
    if (decision && decision.schemeType === 'diverging' && !decision.schemeId && channelName) {
        const scheme = resolveDivergingScheme(channelSemantics[channelName]);
        if (scheme) return pickDevExpressPalette({ ...decision, schemeId: scheme });
    }
    return pickDevExpressPalette(decision);
}

/** Picks whichever channel actually got a color decision (color > group > fill > stroke). */
function primaryColorDecision(decisions: ColorDecisionResult | undefined): ColorDecision | undefined {
    return decisions?.color ?? decisions?.group ?? decisions?.fill ?? decisions?.stroke;
}

/** Turns the caller's optional title/subtitle strings into `plan.titles` entries. */
function buildTitles(title: string | undefined, subtitle: string | undefined): DevExpressChartPlan['titles'] {
    const titles: DevExpressChartPlan['titles'] = [];
    const trimmedTitle = title?.trim();
    const trimmedSubtitle = subtitle?.trim();
    if (trimmedTitle) titles.push({ text: trimmedTitle, role: 'chart' });
    if (trimmedSubtitle) titles.push({ text: trimmedSubtitle, role: 'subtitle' });
    return titles;
}

/**
 * Overrides field-derived axis titles and single-series names with a
 * caller-supplied display name, when one was given for that field — falling
 * back to whatever humanizeFieldName() already produced otherwise. Split
 * series names (raw category values) are never touched here: field_display_names
 * keys on a real field name, and a category value only coincidentally
 * matching one would be a wrong override, not a display-name request.
 */
function applyFieldDisplayNames(
    draft: Partial<DevExpressChartPlan>,
    context: InstantiateContext,
    fieldDisplayNames: Record<string, string> | undefined,
): void {
    if (!fieldDisplayNames) return;
    const overrideFor = (field: string | undefined): string | undefined =>
        field ? fieldDisplayNames[field] : undefined;
    const fieldOfChannel = (channel: string): string | undefined =>
        context.channelSemantics[channel]?.field ?? context.encodings[channel]?.field;

    if (draft.diagram) {
        const xOverride = overrideFor(fieldOfChannel('x'));
        const yOverride = overrideFor(fieldOfChannel('y'));
        if (xOverride) draft.diagram.axisX.title = xOverride;
        if (yOverride) draft.diagram.axisY.title = yOverride;
    }
    if (draft.family === 'Circular') {
        const sizeOverride = overrideFor(fieldOfChannel('size'));
        if (sizeOverride && draft.series?.[0]) draft.series[0].name = sizeOverride;
    } else if (draft.series && draft.series.length === 1 && !fieldOfChannel('y2')) {
        // baseSeries (templates/bar.ts) names the series after the resolved
        // VALUE channel, which resolveAxisRoles may place on 'x' rather than
        // 'y' (e.g. a bar chart with x:measure, y:category). Reading the
        // override off literal 'y' would silently name the series after the
        // wrong field whenever the axes are reversed.
        const { valueAxis } = resolveAxisRoles(context);
        const valueOverride = overrideFor(fieldOfChannel(valueAxis));
        if (valueOverride) draft.series[0].name = valueOverride;
    }
}

/** Pulls a resolved theme's colour set into the same shape pickDevExpressPalette already reads. */
function themePaletteColors(
    theme: ThemeSpec | undefined,
    schemeType: string | undefined,
    categoryCount: number | undefined,
): string[] | undefined {
    const series = theme?.ink?.series;
    if (!series) return undefined;
    if (schemeType === 'sequential' && series.sequential?.stops?.length) return series.sequential.stops;
    if (schemeType === 'diverging' && series.diverging?.stops?.length) return series.diverging.stops;
    if (!series.categorical?.length) return undefined;
    // A theme's fixed categorical set must still keep every category visually
    // distinct — if it's too small for this chart's real category count, fall
    // through to the backend's own capacity-aware picker (colormap.ts's
    // byCapacity/byDescendingCapacity logic) instead of letting series
    // silently share a color.
    if (schemeType === 'categorical' && series.categorical.length < (categoryCount ?? 0)) return undefined;
    return series.categorical;
}

/**
 * Maps a resolved theme's font roles onto the plan's TypographyPlan shape.
 * Always returns a full TypographyPlan (every key present, possibly
 * `undefined`) — never `undefined` itself — mirroring `titles`/`warnings`/
 * `unsupported`'s "always present, possibly empty" convention.
 */
function themeTypography(theme: ThemeSpec | undefined): TypographyPlan {
    const type = theme?.type;
    return {
        title: resolveTypeRole(type?.headline),
        subtitle: resolveTypeRole(type?.deck),
        axisLabel: resolveTypeRole(type?.axisLabel),
        axisTitle: resolveTypeRole(type?.axisTitle),
        legend: resolveTypeRole(type?.keyLabel),
        dataLabel: resolveTypeRole(type?.valueLabel),
    };
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

    // theme_spec sits beside chart_spec on ChartAssemblyInput, not inside it —
    // confirmed directly against the real merged 0.5 type during planning.
    // Resolved before runCoreStages, which needs it for the palette pick.
    const theme = resolveThemeSpec(input.theme_spec);
    // Stages 1-2: run core unchanged. See docs/devexpress-core-api-notes.md for exact signatures.
    const pipeline = runCoreStages(input, def, chartType, theme);

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
        titles: buildTitles(input.chart_spec.title, input.chart_spec.subtitle),
        typography: themeTypography(theme),
        warnings: pipeline.warnings,
        unsupported: [],
    };

    // Stage 3: the template fills family, data, series, diagram, legend.
    def.instantiate(draft, context);
    def.postProcess?.(draft, context);

    // Pushed after the template runs (and after ??=-guarded reassignment risk),
    // so a future template that does `draft.unsupported = []` instead of `??= []`
    // can no longer silently clobber this note.
    if (theme) {
        const themeSpecInput = input.theme_spec;
        const themeName = typeof themeSpecInput === 'string' ? themeSpecInput : (theme.id ?? theme.label ?? 'custom theme');
        draft.unsupported!.push({
            feature: 'theme_spec',
            action: 'downgraded',
            detail: `Theme "${themeName}" requested — its color palette and typography (fonts) were ` +
                'applied. Font style (italic) and text-case transforms cannot be applied. Mark ' +
                'geometry and furniture (e.g. corner radius, dash styles, chart borders) are not ' +
                'supported by the DevExpress backend.',
        });
    }

    applyFieldDisplayNames(draft, context, input.field_display_names);

    draft.palette ??= {
        class: resolvePaletteClass(context.channelSemantics.color),
        colors: pipeline.paletteColors,
    };

    // Validate our own output: the assembler must never emit a plan the
    // renderer would reject.
    return prepareDevExpressPlan(draft);
}
