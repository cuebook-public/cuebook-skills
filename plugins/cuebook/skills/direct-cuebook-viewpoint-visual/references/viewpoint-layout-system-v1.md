# Cuebook Viewpoint Layout System

## Purpose

Convert approved market content into an editorial composition. Content semantics decide what is true; layout decides what the reader notices first, understands second, and remembers last.

## Design Read

Before choosing a grid, write one sentence that names the static format, audience, tone, design language, and reading context. Then set two explicit dials:

- `design_variance`: 1-10, from restrained axial order to thesis-led experimental composition;
- `visual_density`: 1-10, from one hero plus one support to a compact evidence or strategy layout.

Also declare `compose`, `redesign_preserve`, or `redesign_overhaul`. Preserve mode lists the existing visual traits that remain. Overhaul mode lists the generic or broken patterns being retired.

Suggested starting points:

| Viewpoint | Variance | Density |
| --- | ---: | ---: |
| one conviction or key number | 4-6 | 2-4 |
| event versus price reaction | 6-8 | 4-6 |
| causal transmission or expectation gap | 6-8 | 4-7 |
| risk ladder or instrument strategy | 5-7 | 7-9 |
| punchy creator/KOL statement | 7-9 | 3-5 |
| regulated or explanatory note | 3-5 | 4-6 |

Read `taste-skill-adaptation-v1.md` for anti-default rules and `cuebook-hierarchy-color-system-v1.md` for explicit visual levels and semantic color. Higher variance changes structure, not decoration. Higher density changes grouping, not minimum readable type.

## Input Blocks

Inventory only blocks that exist upstream:

- claim or judgment;
- strongest reason;
- observed evidence: curve, number, event, quote, comparison, or relationship;
- implication or action relevance;
- optional horizon, condition, catalyst, invalidation, source fragment, and brand signature.

Remove a block when it repeats another block without adding meaning. For selectable Feed art, read `launch-visual-copy-v1.md`: disclosures and research-completeness notes live outside the image.

## Seven Layout Decisions

1. **Hierarchy**: order claim, reason/evidence, and implication; declare one `data-entry-role` and levels 1-4.
2. **Hero**: assign the largest area to one block only.
3. **Grid**: choose the spatial relationship that expresses the argument.
4. **Alignment**: establish one dominant reading axis.
5. **Type scale**: make hierarchy visible in grayscale without relying on color.
6. **Density**: match the number of blocks to the 1340 x 528 authoring canvas.
7. **Responsive rule**: define how the hierarchy survives at 670 x 264.

Choose the `composition_archetype` from `finance-visual-argument-system-v1.md` before choosing a grid family. The composition expresses the financial relationship; the grid implements it.

## Grid Families

| Grid | Best for |
| --- | --- |
| `single_axis` | one conviction, one number, or one decisive quote |
| `editorial_split` | claim versus evidence, event versus reaction |
| `asymmetric_stage` | one dominant visual with small explanatory copy |
| `comparison_field` | relative value, expectation gap, pressure versus response |
| `timeline_band` | catalyst, now boundary, horizon, or settlement deadline |
| `freeform` | content-derived motif that remains readable without a generic grid |

## Type Scale

- Use the fixed `cuebook-noi-v1` profile for launch HTML. Noi carries Latin, tickers, punctuation, and numerals; `PingFang SC`, `Noto Sans CJK SC`, then `Microsoft YaHei` carry missing CJK glyphs at the same requested weight.
- Use only original renderer-local font files staged by `scripts/stage_noi_font_assets.py`. A Trial file is evaluation-only and cannot enter a release artifact.
- Start with hierarchy ratios, then choose pixels.
- At 1340px, hero text normally occupies 64-120px; body/supporting text 28-52px; metadata 18-30px.
- Hero-to-body ratio should normally be at least 2.0. Small canvases may use weight, position, and whitespace in addition to size.
- Letter spacing remains 0 and font synthesis remains disabled. Use the declared Noi-plus-CJK stack rather than introducing another display family.
- Use four or fewer type sizes and four or fewer weights in a launch visual.
- Use 400, 500, or 600 for most claims and supporting copy. Reserve 700 for a short all-Latin lockup or compact key number.
- Apply tabular numerals to market values and dates.
- A key number may exceed the headline size when the number is the claim.
- Use balanced natural wrapping for claims. Manual line breaks are invalid in launch visuals because they produce orphan verbs and unstable compact layouts.

## Data Placement

- `hero`: the curve, number, or comparison directly proves the claim and receives the dominant area.
- `support`: data explains the claim in a secondary band or anchored annotation.
- `none`: the viewpoint is rhetorical or mechanism-led; omit decorative data.
- Direct-label curves and comparisons. Avoid detached legends.
- Place news at the event point or causal origin. Do not turn every source into a card.
- In proof candidates, allocate roughly 55-72% of usable area to the chart, comparison, term structure, threshold, distribution, or other evidence geometry. Keep claim typography to a compact entry zone.
- Use one stable baseline for comparable values. Attach labels to endpoints, bars, maturities, thresholds, or event marks; floating labels fail review.
- Use amount and rate in separate aligned bands when both appear in one term-structure visual. Avoid ambiguous dual axes.

## Compact-First Geometry

Sketch the 670 x 264 state first, then expand to 1340 x 528.

- Claim normally occupies 14-23% of canvas height and one or two lines.
- Evidence normally owns the largest contiguous field in proof-led compositions.
- One principal alignment axis organizes the reading path; use a second only when it separates message from proof.
- Keep at least 16 authored pixels between unrelated text groups and 8 between attached labels and geometry.
- Context should carry no more than 5% of visual attention and is deleted before proof or mechanism is compressed.

## Density

- `quiet`: 1 hero + 1 support. Best for conviction, key numbers, and contrarian statements.
- `balanced`: 1 hero + 2 supports. Default for Cuebook Feed.
- `dense`: 1 hero + 3 compact supports. Use only when the supports remain legible at 670px.

## Responsive Rule

Audit 1340 x 528 and 670 x 264 as two authored states, then export the publication raster at exactly 2680 x 1056.

- Preserve the same first, second, and third reading order.
- Scale type and spacing with the container, not viewport-width font rules.
- Collapse a split into a tighter axis when necessary; never crop the logical half away.
- Hide low-value metadata before shrinking the claim or evidence below readability.
- Delete peripheral copy before adding a footer or a third text block.
- Keep stable dimensions so labels and dynamic states do not shift the composition.

## Three-Direction Matrix

| Direction | Layout objective |
| --- | --- |
| Product-native | strongest clarity and Cuebook familiarity |
| Benchmark transfer | one verified external composition principle adapted to Cuebook |
| Content-native | a spatial relationship unique to this exact thesis |

The three directions must differ in composition archetype, grid, hierarchy, or reading axis. Surface styling alone does not count. At most one may use an editorial-statement poster; quantitative evidence requires at least one chart-led direction.

The optional `market-native-modular-v1` benchmark direction is best for one high-conviction judgment plus one observed market object. Its reading chain is `judgment -> measured proof -> evidence object -> horizon or condition`. It may transfer a neutral field, one purposeful signal accent, and modular evidence placement, but it must not transfer Robinhood logos, fonts, proprietary neon, product chrome, illustrations, or exact module proportions. Read `market-native-art-direction-v1.md` before using it.

Use three distinct registered presets across the three directions. Palette variation may change surface temperature, contrast, chroma, and actual role hues; positive, negative, observed, catalyst, conditional, comparison, and risk meanings remain stable through metadata and redundant visual cues.
