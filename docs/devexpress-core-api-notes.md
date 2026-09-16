# Flint core API notes for the DevExpress backend (characterized, not assumed)

Every shape in this document was captured by running the real functions, not
read off a type declaration. The DevExpress backend's comments cite it by
section wherever a decision rests on an observed runtime shape rather than on
a published signature.

Recaptured against submodule tag 0.5.1.

## Resolved submodule tag

The plan specifies pinning to tag `v0.4.1`. That tag **does not exist** upstream.

```
$ git tag -l   # inside flint-chart/
0.1.1
0.2.1
0.3.0
0.4.0
```

Upstream tags have no `v` prefix at all, and the highest `0.4.x` tag is `0.4.0`.
**Substitution: pinned to `0.4.0`** (commit `004b800a2a9791e60c496dcbc758da0fb9457459`,
"[deploy] Merge pull request #71 from microsoft/dev").

## Function locations (grep-verified import paths + signatures)

All paths are relative to `flint-chart/packages/flint-js/src/core/`.

### `resolveChannelSemantics`
- File: `resolve-semantics.ts:310`
- **Brief's assumed signature was wrong.** It is *not*
  `resolveChannelSemantics(input: ChartAssemblyInput)`. The real signature is
  4 positional arguments:

```ts
export function resolveChannelSemantics(
    encodings: Record<string, ChartEncoding>,
    data: any[],
    semanticTypes: Record<string, string | SemanticAnnotation>,
    convertedData?: any[],
): SemanticResult
```

  `SemanticResult = Record<string, ChannelSemantics>` (one entry per channel:
  `x`, `y`, `color`, etc). `encodings` values are normalized `ChartEncoding`
  objects (`{ field, type?, aggregate?, sortOrder?, sortBy?, scheme? }`) — NOT
  the raw `Record<string, RawEncodingValue>` accepted by the top-level
  `ChartAssemblyInput.chart_spec.encodings`. Real call sites (e.g.
  `vegalite/assemble.ts:230`) pass already-normalized encodings, post
  shorthand-expansion/static-series-folding/transform/override composition.
- **Important:** `zero` is deliberately **not** set on the returned
  `ChannelSemantics` — the doc comment says zero-baseline "requires template
  mark knowledge (bar vs point) that belongs to the assembler." Each backend
  assembler calls `computeZeroDecision` itself afterward and writes `zero`
  onto the channel semantics it already has. Confirmed empirically:
  `sem.y.zero` is `undefined` in our test run.

### `convertTemporalData`
- File: `resolve-semantics.ts:242`

```ts
export function convertTemporalData(
    data: any[],
    semanticTypes: Record<string, string | SemanticAnnotation>,
): any[]
```

Must be called *before* `resolveChannelSemantics` and its result passed in as
the 4th argument (`convertedData`), so temporal format detection sees
canonicalized values. With no temporal fields in the sample dataset, it is a
structural clone/no-op pass-through (see captured output below).

### `computeZeroDecision`
- File: `semantic-types.ts:454`

```ts
export function computeZeroDecision(
    semanticType: string,
    channel: string,
    markType: string,
    values?: number[],
): ZeroDecision
```

`ZeroDecision = { zero: boolean; domainPadFraction: number; zeroClass: 'meaningful'|'arbitrary'|'contextual'|'unknown'; forced: boolean; uncertain: boolean }`.

### `computeChannelBudgets`
- File: `compute-layout.ts:1310`

```ts
export function computeChannelBudgets(
    channelSemantics: Record<string, ChannelSemantics>,
    declaration: LayoutDeclaration,
    data: any[],
    canvasSize: { width: number; height: number },
    options: AssembleOptions,
): ChannelBudgets
```

`ChannelBudgets = { maxValues: Record<string, number>; facetGrid?: FacetGridResult }`.
Pipeline order is fixed: `computeChannelBudgets → filterOverflow → computeLayout`.

### `filterOverflow`
- File: `filter-overflow.ts:54`

```ts
export function filterOverflow(
    channelSemantics: Record<string, ChannelSemantics>,
    declaration: LayoutDeclaration,
    encodings: Record<string, ChartEncoding>,
    data: any[],
    budgets: ChannelBudgets,
    allMarkTypes: Set<string>,
): OverflowResult
```

`OverflowResult = { filteredData: any[]; nominalCounts: Record<string, number>; truncations: TruncationWarning[]; warnings: ChartWarning[] }`.
**Note the field is `filteredData`, not `data`** — easy to get wrong by analogy
with the input parameter name.

### `computeLayout`
- File: `compute-layout.ts:264`

```ts
export function computeLayout(
    channelSemantics: Record<string, ChannelSemantics>,
    declaration: LayoutDeclaration,
    table: any[],
    canvasSize: { width: number; height: number },
    options: AssembleOptions = {},
    facetGrid?: { columns: number; rows: number },
): LayoutResult
```

Takes the *post*-overflow-filtered table (`overflow.filteredData`), not the
original data.

## `ChannelSemantics` — real runtime shape

Input used for the capture (Bar Chart: `x: quarter` (Quarter), `y: revenue`
(Price), `color: region` (Country); 4 rows, 2 regions):

```json
{
  "x": {
    "field": "quarter",
    "semanticAnnotation": { "semanticType": "Quarter" },
    "type": "ordinal",
    "cyclic": true,
    "sortDirection": "ascending",
    "nice": true,
    "stackable": false,
    "ordinalSortOrder": ["Q1", "Q2", "Q3", "Q4"]
  },
  "y": {
    "field": "revenue",
    "semanticAnnotation": { "semanticType": "Price" },
    "type": "quantitative",
    "tooltipFormat": { "pattern": ",.2f" },
    "aggregationDefault": "average",
    "sortDirection": "ascending",
    "binningSuggested": true,
    "nice": true,
    "stackable": false
  },
  "color": {
    "field": "region",
    "semanticAnnotation": { "semanticType": "Country" },
    "type": "nominal",
    "sortDirection": "ascending",
    "nice": true,
    "stackable": false,
    "colorScheme": {
      "scheme": "set2",
      "type": "categorical",
      "reason": "geographic regions use distinct pastels"
    }
  }
}
```

Observations relevant to later tasks:
- **`zero` is absent** on `y` even though it is the quantitative measure —
  confirmed above, must be computed separately via `computeZeroDecision` and
  merged in by whatever DevExpress assembler we write (mirrors what
  `vegalite/assemble.ts` does at line ~230-240).
- **`format` was absent** for `y` in this run; only `tooltipFormat` was set
  (`{ pattern: ",.2f" }`, no `prefix`/`suffix`/`abbreviate` keys present —
  `FormatSpec` fields are all optional and only populated when relevant).
  Do not assume `format` is always present; check for `undefined`.
  `FormatSpec` shape (from `field-semantics.ts:69`):
  `{ pattern?: string; prefix?: string; suffix?: string; abbreviate?: boolean }`.
- **`colorScheme`** shape (from `semantic-types.ts:591`, `ColorSchemeRecommendation`):
  `{ scheme: string; type: ColorSchemeType; reason: string; domainMid?: number }`.
  Only present on the `color` channel; `domainMid` only for diverging schemes.
- **`stackable`** is `false` in this run for all three channels (it's a bar
  chart but `stackable` on `y` came back `false` here — this sample didn't
  exercise a stacking scenario; treat `stackable: 'sum' | 'normalize' | false`
  as the full type, don't assume any single value is the common case).
- **`ordinalSortOrder`** is a real `string[]` of canonical values (`["Q1",
  "Q2", "Q3", "Q4"]`) when Flint recognizes a canonical order for the semantic
  type (`Quarter` here); absent otherwise (not present on `color`/`region`,
  which is a `Country` type with no canonical ordering).
- **`sortDirection`** was `"ascending"` on all three channels in this sample —
  it is a per-channel default, not something inferred only for ordinal/temporal
  fields.

## `computeZeroDecision` — real runtime shape

Called as `computeZeroDecision('Price', 'y', 'bar', [1200, 1450, 980, 1800])`:

```json
{
  "zero": true,
  "domainPadFraction": 0,
  "zeroClass": "meaningful",
  "forced": true,
  "uncertain": false
}
```

`Price` is a zero-meaningful type, and `bar` is a length mark, so the baseline
is structurally forced (`forced: true`, `uncertain: false` — no UI toggle
should be offered).

## `computeChannelBudgets` / `filterOverflow` / `computeLayout` — real shapes

With the 4-row sample data and a 400×320 canvas, no overflow occurs:

```json
// computeChannelBudgets
{ "maxValues": { "x": 100, "y": 80, "column": null, "row": null, "color": 24 } }

// filterOverflow
{
  "filteredData": [ /* all 4 rows, unchanged */ ],
  "nominalCounts": { "x": 4, "y": 0, "column": 0, "row": 0, "group": 0, "color": 2 },
  "truncations": [],
  "warnings": []
}

// computeLayout
{
  "subplotWidth": 400,
  "subplotHeight": 320,
  "xStep": 27,
  "yStep": 27,
  "xContinuousAsDiscrete": 0,
  "yContinuousAsDiscrete": 0,
  "xNominalCount": 4,
  "yNominalCount": 0,
  "xLabel": { "fontSize": 10, "labelLimit": 100, "labelAngle": 0, "labelAlign": "center", "labelBaseline": "top" },
  "yLabel": { "fontSize": 10, "labelLimit": 100 },
  "titleFontSize": 11,
  "legendFontSize": 10,
  "stepPadding": 0.1,
  "effectiveFacetGap": 0,
  "truncations": []
}
```

## `ChartWarning` / `TruncationWarning` — real shape when overflow actually triggers

To observe a real (non-empty) warning, the test forces overflow with 200
synthetic categories (`Cat0..Cat199`) against a 400×320 canvas (budget caps
`x` at 100 values):

```json
{
  "nominalCounts": { "x": 100, "y": 0, "column": 0, "row": 0, "group": 0, "color": 2 },
  "truncations": [
    {
      "severity": "warning",
      "code": "overflow",
      "message": "100 of 200 values in 'category' were omitted (showing first 100 in sort order).",
      "channel": "x",
      "field": "category",
      "keptValues": ["Cat0", "Cat1", "...", "Cat99"],
      "omittedCount": 100,
      "placeholder": "...100 items omitted"
    }
  ],
  "warnings": [
    {
      "severity": "warning",
      "code": "overflow",
      "message": "100 of 200 values in 'category' were omitted (showing first 100 in sort order).",
      "channel": "x",
      "field": "category"
    }
  ]
}
```

`ChartWarning` (from `types.ts:997`, the entry actually pushed into `warnings`)
is the smaller shape:
`{ severity: 'info'|'warning'|'error'; code: string; message: string; channel?: string; field?: string }`.
`TruncationWarning` (pushed into `truncations`) is a superset carrying the
extra `keptValues` / `omittedCount` / `placeholder` fields used for UI
truncation badges — do not conflate the two types when consuming Flint output;
`warnings` is the general-purpose surface, `truncations` is overflow-specific
detail.

## `ChartEncoding` (input shape actually consumed by `resolveChannelSemantics`)

From `types.ts:45`:

```ts
export interface ChartEncoding {
    field?: string;
    type?: "quantitative" | "nominal" | "ordinal" | "temporal";
    aggregate?: 'count' | 'sum' | 'average' | 'mean';
    sortOrder?: "ascending" | "descending";
    sortBy?: string;
    scheme?: string;
}
```

This is narrower than the top-level `RawEncodingValue` accepted at the
`ChartAssemblyInput.chart_spec.encodings` boundary (which also allows bare
strings and arrays for static-series shorthand); by the time any assembler
calls `resolveChannelSemantics`, that shorthand has already been normalized
away.
