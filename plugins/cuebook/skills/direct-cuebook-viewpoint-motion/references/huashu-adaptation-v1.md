# Huashu Methods Adapted For Cuebook

This reference adapts design methods from [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design), an MIT-licensed design skill. Cuebook uses the methods as design discipline and adds finance-specific data integrity.

## Methods Kept

- **Form grows from content**: answer role, viewing distance, temperature, capacity, and motif before styling.
- **Visible design choice**: choose the static direction from three real previews, never from style names alone.
- **Continuous hero**: one persistent element changes state across beats so the result feels like one argument rather than animated slides.
- **Uneven rhythm**: trigger, explanation, turn, and hold receive different amounts of time.
- **Audience courtesy**: pause before and after the decisive inference; finish on a stable, screenshot-worthy frame.
- **Deterministic inspection**: expose external time, capture keyframes, inspect the rendered pixels, and verify the first and final frame.
- **Concept-first critique**: reject polished motion when the visual motif could belong to any ticker.

## Cuebook Adaptations

| General design method | Cuebook implementation |
| --- | --- |
| Three visual directions | Already handled by `direct-cuebook-viewpoint-visual`; motion starts after one real direction is selected. |
| Scene narrative | Compact 4-7 beat market argument. Feed default is 3.2-5.0 seconds. |
| Hero morph | Price path, event marker, number, spread, causal line, risk rail, or settlement line persists across beats. |
| Cinematic focus | Use opacity, scale, crop, and focus sparingly while the claim stays readable. |
| Keyframe verification | Inspect 0%, evidence, mechanism, judgment, and final hold on the 1244 x 800 authoring canvas and at 622 x 400; preserve the exact 1866 x 1200 poster. |
| Video export | React component is canonical; MP4/WebM are derivatives and the PNG poster remains the fallback. |

## Methods Deliberately Changed

- Feed motion is silent by default. Sound may be added for an explicitly requested social export.
- No Huashu watermark, brand-film ending, random style wheel, decorative stock imagery, or forced logo reveal.
- No mandatory 20-second cinematic structure. Trading viewpoints need faster comprehension.
- No presentation-style progress chrome inside the public card.

## Finance-Specific Gates

- Source bindings survive into every animated number, curve, level, date, event, and relationship.
- Solid geometry means observed or reported. Dashed geometry means conditional or future.
- Motion order cannot imply stronger causality than the source supports.
- A price path needs an ordered sourced series. A qualitative claim may use a causal path or typographic tension instead.
- Settlement mechanics stay outside the public animation unless time or threshold is central to the thesis.
