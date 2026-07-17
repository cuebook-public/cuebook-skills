# Creator-Adaptive Palette System

## Purpose

Color is part of the creator's visual voice, not a global bullish-green template. Preserve Cuebook's typography, source binding, semantic roles, and wordmark while allowing different creators and different thesis structures to feel visibly distinct.

Use this system after the message hierarchy is clear and before authoring HTML. The palette never decides the argument.

## Two-Layer Model

1. **Semantic role** records what a mark means: `positive`, `negative`, `observed`, `catalyst`, `conditional`, `comparison`, or `risk`.
2. **Palette expression** decides the actual hue, neutral temperature, contrast, chroma, and surface for this creator and this post.

Role and hue are intentionally separate. A positive view may use mint, lime, cyan, or a restrained cobalt accent when the label, position, and geometry already state the direction. Within one image, keep each role's token stable. Never depend on hue alone.

## Inputs

Read `CreatorExpressionPlanV1.voice_spec` when available:

- `register` describes the creator's public persona;
- `energy` and `conviction` influence contrast;
- `emotionality` influences chroma;
- `technicality` influences surface restraint and information density;
- `compression` influences how much neutral space the composition can carry.

Also classify the content and evidence:

- content: `event`, `mechanism`, `comparison`, `cycle`, `technical`, `risk`, `personal`, `macro`, `product`, `valuation`, or `flow`;
- evidence: `key_numbers`, `curve`, `causal_path`, `comparison`, `timeline`, `news`, `scenario`, `quote`, or `none`.

If a distilled creator profile exists, use it as the source. Otherwise infer from the creator's supplied text. Use the Cuebook default only when neither exists. Record the source in `design_read.creator_visual_profile`.

## Three Candidate Strategies

Every autonomous candidate set uses each strategy exactly once:

| Strategy | Job |
| --- | --- |
| `creator_native` | Closest to the creator's established energy, register, and visual signature. |
| `thesis_native` | Closest to the content mechanism and evidence modality. |
| `contrast_variant` | A credible alternative with different surface, temperature, or chroma that still preserves the same judgment. |

Use three distinct registered presets. A signature preset may lead `creator_native`, but it does not excuse cloning the same palette into the other two candidates.

Run:

```bash
node scripts/select_creator_palette.mjs palette-brief.json
```

The selector is deterministic and fast. It returns the three strategies, preset IDs, scores, and reasons. Human or frontend choice may override the ranking, but the override must keep semantic roles, contrast, and source fidelity intact.

## Preset Registry

`creator-palette-presets-v1.json` is the canonical registry. It currently covers quiet research, high-energy conviction, event risk, mechanism research, technical/crypto, macro conflict, personal narrative, cycle rotation, premium minimal expression, warm commodity-desk darkness, ledger-calm valuation, and archival long-form warmth.

Each preset contains:

- neutral surface and ink tokens;
- three accent tokens plus a risk token;
- creator, content, and evidence fit tags;
- expected energy, technicality, and emotionality ranges;
- default semantic-role-to-token mappings.

To add a palette, add a registry entry and tests. Do not invent an unregistered palette inside a one-off render.

## Anti-Repetition

- Pass the creator's last six published preset IDs when available.
- A recent preset receives a strong ranking penalty.
- A recent preset may repeat only as `creator_native` when it is the creator's explicit `signature_palette_id`.
- The candidate set must still contain three distinct preset IDs.
- Repeating a signature means retaining recognizable visual voice, not repeating the same composition, surface split, or accent allocation.

## Accessibility And Taste Gates

- Keep 70-85% of the image neutral.
- Use at most three semantic color roles.
- Pair color with type, label, position, shape, stroke, area, or solid/dashed state.
- Preserve hierarchy in grayscale.
- Keep `ink_2` at 4.5:1 or better against its primary surface. Accent tokens must reach 3:1; any accent below 4.5:1 is restricted to 24px-or-larger bold type, thick curves, substantial areas, or event boundaries. Small labels stay in ink or use a tested darker derivative.
- Do not use gradients, colored glass, full-canvas saturation, or decorative rainbow accents.
- Do not infer personality from asset direction. A bearish post by a calm researcher remains calm; a bullish post by an urgent trader remains urgent.
- Use color to amplify the creator's delivery and the thesis relationship. It must not fabricate certainty or urgency.

## Selection Examples

- Calm research memo + mechanism + key numbers: `quiet-cobalt`, `research-violet`, or `premium-monochrome`.
- Urgent event-driven short: `event-coral`, `macro-crimson`, or a restrained `signal-lime` contrast variant.
- High-energy cycle call: `signal-lime`, `cycle-indigo`, or `terminal-cyan`.
- Confessional loss story: `human-rose`, `event-coral`, or `premium-monochrome`.
- Technical crypto setup: `terminal-cyan`, `quiet-cobalt`, or `cycle-indigo`.
