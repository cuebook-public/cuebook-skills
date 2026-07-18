# Viewpoint Visual Grammar Reference

Use one grammar and one payload mode for one creator-facing visual job. Qualitative rails and timelines are first-class evidence structures, not placeholders for missing charts. All curves are observed point sequences joined by straight segments. A missing primitive is a missing contract, not permission to improvise.

When inputs arrive as `ViewpointDataBundleV1`, project only its explicit rails, stages, values, observed series, levels, events, formulas, nodes, and edges. Keep the bundle ref in `lineage.input_artifact_refs`; do not upgrade absent bundle fields into visual evidence.

## Selection Matrix

| Grammar | Supported modes | Exact public job | Required explicit data |
| --- | --- | --- | --- |
| `reaction_test` | `qualitative`, `key_numbers`, `series` | Test pressure against response | Two rails (`pressure`, `response`), or one observed `reaction` series plus an interior event |
| `parallel_contrast` | `qualitative`, `key_numbers`, `series` | Compare two reported outcomes or synchronized paths | Two rails (`primary`, `comparison`), or synchronized observed series with those roles |
| `category_reframe` | `qualitative` | Show old frame -> new frame | Two nodes (`frame_from`, `frame_to`) and one sourced `reframes` edge |
| `relative_value_trigger` | `qualitative`, `key_numbers` | Show current relative view versus trigger | Two rails (`spread`, `trigger`), or one explicit spread value and same-unit trigger level |
| `policy_pivot` | `qualitative`, `key_numbers` | Show prior stance -> new stance | Two nodes and one event, or two reported rails (`policy_before`, `policy_after`) plus one event |
| `sentiment_witness` | `qualitative`, `key_numbers`, `series` | Compare witness with baseline or history | Two rails (`baseline`, `witness`), or one observed `witness` series |
| `event_unwind` | `qualitative`, `key_numbers`, `series` | Show event positioning and the next leg | Three stages (`pre_event`, `event_day`, `next_step`), or one observed unwind series plus an event |
| `feedback_loop` | `qualitative`, `mixed` | Explain the closed loop | Three or four `loop` nodes and a closed cycle; mixed mode adds two explicit shock values |
| `binary_level` | `key_numbers`, `series` | Show current value or observed path versus level | One current value plus threshold, or one observed `level_test` series plus same-unit threshold |
| `expectation_gap` | `qualitative`, `key_numbers` | Compare expectation with outcome | Two rails (`expected`, `actual`), or explicit `expected`, `actual`, and `gap` values |
| `factor_rotation` | `qualitative`, `key_numbers`, `series` | Show factor from -> factor to | Two rails (`from`, `to`) with an explicit qualitative formula, or synchronized observed factor series |

## Payload Modes

- `qualitative`: require direct labels/details and source refs. Forbid numeric fields and series. Render rails, timeline stages, or nodes.
- `key_numbers`: require explicit display values and source refs; require at least one numeric value in a rail/timeline set. Do not imply comparability where units differ.
- `series`: require observed point arrays and apply synchronization, event-window, and unwind arithmetic. Never fall back to a generated curve.
- `mixed`: use only for a closed feedback loop plus two explicit, sourced shock values. It is not a general permission to pile visual jobs together.

S1-style reaction test: render `bad-news pressure` against `muted price response` as two sourced rails when no full path is supplied.

X1-style parallel contrast: render `5x / five-year savings` against the reported `spot ETH experience` as two outcome rails; do not demand synchronized price series.

X7-style event unwind: render `crowded pre-buy -> event-day exit -> wait for sellers` as three sourced stages. Mark the final connector and stage border dashed when `path_kind` is `conditional` or `future`.

## Primitive Contract

- `series`: observed data only, two to 24 ordered points, one series-level source ref, one unit, no modelled points.
- `rails`: two direct outcome, pressure/response, before/after, or from/to reports. Qualitative rails carry no numeric fields; key-number rails carry explicit display values.
- `stages`: exactly three event-unwind timeline stages. The event-day stage carries its timestamp; conditional/future paths are explicit and dashed.
- `values`: explicit numeric and display values with role, unit, as-of time, source ref, and non-color shape.
- `levels`: explicit numeric and display values with role, relation, public relation label, unit, and source ref.
- `events`: label, RFC 3339 occurrence time, and source ref.
- `nodes`: direct public labels with role, source refs, and shape. Use at most two outside `feedback_loop`.
- `edges`: explicit direction, semantic relation, path kind, and source refs. Edges never arise from chart shape.

Every primitive source ref must appear in `lineage.source_refs`. Keep source IDs, evidence status, and counts out of the SVG.

## Curve Rules

- Apply these rules only to `series` mode. Require RFC 3339 timestamps for `reaction_test`, `parallel_contrast`, `sentiment_witness`, `event_unwind`, and `factor_rotation` series.
- Preserve point order and values. Use `<polyline>` only; do not use Bezier curves or synthetic intermediate points.
- Put the event inside the observed range. A reaction test needs observations on both sides.
- Synchronize both contrast series exactly. Do not align nearest timestamps silently.
- For an unwind, find the largest post-event deviation from the first observation. The final point must be closer to the first observation than that extreme.

## Level And Gap Rules

- `above` means current value is greater than the level; `below` means less; `at` means equal within numeric tolerance.
- A trigger or threshold must share the value unit.
- Do not derive a relative spread from two asset prices. Supply the already-defined spread or ratio and its lineage.
- Supply the expectation gap explicitly, including its source or reproducible derived-record ref. The validator checks its arithmetic.
- A qualitative factor rotation supplies a legible formula on one rail, such as `factor spread = cash-flow return - duration return`; leave numeric fields null when no current factor value exists.
- A series-mode binary level uses real observed or OHLC-derived points and a sourced level. The renderer draws the level against the path and does not synthesize candles or intermediate points.

## Public Copy

The SVG contains only:

1. a compact UTC as-of time at top left;
2. the canonical path-only Cuebook wordmark at bottom right;
3. one to four strategy tags;
4. one creator judgment headline;
5. one short observation;
6. direct rail, stage, data, event, level, node, and relation labels.

Do not place source counts, source IDs, workflow states, evidence-state badges, settlement conditions, deadlines, footnotes, or prose explanations in the image. Put them in upstream artifacts or the manifest.

Every grammar must use the composition assigned in `cuebook-editorial-signal-v2.md`. Shared tokens create family resemblance; generic bordered rails, equal cards, or rectangular flowchart nodes are not valid fallbacks.

## Accessibility And Scale

- Use only `cuebook-visual-tokens-v1.json` colors.
- Keep visible type at 22px or larger in the 720px SVG. The 360px PNG is a half-scale derivative, preserving an 11px logical minimum.
- Pair semantic color with marker shape, line dash, position, and direct text.
- Give every SVG `role="img"`, a `<title>`, a `<desc>`, and matching `aria-labelledby` IDs.
- Require explicit `frame.alt_text`; do not generate alt text from geometry.
- Append the canonical wordmark as the final SVG layer at `x=625`, `y=388`, using its native 73 x 14 geometry. No visible brand text or `C` badge is permitted.
