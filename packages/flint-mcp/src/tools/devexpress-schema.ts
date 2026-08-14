// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { z } from 'zod';
import { dxSupportedChartTypes } from 'flint-chart';
import { makeDataSchema } from './schemas.js';

/**
 * Chart types the DevExpress `devextreme` (dxChart / dxPieChart) target
 * actually supports, read from the template registry at module load. Building
 * the tool's `chartType` enum from this — rather than accepting any string and
 * checking it inside the assembler — means an unsupported type (e.g. a
 * `xtracharts`-only type, or a rejected type like "Violin Plot") fails MCP
 * argument validation before `assembleDevExpressPlan` ever runs.
 */
const DX_CHART_TYPES = dxSupportedChartTypes('devextreme');

if (DX_CHART_TYPES.length === 0) {
  throw new Error('No DevExpress chart types are registered for the devextreme target.');
}

export const dxChartTypeEnum = z
  .enum(DX_CHART_TYPES as [string, ...string[]])
  .describe(
    'Chart template name. Restricted to the chart types the DevExpress devextreme ' +
      `target actually supports: ${DX_CHART_TYPES.join(', ')}.`,
  );

/** Faceting channels the DevExpress backend rejects outright (no facet grid). */
const DX_FACET_CHANNELS = ['column', 'row'] as const;

export const dxEncodingsSchema = z
  .record(z.string(), z.any())
  .refine(
    (encodings) => !DX_FACET_CHANNELS.some((channel) => encodings[channel] != null),
    {
      message:
        'The DevExpress backend does not support faceting (no dxChart/XtraCharts facet ' +
        'grid). Do not use column or row encodings — express grouping with the color ' +
        'channel instead.',
    },
  )
  .describe(
    'Channel → encoding map, e.g. { x: { field: "region" }, y: { field: "revenue" } }. ' +
      'column and row are NOT ALLOWED here: the DevExpress backend has no facet grid, ' +
      'so faceted requests are rejected before compilation.',
  );

export const dxChartSpecSchema = z
  .object({
    chartType: dxChartTypeEnum,
    encodings: dxEncodingsSchema,
    baseSize: z
      .object({ width: z.number(), height: z.number() })
      .optional()
      .describe(
        'Target canvas size in px (default 400×320), used only to drive Flint\'s ' +
          'overflow/budget decisions. The DevExpress control performs its own layout; ' +
          'no pixel geometry from this reaches the plan.',
      ),
    canvasSize: z
      .object({ width: z.number(), height: z.number() })
      .optional()
      .describe('Optional hard ceiling in px for the same overflow/budget computation.'),
    chartProperties: z
      .record(z.string(), z.any())
      .optional()
      .describe('Template-specific properties (e.g. line interpolation, stacking mode).'),
  })
  .describe('What to draw, constrained to what the DevExpress devextreme target supports.');

/**
 * The {@link ChartAssemblyInput} shape, flattened for the MCP tool parameter
 * list, with `chart_spec` swapped for the DevExpress-constrained schema above.
 */
export function buildDevExpressAssemblyInputShape(disableFileReference = false) {
  return {
    data: makeDataSchema(disableFileReference),
    semantic_types: z
      .record(z.string(), z.any())
      .optional()
      .describe('Field name → semantic type, e.g. { revenue: "Quantity", country: "Country" }.'),
    chart_spec: dxChartSpecSchema,
    options: z
      .record(z.string(), z.any())
      .optional()
      .describe('Assembler options (e.g. overflow/budget tuning).'),
    field_display_names: z
      .record(z.string(), z.string())
      .optional()
      .describe('Field name → display label, used for axis/series titles.'),
  };
}
