// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChartTemplateDef } from '../../core/types';
import type { RenderTarget } from '../plan';

/** Channels a template cannot compile without. Read by assertRequiredChannels. */
export interface DxTemplateDef extends ChartTemplateDef {
    requiredChannels: string[];
    family: 'Cartesian' | 'Circular';
    targets: RenderTarget[];
}

/**
 * Populated by Tasks 7-10 via registerTemplate(), called from each template
 * module's own top-level code as a side effect of the `import './bar'` (etc.)
 * lines at the bottom of this file.
 *
 * Declared with `var` and lazily initialized rather than `const registry = []`:
 * template modules import `registerTemplate` back from this module, so the
 * dependency graph is circular (index -> bar -> index). Per ES module
 * evaluation order, all of a module's static imports are evaluated *before*
 * its own top-level code runs — so by the time bar.ts's top-level
 * `registerTemplate(barChart)` call executes, this file's own `const registry
 * = []` line has not run yet, and `registry` would still be in its temporal
 * dead zone. `var` bindings are initialized to `undefined` at environment
 * creation, before any module's top-level code executes, which sidesteps the
 * TDZ hazard entirely; the `??=` lazily creates the array on first use.
 */
var registry: DxTemplateDef[] | undefined;

export function registerTemplate(def: DxTemplateDef): void {
    registry ??= [];
    if (registry.some((d) => d.chart === def.chart)) {
        throw new Error(`Template already registered: ${def.chart}`);
    }
    registry.push(def);
}

export function dxGetTemplateDef(chartType: string, target: RenderTarget): DxTemplateDef | undefined {
    return registry?.find((d) => d.chart === chartType && d.targets.includes(target));
}

export function dxGetTemplateChannels(chartType: string, target: RenderTarget): string[] {
    return dxGetTemplateDef(chartType, target)?.channels ?? [];
}

export function dxSupportedChartTypes(target: RenderTarget): string[] {
    return (registry ?? []).filter((d) => d.targets.includes(target)).map((d) => d.chart);
}

const FACET_CHANNELS = ['column', 'row'] as const;

/**
 * Faceting is rejected outright rather than downgraded. XtraCharts has no facet
 * grid, and silently rerouting a facet field to colour would misrepresent the data.
 */
export function assertNoFacets(encodings: Record<string, unknown>): void {
    const present = FACET_CHANNELS.filter((channel) => encodings[channel] != null);
    if (present.length > 0) {
        throw new Error(
            `Faceting is not supported by the DevExpress backend (found: ${present.join(', ')}). ` +
            'Remove the column/row encoding, or express the grouping with the color channel.',
        );
    }
}

export function assertRequiredChannels(
    def: DxTemplateDef,
    encodings: Record<string, unknown>,
): void {
    for (const channel of def.requiredChannels) {
        if (encodings[channel] == null) {
            throw new Error(`${def.chart} requires channel ${channel}.`);
        }
    }
}

// Registration side effects. Order determines dxSupportedChartTypes() order.
import './bar';
import './line';
import './area';
import './point';
import './financial';
import './circular';
