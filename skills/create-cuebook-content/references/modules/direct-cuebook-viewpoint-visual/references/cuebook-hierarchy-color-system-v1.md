# Cuebook Hierarchy And Semantic Color System

## Sources And Scope

This system adapts three complementary sources for a compact financial viewpoint image:

- [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), commit `b17742737e796305d829b3ad39eda3add0d79060`: brief inference, design dials, anti-default discipline, and audit-first redesign.
- [jakubkrehel/skills](https://github.com/jakubkrehel/skills), commit `f8a1574b08319685705a82e3c28139d1c935af9e`: semantic type scales, deliberate wrapping, tabular numerals, perceptual OKLCH palettes, and contrast checks.
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/): clarity, layered foreground and background roles, restrained semantic color, readable weights, alignment, and minimum-size discipline.

Cuebook uses the methods, not a literal Apple interface replica. The target is calm product clarity with finance-specific density and expressive market semantics.

## Hierarchy Contract

Every launch visual declares `data-entry-role` on the root and `data-visual-level` on every visible role group except the brand mark.

| Level | Job | Typical content |
| --- | --- | --- |
| `1` | one visual entry point | claim, key number, decisive comparison, or observed curve |
| `2` | proof or mechanism | strongest evidence, reason, or causal relationship |
| `3` | what changes next | catalyst, horizon, implication, or invalidation |
| `4` | orientation only | ticker, timeframe, state label, or short context |

Rules:

- Use exactly one level-1 group. Claim must be level 1 or 2.
- Use two to four levels; do not make all groups equally loud.
- Separate adjacent levels with at least two cues from size, weight, occupied area, position, whitespace, and contrast. Color alone never establishes a level.
- Give one block the largest area. When a number is level 1, the claim becomes level 2; when the claim is level 1, the number or curve becomes level 2.
- Preserve the same entry point and reading order at 1244 x 528 and 622 x 264. Remove level 4 before shrinking level 1 or 2.
- Run a grayscale test and a squint test. If the entry point or reading order disappears without hue, revise the geometry or type scale.

## Type Roles

Use the system UI stack so Chinese and Latin text remain native and quiet. Use no more than one family in a launch image unless a sourced quote requires a second family.

| Role | 1244 px starting range | Weight | Line height |
| --- | ---: | ---: | ---: |
| level-1 claim | 46-64 px | 700-850 | 1.04-1.12 |
| level-1 number | 52-76 px | 700-850 | 0.96-1.04 |
| level-2 proof | 24-36 px | 600-780 | 1.10-1.25 |
| level-3 condition | 18-24 px | 550-720 | 1.20-1.35 |
| level-4 context | 14-18 px | 500-650 | 1.25-1.40 |

- Keep `letter-spacing: 0` for every role.
- Apply `font-variant-numeric: tabular-nums` to prices, percentages, dates, and changing market values.
- Use `text-wrap: balance` for claims and `text-wrap: pretty` for short explanations.
- Keep claims to two lines at 1244 px. Rewrite before reducing the claim below 64 px.
- Remove expendable level-4 copy from the master when it would fall below a comfortable phone display size.
- Do not use thin weights for colored text. Small colored copy needs more weight or a darker lightness value.

## Semantic Color Contract

The neutral hierarchy carries the composition. Color explains market meaning and relationships.

Mark each chromatic element with one of these `data-color-role` values:

| Role | Meaning | Common fallback when no creator profile exists |
| --- | --- | --- |
| `positive` | bullish direction or favorable outcome | mint / green |
| `negative` | bearish direction or adverse outcome | coral / red |
| `observed` | reported or already observed evidence | cobalt / blue |
| `catalyst` | event, deadline, or transition point | amber / orange |
| `conditional` | future, unconfirmed, or path-dependent state | violet |
| `comparison` | relative-value or cross-asset relationship | cyan / teal |
| `risk` | invalidation, leverage, or loss boundary | coral or amber |

Rules:

- Use one dominant semantic role, one support role, and an optional third role only when it answers a different question.
- Use at most three chromatic roles per image. A palette can be multicolor without coloring every block.
- Keep roughly 70-85% of the image neutral. Reserve saturated color for the largest number, event boundary, curve segment, or one key phrase.
- Keep role meaning stable while allowing hue expression to adapt. `positive` may map to mint, lime, cyan, or restrained cobalt when redundant labels and geometry preserve the bullish meaning; it never changes hue only for novelty.
- Pair color with a label, position, shape, or solid/dashed state. Never require color vision to understand the trade.
- A summary or delta annotation inherits the color role of the group it summarizes, or stays neutral ink. Introducing a third hue for a group summary breaks color logic.
- Use color on bold text, substantial marks, or meaningful fields. Avoid low-contrast color on tiny or light-weight text.
- Do not use full-canvas saturated fills, rainbow decoration, or gradients. Near-white, silver-gray, and graphite surfaces keep the content in charge.
- Across three sibling directions, use the three registered strategies and three distinct presets from `creator-adaptive-palette-system-v1.md`.

## Cuebook Fallback Palette

Use this only when no creator profile, creator text, or content-specific palette signal exists. Define sRGB first, then use OKLCH as the perceptual override. Adjust lightness for contrast while preserving hue and chroma intent.

```css
:root {
  --surface-0: #f7f8fa;
  --surface-0: oklch(0.977 0.004 250);
  --surface-1: #eef1f5;
  --surface-1: oklch(0.948 0.008 250);
  --ink-1: #111418;
  --ink-1: oklch(0.205 0.008 250);
  --ink-2: #5d6470;
  --ink-2: oklch(0.500 0.018 250);
  --separator: #d7dce2;
  --separator: oklch(0.880 0.010 250);

  --positive: #177c57;
  --positive: oklch(0.510 0.115 158);
  --negative: #cf453c;
  --negative: oklch(0.590 0.175 29);
  --observed: #2567d5;
  --observed: oklch(0.560 0.180 258);
  --catalyst: #b86f00;
  --catalyst: oklch(0.570 0.130 68);
  --conditional: #7657c8;
  --conditional: oklch(0.550 0.145 300);
  --comparison: #087f91;
  --comparison: oklch(0.550 0.105 215);
}
```

For dark graphite surfaces, use light foregrounds and brighter role colors. Avoid pure black. Keep the lightness difference large enough for labels and body copy; body text on a light surface should normally use an OKLCH lightness below `0.35`, and body text on a dark surface should normally use a lightness above `0.90`.

## Palette Families

Use the registered systems in `creator-palette-presets-v1.json`. Add a tested registry entry when the library lacks a creator/content fit; do not improvise a hidden one-off theme in render code.

## Rendered Checks

Before brand lock, inspect the same master at full and phone display scales and answer yes to all:

1. **Three-second:** Can the reader state the market judgment immediately?
2. **Grayscale:** Does claim, proof, and condition remain ordered without hue?
3. **Color meaning:** Can every chromatic element be named as a semantic role?
4. **Color restraint:** Are there no more than three chromatic roles and no decorative hue?
5. **Typography:** Are there four or fewer type sizes and weights, with tabular market numbers?
6. **Compact:** Is level 1 still dominant and is expendable level 4 removed before critical copy shrinks?
7. **Contrast:** Is colored text readable against its actual local background?
