# Cuebook Chart Design System

This is a chart-specific adaptation of the audit-first, brief-first, and visual-lock ideas in [Taste Skill](https://github.com/Leonxlnx/taste-skill). It is not a generic frontend theme. Market meaning, provenance, and settlement semantics always outrank decoration.

## Design Read

Before rendering, state one line internally:

`Reading this as: <chart role> for a fast financial Feed, with a restrained evidence-first language and <feed/detail> density.`

The semantic mode chooses the visual grammar. The following locks stay fixed:

- brand lock: Cuebook ink, neutral surface, yellow publication/settlement accent;
- shape lock: one 8 px outer radius, 2 px or less plot marks, no nested cards;
- color lock: green and red carry market direction or support/invalidation only;
- theme lock: one light or dark theme for the whole asset;
- evidence lock: every visible number and mark has lineage.

## Profiles

### `cuebook_feed_v1`

- Job: survive fast scrolling and thumbnail display.
- Composition: one judgment, one primary plot, one decisive level or event, one deadline.
- Public image hides artifact state, diagnostics, provenance footer, chart instructions, and settlement prose.
- Headline is one line when possible and two lines maximum.
- The plot is the largest region. Use four quiet horizontal guides and at most four visible annotations.
- A single-series chart shows one top-right observed value; a multi-series chart uses a compact legend.
- Default static output. No gradient, glow, shadow, texture, decorative badge, or future price path.

### `cuebook_detail_v1`

- Job: research detail, chart inspection, and settlement review.
- May show provenance footer, observed interval, forming-bar guide, and an explicitly requested settlement panel.
- Keeps the same palette, type, candlestick, and annotation grammar as Feed.
- Additional information must remain subordinate to the plot.

## Core Tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| canvas | `#FCFCFA` | `#171918` | full asset |
| ink | `#151815` | `#F5F6F2` | judgment and key values |
| muted | `#737A75` | `#A5ABA6` | axes and metadata |
| grid | `#E5E9E5` | `#343936` | analytical guides |
| up | `#12A97B` | `#22B58A` | positive candle/series |
| down | `#DF5967` | `#EE6B73` | negative candle/invalidation |
| cue | `#F1BE28` | `#F3C84B` | event, trigger, deadline |
| unresolved | `#FFF8E4` | `#242725` | settlement clock only |

Use the platform sans stack with CJK fallbacks. Use tabular numerals for every market number. Letter spacing is zero. Minimum compact semantic text is 11 px; the watermark may be quieter.

## Candlestick Grammar

- Use raw-price candles only on a price axis with one instrument.
- Candle body width is 54-62% of the served interval slot, clamped for thumbnail readability.
- Sealed up/down candles are solid. A forming candle is hollow and dashed with reduced opacity.
- Fit the y-axis to visible highs, lows, and explicit numeric levels. Never force zero.
- Four horizontal guides are enough for Feed. Avoid vertical grid wallpaper.
- A level line uses a short label placed on its own surface so text does not sit directly on the stroke.
- Publication and expiry are clock markers. Empty future space remains visibly unresolved.

## Annotation Budget

Feed order of importance:

1. explicit trigger, target, or invalidation;
2. publication cutoff or sourced event;
3. expiry;
4. latest observed value.

If more than four marks compete, keep the decisive marks and move the rest to the post or detail view. Never shrink labels to preserve excess annotation.

## Public Copy Rules

- Use the creator-facing judgment as the title.
- Subtitle may name instrument, interval, comparison basis, or as-of time.
- Do not show `conditional`, `draft`, schema names, Skill names, extraction narration, data warnings, or "solid/dashed means" instructions in Feed.
- Keep the complete settlement sentence, caveats, and source register outside the compact image.

## Preflight

Every public chart must pass all checks:

1. The judgment is legible in two seconds and no title line clips.
2. The dominant curve or candles occupy the largest area.
3. No text overlaps candles, levels, event labels, axes, or another text block.
4. Up, down, trigger, invalidation, forming, and unresolved states remain distinguishable at thumbnail size.
5. Every number retains unit, basis, as-of time, and source in the artifact even when hidden from the image.
6. No internal state or workflow narration leaks into the public SVG.
7. Cuebook watermark is present, low contrast, and outside the primary reading path.
8. Raster output is inspected at 100% and approximately 360 px wide.
