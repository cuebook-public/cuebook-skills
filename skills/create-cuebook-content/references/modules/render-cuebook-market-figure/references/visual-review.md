# Market Figure Visual Review

Adapted for compact financial graphics from [Taste Skill](https://github.com/leonxlnx/taste-skill), [Emil Kowalski's design-engineering skills](https://github.com/emilkowalski/skills), and [Jakub Krehel's typography, color, and UI skills](https://github.com/jakubkrehel/skills). These sources are MIT licensed. Apply this after semantic validation and before release. Financial meaning, source lineage, quote currency, and settlement rules remain locked.

The receptive-restraint profile is informed by the Hara Design Institute's description of [White](https://hara.ndc.co.jp/en/books/shiro/), where white is treated as a sensory and communicative resource rather than a decorative color. It is an adapted Cuebook profile, not an imitation claim.

## Five-Second Read

The viewer should find these in order without reading body copy:

1. judgment;
2. narrative or capital-transmission path when present;
3. dominant reason or reaction number;
4. observed curve and decisive level;
5. next observable or competing path.

If two elements compete for the same rank, remove or demote one.

## Receptive Restraint

- Treat white space as capacity for the evidence to register. It must clarify the dominant relationship, not shrink the plot for atmosphere.
- Remove prose already encoded by a level, endpoint, event marker, or deadline. The full text remains in structured metadata.
- Use one content-derived accent at a time. Semantic risk and settlement colors remain functional exceptions.
- Prefer quiet asymmetry: judgment at the upper left, dominant number at the upper right, evidence below.
- Put the decision time in the upper-left metadata line. Keep source counts and provisional legends out of the compact footer.
- Let one strong number or curve carry the image. Empty space is acceptable when the evidence is complete.
- Avoid warm paper textures, ornamental Japanese motifs, meditative slow motion, and oversized margins in a dense financial Feed.

## Typography

- Keep the compact headline to one line when practical and two lines at most.
- Use tabular figures for prices, percentages, dates, and ratios.
- Prefer `font-variant-numeric: tabular-nums`; do not duplicate it with a raw `tnum` feature tag.
- Use a small semantic type scale and real font weights. Compact semantic text should be at least `10px`; a quiet watermark may be `9px`.
- Preserve sentence case. Avoid decorative all-caps labels and generic section numbering.
- Do not truncate the asset identity, dominant number, decisive level, or settlement rule.
- Truncated news or source context must remain available in the manifest or detail view.
- Keep letter spacing at zero; use weight, size, and whitespace for hierarchy.

## Color

- Start from a neutral surface and one restrained series color.
- Reserve green, red, and yellow for semantic support, invalidation, risk, forming state, or deadline.
- Avoid purple-led AI styling, gradients, glow, texture, and decorative color with no data meaning.
- Check every foreground against its actual surface. Regular text and small labels target WCAG `4.5:1`; large text and meaningful graphical objects target `3:1`.
- Keep a bright brand yellow as an accent only when a darker outline or ink carries the semantic edge.
- Check contrast at the final raster size as well as in the palette tests.

## Density And Composition

- The plot remains the largest region in a `720 x 420` compact figure.
- Prefer one series, one decisive horizontal level, one event, and one deadline.
- Keep at most four markers. Shorten marker labels before shrinking type.
- A plot frame is allowed because it contains a genuine analytical tool. Do not add nested decorative cards.
- Keep the watermark quiet and outside the primary reading path.
- Align labels, dots, and symbols optically when geometric centering looks uneven.

## Motion

- A Feed market figure is static by default. The user may see it hundreds of times while scrolling, so decorative chart animation adds friction.
- In an interactive view, animate only a meaningful state transition such as selection, forming-to-sealed, or settlement. Never animate an observed curve as though it were a forecast.
- Keep routine transitions under `200ms`, use `transform` or `opacity`, make rapid interactions interruptible, and honor `prefers-reduced-motion`.
- Remove motion first when its purpose is unclear.

## Release Check

1. Render SVG and PNG at exact output dimensions.
2. Inspect the image at 100% and thumbnail size.
3. Check timestamp, headline, argument path, dominant number, endpoint, marker labels, and watermark for overlap or truncation.
4. Confirm the type floor, standard weights, tabular figures, and foreground-to-surface contrast.
5. Confirm every color carries meaning and every displayed number has lineage.
6. Re-render after any fix; do not approve from source code alone.
