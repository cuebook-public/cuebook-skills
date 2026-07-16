# Taste-Skill Adaptation For Cuebook

## Source

Adapted from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), commit `b17742737e796305d829b3ad39eda3add0d79060`, under the MIT License.

The upstream v2 skill targets landing pages, portfolios, and redesigns. Cuebook imports its design method, not its page-specific recipes. Typography and color mechanics are further adapted from [jakubkrehel/skills](https://github.com/jakubkrehel/skills), commit `f8a1574b08319685705a82e3c28139d1c935af9e`, and checked against Apple's Human Interface Guidelines.

## Imported Method

1. **Read before styling**: infer format, audience, tone, references, brand constraints, and reading distance before composing.
2. **Make taste explicit**: set `design_variance` and `visual_density` from 1 to 10. Do not silently fall back to one house layout.
3. **Fight model defaults**: reject equal-card grids, generic dashboard chrome, decorative labels, fake sparklines, default centered posters, and surface-only variations.
4. **Audit before redesigning**: when an existing Cuebook or creator visual is supplied, declare preserve or overhaul mode and list what stays and what retires.
5. **Render before approval**: inspect real full and compact images. A prose design plan is not a visual result.
6. **Run a mechanical pre-flight**: verify visible copy, compact readability, source bindings, shape consistency, layout uniqueness, and anti-default discipline.
7. **Make hierarchy declarative**: one entry role, explicit visual levels, and a grayscale pass stop color or decoration from carrying the argument.
8. **Use perceptual semantic color**: OKLCH lightness and chroma produce controlled multicolor palettes whose hues communicate observed, directional, catalyst, conditional, comparison, or risk states.

## Cuebook Static Dials

### `design_variance`

- `1-3`: restrained, mostly axial, strong institutional clarity.
- `4-6`: editorial variation with controlled asymmetry.
- `7-8`: thesis-led asymmetry, overlap, crop, or unusual scale relationships.
- `9-10`: experimental composition; use only when the creator voice and evidence remain readable at 622px.

Higher variance changes structure. It does not authorize more decoration.

### `visual_density`

- `1-3`: one hero and one support.
- `4-7`: one hero and up to two supports.
- `8-10`: compact strategy, comparison, or evidence layouts with three supports at most.

Higher density requires stronger grouping and larger differences between hierarchy levels. It does not authorize smaller unreadable text.

## Cuebook Anti-Defaults

- No three equal cards for claim, reason, and implication.
- No header bar that resembles a market dashboard unless navigation is part of the artifact.
- No eyebrow, status dot, badge, source count, or timestamp used only to make the image feel designed.
- No generic curve, terminal window, fake order book, or mock chart without bound data.
- No centered headline plus decorative footer as the automatic first answer.
- No identical DOM skeletons with palette changes presented as separate directions.
- No full-canvas gradient, glow, glass panel, or stock-photo filler.
- No tiny metadata competing with the creator's judgment.
- No disclosure, source note, or research-completeness sentence inside a launch bitmap when it can live beside the image.
- No manual claim breaks that strand a short verb or connector on its own line.
- No number whose area, length, or position implies unsupported magnitude.

## Pre-Flight

Every direction records these checks:

- `copy_audited`: every visible string is plain, specific, and free of internal workflow language;
- `compact_readable`: the claim is legible and understandable at 622 x 264;
- `anti_default_checked`: the composition has no unmotivated Cuebook anti-default;
- `layout_signature_unique`: hierarchy, grid, alignment, or density materially differs from the other directions;
- `source_bindings_complete`: every displayed market fact and geometry resolves to declared upstream lineage, and every selected material binding remains visibly present in full and compact output;
- `shape_system_consistent`: radius, stroke, marker, and solid/dashed rules remain coherent.
- `hierarchy_survives_grayscale`: the entry point and reading order remain clear without hue;
- `semantic_color_checked`: every chromatic element has a declared market meaning, readable local contrast, and a redundant non-color cue.

For `previewed` and `selected` artifacts, every check must be true.

## Excluded Upstream Rules

- Motion and GSAP rules: deferred while Cuebook focuses on static output.
- Landing-page hero, CTA, navigation, logo-wall, and SEO rules: unrelated to a 2488 x 1056 market viewpoint.
- Mandatory photography: market evidence may be a curve, number, event, comparison, or causal relationship.
- Universal font and icon bans: Cuebook follows its own product and data-legibility constraints.
- Random layout selection: Cuebook derives form from the thesis and source bindings.
- Universal one-accent rules: Cuebook permits up to three semantic hues when they answer different market questions.
- Negative display tracking: Cuebook keeps letter spacing at zero for stable Chinese and bilingual composition.
