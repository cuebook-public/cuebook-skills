# Cuebook Editorial Signal V2

This is the visual language for compact Cuebook viewpoint graphics. It turns one market judgment into one editorial figure that remains legible at 360 x 210. It is not a dashboard card, a workflow preview, or a settlement receipt.

## Design Read

- Product: a creator-facing financial publishing surface.
- Reader moment: fast Feed scanning, followed by optional inspection.
- Personality: sharp, restrained, evidence-aware, and opinionated.
- Density: high information density with low decorative density.
- Primary question: what should the reader notice first, and what relationship proves the creator's point?

## Shared Language

### Canvas And Brand

- Use a warm near-white canvas and one quiet graphite ink family.
- Reserve Cuebook yellow for a policy interruption or one decisive pivot. It is not a generic highlight color.
- Put the exact 73 x 14 path-only Cuebook wordmark at `right: 22px; bottom: 18px`. Keep the 117 x 50 bottom-right safe zone clear and never add a `C` badge, plate, or visible brand text.
- Put a compact Chinese as-of label at the top left. Time is context, not the headline.
- Keep the composition unframed. Do not wrap rails, nodes, metrics, or chart regions in generic cards.

### Hierarchy

Use four semantic type roles only:

1. `meta`: as-of time, brand, and quiet context.
2. `tag`: one line of strategy vocabulary.
3. `headline`: the creator's judgment.
4. `body`: the observation and direct labels.

Metrics may exceed headline size when the number is the argument. Use tabular figures. Keep letter spacing at zero. Headlines use two balanced lines at most; observations use one line whenever possible.

### Color

- Ink carries structure and primary text.
- Green carries the creator's active view, observed resilience, or constructive destination.
- Red carries an observed negative shock or risk, never generic emphasis.
- Blue carries comparison or the prior frame.
- Amber carries thresholds and decision boundaries.
- Gray carries context and supporting geometry.
- Pair every semantic color with position, direct text, dash, or shape. Never rely on color alone.

### Geometry

- Use hairlines only when they organize real data or a causal path.
- Use circles only for observed points or endpoints, triangles only for shocks, and squares only for comparison anchors.
- Solid geometry means observed or explicitly stated. Dashed geometry means explicit conditional or future logic.
- Avoid nested rectangles, pill tags, legends, shadows, gradients, ornamental grids, and decorative marker scatter.
- A visual may use at most one soft field or band. Most compositions should use none.

### Information Budget

Every 720 x 420 visual contains:

- one creator judgment;
- one observation;
- one dominant visual relationship;
- at most three subordinate labels outside a feedback loop;
- no source counts, workflow states, evidence badges, settlement terms, or backend diagnostics.

If a sentence already appears in the headline or observation, do not repeat it inside the figure.

## Grammar Blueprints

Each grammar owns a distinct primary mark. Two neighboring graphics in a Feed should remain distinguishable when their text is blurred.

| Grammar | Primary composition | First glance | Do not use |
| --- | --- | --- | --- |
| `reaction_test` | pressure arrow against a restrained response trace | strong input, weak output | two stacked cards |
| `parallel_contrast` | asymmetric split with one oversized metric per side | two outcomes that cannot be averaged | parallel bordered rails |
| `category_reframe` | old label, bridge, larger destination label | the valuation frame changed | two equal boxes |
| `relative_value_trigger` | spread axis with current condition and dashed trigger continuation | spread versus activation condition | generic before/after panels |
| `policy_pivot` | reinforcing loop interrupted by a yellow policy bar | the rule change can break the loop | two policy cards |
| `sentiment_witness` | one witness quote or report separated from a wider market baseline | sample versus inference | two equal rails |
| `event_unwind` | three-beat editorial timeline with a crowding hump | pre-buy, event exit, conditional re-entry | three boxed stages |
| `feedback_loop` | true circular loop with shock metrics anchored beside it | self-reinforcing transmission | rectangular flowchart nodes |
| `binary_level` | observed series plus a horizontal decision band | current path versus one level | decorative price line with no level |
| `expectation_gap` | oversized expected and actual values separated by the gap | a small miss can matter at full pricing | three metric cards |
| `factor_rotation` | typographic factor formula feeding a directional rotation | why capital should move from one leg to another | formula inside a UI panel |

## Series Rules

- Use straight observed segments. Never smooth, forecast, or invent intermediate points.
- Give comparison series a thinner or dashed line and keep the active series visually dominant.
- Label series directly at the endpoint. Remove legends.
- Use the selected period as the x-domain and include only the first and last time labels in the compact figure.
- Draw a threshold as a narrow band plus a direct label. A band communicates tolerance better than an ornamental dotted line.
- Draw events as a vertical hairline with a short annotation anchored to the relevant point.
- Future or conditional extensions remain dashed and must originate from an observed or explicit anchor.

## Mobile Gate

Inspect the 360 x 210 derivative, not only the source SVG.

- The judgment must be readable without zooming.
- The primary metric or relationship must survive grayscale and blur.
- No label may touch the canvas edge, another label, or a data mark.
- Direct labels must remain attached to the correct series or stage.
- If an annotation cannot fit, shorten the public copy upstream. Do not shrink below the shared minimum.

## Preflight

- One dominant idea is visible within one second.
- The grammar has its own silhouette.
- The figure uses spacing before surfaces.
- The number is large only when it is evidence, not decoration.
- Conditional geometry is dashed and observed geometry is solid.
- All displayed primitives are sourced in the manifest.
- The SVG and 360px PNG have both been visually inspected.
