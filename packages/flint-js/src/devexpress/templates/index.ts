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

/** Populated by Tasks 7-10 via registerTemplate(). */
const registry: DxTemplateDef[] = [];

export function registerTemplate(def: DxTemplateDef): void {
    if (registry.some((d) => d.chart === def.chart)) {
        throw new Error(`Template already registered: ${def.chart}`);
    }
    registry.push(def);
}

export function dxGetTemplateDef(chartType: string, target: RenderTarget): DxTemplateDef | undefined {
    return registry.find((d) => d.chart === chartType && d.targets.includes(target));
}

export function dxGetTemplateChannels(chartType: string, target: RenderTarget): string[] {
    return dxGetTemplateDef(chartType, target)?.channels ?? [];
}

export function dxSupportedChartTypes(target: RenderTarget): string[] {
    return registry.filter((d) => d.targets.includes(target)).map((d) => d.chart);
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
// import './bar';
// import './line';
// import './area';
// import './point';
// import './financial';
// import './circular';
