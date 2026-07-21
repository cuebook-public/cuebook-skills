# Editorial Craft Benchmarks V1

Structural principles distilled from three verified public editorial-graphics systems, adapted to the 2.36:1 Cuebook viewpoint canvas. Transfer the discipline, never the brand surface. Read together with `canvas-craft-v1.md` (composition energy) and `finance-visual-argument-system-v1.md` (chart routing, whose market-relationship taxonomy already derives from the FT vocabulary below).

## Verified sources

| Source | What it is | What Cuebook takes |
| --- | --- | --- |
| [FT Visual Vocabulary](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary) | The Financial Times chart-selection taxonomy (deviation, correlation, ranking, distribution, change over time, magnitude, part-to-whole, spatial, flow) | per-relationship honesty rules and annotation stance |
| [Datawrapper, "What to consider when using text in data visualizations"](https://www.datawrapper.de/blog/text-in-data-visualizations) (Lisa Charlotte Muth) | 14 principles for text in charts | label placement, text hierarchy, number formatting |
| [The Economist chart style guide](https://sa.ipaa.org.au/wp-content/uploads/2026/02/Economist-CHARTstyleguide_20170505.pdf) | Newsroom chart standards | one-message discipline, title stance, gridline and accent restraint |

Do not transfer: FT pink paper, Economist red and Milo, Datawrapper product chrome, any masthead furniture, or house chart footers. The brand-distance rule from `market-native-art-direction-v1.md` applies to all three.

## Chart honesty rules (FT)

- A column or bar encodes magnitude and must start at zero. A line encodes change and may crop its axis — disclose the crop (`baseline_policy: cropped_disclosed`) with visible bounds.
- Ranking data is sorted before it is drawn; an unsorted ordered-category chart is a routing failure, not a style choice.
- Annotate the pattern the reader should see, at the pattern. FT's stance matches the kernel: evidence that needs a caption paragraph is mis-composed.
- Correlation reads as causation to most readers. When the thesis is correlation-only, say so in visible copy; reserve connector arrows for sourced causal claims (already a hard gate).
- Emphasis is honest: highlighting the series or point that carries the claim is expected editorial practice, not distortion — de-emphasize the rest instead of deleting it when context is load-bearing.

## Text discipline (Datawrapper)

- **Direct labels beat legends** — already contract; restated here because it is the single highest-leverage habit.
- **Values carry units at the mark**: `548 thousand barrels/day`, `+12.2%`, `$66.84` — never a bare number with the unit parked in another group.
- **Display numbers are simplified**: at display scale, one decimal place unless the extra digit is the claim (a settlement threshold keeps its exact form). Exact long-form values live in data payloads, not on the canvas.
- **Two text hierarchy levels per zone**: within any one role group, use at most two size/weight steps. The canvas-wide four-size budget still applies; this rule stops micro-hierarchies inside a group.
- **Text stays horizontal by default; body copy left-aligns.** Rotated or right-aligned type is a declared poster device (see exception clause), never a way to fit an oversized label.
- **Halo text over geometry**: when copy overlays a curve, field, or tinted zone (the full-bleed compositions canvas-craft encourages), give it a background-colored text stroke or a quiet backing plate so legibility never depends on where the geometry happens to pass. Verify the same master at full and phone display scales.

## One-message discipline (The Economist)

- One chart, one message: the direction's `form_from_content` sentence is the message; anything on the canvas that serves a second message is reverse-deletion material.
- The claim states the takeaway, not the topic: “Oil may struggle to hold $75 in Q3,” never “WTI price trend.” Topic-titling is an automatic critique failure under `three_second`.
- Horizontal gridlines only, few, and quieter than the data; no vertical grid. At 2.36:1 most evidence fields need zero to three gridlines — prefer a labeled threshold line over a grid.
- One accent carries the primary series or verdict; support data takes neutrals or muted steps of the same hue before any second hue appears. This is the same 70-85% neutral rule as the palette system, stated from the ink side.

## Poster exception clause

`canvas-craft-v1.md` legitimizes moves these newsroom rules forbid — vertical seam labels, right-aligned claim blocks, cropped oversized numerals. The precedence is:

1. Inside an **evidence field** (chart, threshold, comparison, distribution), the newsroom rules above are binding. No rotated axis labels, no centered label stacks, no unhaloed text over data ink.
2. In **statement territory** (claim, verdict numeral, structural seam), a poster device may override alignment and orientation rules only when it is the direction's declared `scale_extreme` or seam motif — one device per direction, named in `layout_system`.
3. A poster device never applies to a bound fact label. If the rotated or cropped element carries a `data-binding-ref`, it follows evidence rules.

## Adoption checklist

Add to the craft pass alongside the canvas-craft self-check:

- Every mark the claim depends on is labeled at the mark, with its unit.
- Display numbers carry at most one decimal unless the digit is the claim.
- Any text over geometry is haloed or plated, at both rendered sizes.
- Gridlines: horizontal only, quieter than data, zero preferred.
- The one declared poster device is named; nothing else breaks newsroom text rules.
