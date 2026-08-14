// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  assembleVegaLite,
  assembleECharts,
  assembleChartjs,
  type ChartAssemblyInput,
  type ChartEncoding,
  type ChartTemplateDef,
  type ChartWarning,
  vlGetTemplateDef,
  ecGetTemplateDef,
  cjsGetTemplateDef,
  dxGetTemplateDef,
} from 'flint-chart';
import {
  resolveDataSource,
  type DataSourceOptions,
} from './data-source.js';
import type { RenderBackend } from './types.js';

/** Maximum number of inline data rows accepted (DoS guard). */
export const MAX_DATA_ROWS = 100_000;

/** Maximum canvas dimension in pixels the host will honor (DoS guard). */
export const MAX_CANVAS_DIM = 4000;

const ASSEMBLERS: Record<
  RenderBackend,
  (input: ChartAssemblyInput) => any
> = {
  vegalite: assembleVegaLite,
  echarts: assembleECharts,
  chartjs: assembleChartjs,
};

/**
 * Targets `prepareInput`/`validateChartSpec` can validate an encodings object
 * against. A superset of {@link RenderBackend}: the DevExpress target has no
 * render pipeline of its own (it produces a `flint.devexpress.chart/v1` plan,
 * not a backend-native spec), but it still needs the same channel-allowlist
 * check every render/compile backend gets, so it shares this lookup table
 * rather than duplicating the check.
 */
export type PrepareInputTarget = RenderBackend | 'devextreme';

const TEMPLATE_LOOKUP: Record<PrepareInputTarget, (chartType: string) => ChartTemplateDef | undefined> = {
  vegalite: vlGetTemplateDef,
  echarts: ecGetTemplateDef,
  chartjs: cjsGetTemplateDef,
  devextreme: (chartType: string) => dxGetTemplateDef(chartType, 'devextreme'),
};

export interface AssembleResult {
  /** The backend-native spec (still carrying Flint's private `_`-keys). */
  spec: any;
  /** Warnings emitted by the assembler. */
  warnings: ChartWarning[];
  /** Computed subplot width from the stretch model, if present. */
  width?: number;
  /** Computed subplot height from the stretch model, if present. */
  height?: number;
}

/**
 * Validate caller-supplied input before it reaches an assembler. Inline rows
 * pass through directly. Local `data.url` references are read unless
 * `disableFileReference` is set; remote URLs stay blocked.
 */
export function validateInput(
  input: ChartAssemblyInput,
  options: DataSourceOptions = {},
): void {
  prepareInput(input, options);
}

/** Resolve data references and validate caller-supplied input. */
export function prepareInput(
  input: ChartAssemblyInput,
  options: DataSourceOptions = {},
  backend?: PrepareInputTarget,
): ChartAssemblyInput {
  if (input == null || typeof input !== 'object') {
    throw new Error('input must be a ChartAssemblyInput object');
  }
  const resolvedInput = resolveDataSource(input, {
    ...options,
    maxDataRows: MAX_DATA_ROWS,
  });
  const resolvedData: any = (resolvedInput as any).data;
  if (resolvedData == null || typeof resolvedData !== 'object') {
    throw new Error('input.data is required (provide { values: [...] })');
  }
  if (!Array.isArray(resolvedData.values)) {
    throw new Error(
      'input.data must provide inline values or a readable local data.url',
    );
  }
  if (resolvedData.values.length > MAX_DATA_ROWS) {
    throw new Error(
      `input.data.values has ${resolvedData.values.length} rows, exceeding the limit of ${MAX_DATA_ROWS}`,
    );
  }
  const cs: any = (resolvedInput as any).chart_spec;
  if (cs == null || typeof cs !== 'object' || typeof cs.chartType !== 'string') {
    throw new Error('input.chart_spec.chartType is required');
  }
  if (resolvedData.values.length === 0) {
    throw new Error('input.data.values must contain at least one row');
  }
  validateChartSpec(cs, resolvedData.values, backend);
  for (const field of ['baseSize', 'canvasSize'] as const) {
    const size = cs[field];
    if (size) {
      if (
        (typeof size.width === 'number' && size.width > MAX_CANVAS_DIM) ||
        (typeof size.height === 'number' && size.height > MAX_CANVAS_DIM)
      ) {
        throw new Error(
          `chart_spec.${field} exceeds the maximum dimension of ${MAX_CANVAS_DIM}px`,
        );
      }
    }
  }
  return resolvedInput;
}

function validateChartSpec(cs: any, rows: Record<string, unknown>[], backend?: PrepareInputTarget): void {
  const encodings = cs.encodings;
  if (encodings == null || typeof encodings !== 'object' || Array.isArray(encodings)) {
    throw new Error('input.chart_spec.encodings must be a channel-to-encoding object');
  }

  const entries = Object.entries(encodings);
  if (entries.length === 0) {
    throw new Error('input.chart_spec.encodings must bind at least one channel');
  }

  const template = backend ? TEMPLATE_LOOKUP[backend]?.(cs.chartType) : undefined;
  if (backend && !template) return;

  if (template) {
    const allowed = new Set(template.channels ?? []);
    for (const [channel] of entries) {
      if (!allowed.has(channel)) {
        throw new Error(
          `chart_spec.encodings.${channel} is not supported by ${cs.chartType} for ${backend}`,
        );
      }
    }

    for (const channel of requiredChannels(template)) {
      if (!hasEncodingBinding(encodings[channel])) {
        throw new Error(`chart_spec.encodings.${channel} is required for ${cs.chartType}`);
      }
    }
  }

  const dataFields = new Set(rows.flatMap((row) => Object.keys(row)));
  for (const [channel, encoding] of entries) {
    for (const field of encodingFields(encoding)) {
      if (!dataFields.has(field)) {
        throw new Error(`chart_spec.encodings.${channel}.field "${field}" does not exist in data.values`);
      }
    }
  }
}

function requiredChannels(template: ChartTemplateDef): string[] {
  const channels = template.channels ?? [];
  if (channels.includes('x') && channels.includes('y')) return ['x', 'y'];
  if (template.chart === 'KPI Card') return ['metric', 'value'];
  return [];
}

function hasEncodingBinding(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasEncodingBinding);
  if (value && typeof value === 'object') {
    const encoding = value as ChartEncoding;
    return (
      (typeof encoding.field === 'string' && encoding.field.trim().length > 0) ||
      encoding.aggregate === 'count'
    );
  }
  return false;
}

function encodingFields(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(encodingFields);
  if (value && typeof value === 'object') {
    const field = (value as ChartEncoding).field;
    return typeof field === 'string' && field.trim() ? [field] : [];
  }
  return [];
}

/**
 * Assemble a Flint spec for one backend and split out Flint's private metadata
 * (`_warnings`, `_width`, `_height`). The returned `spec` is left untouched so
 * callers can choose to expose or strip the private keys.
 */
export function assembleForBackend(
  backend: RenderBackend,
  input: ChartAssemblyInput,
  options: DataSourceOptions = {},
): AssembleResult {
  const assemble = ASSEMBLERS[backend];
  if (!assemble) {
    throw new Error(`unknown backend: ${backend}`);
  }
  const resolvedInput = prepareInput(input, options, backend);
  const spec = assemble(resolvedInput);
  const warnings: ChartWarning[] = Array.isArray(spec?._warnings)
    ? spec._warnings
    : [];
  const width = typeof spec?._width === 'number' ? spec._width : undefined;
  const height = typeof spec?._height === 'number' ? spec._height : undefined;
  return { spec, warnings, width, height };
}

/**
 * Remove Flint's private `_`-prefixed annotation keys from a top-level spec
 * object so it is render-ready and safe to surface to callers.
 */
export function stripPrivateKeys<T extends Record<string, any>>(spec: T): T {
  for (const key of Object.keys(spec)) {
    if (key.startsWith('_')) {
      delete (spec as Record<string, any>)[key];
    }
  }
  return spec;
}
