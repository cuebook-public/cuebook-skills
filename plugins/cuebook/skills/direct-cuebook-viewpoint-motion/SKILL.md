---
name: direct-cuebook-viewpoint-motion
description: Direct an approved Cuebook viewpoint visual into a short, continuous, data-bound motion narrative as ViewpointMotionSpecV1. Use when a selected VisualDirectionSetV1 or ViewpointVisualV1 should become an animated React Feed card, motion graphic, social clip, or deterministic keyframe sequence. Preserve the creator's thesis and source bindings; do not invent curves, turn every element into a transition, force audio, or animate before a static visual direction has been approved.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires Node.js 18+ for validators.
---

# Direct Cuebook Viewpoint Motion

Turn one approved viewpoint visual into motion that explains the trade logic. Motion is a publishing layer over the same claim, evidence, and data bindings.

## Workflow

1. Require a selected `VisualDirectionSetV1` and its rendered `ViewpointVisualV1` poster. If the visual direction is unresolved, run `$direct-cuebook-viewpoint-visual` first; its three real previews are the design-choice surface.
2. Freeze and preserve the selected direction's `layout_system`, claim, because, implication, reading order, spatial skeleton, motif, and binding refs. Motion may reveal or transform elements inside that composition; it may not choose a new grid, type scale, density, or reading order.
3. Read `references/huashu-adaptation-v1.md`. Use its content-derived form, continuous hero, uneven rhythm, hold frames, deterministic keyframes, and critique discipline.
4. Answer six motion questions:
   - **Role**: conviction, evidence, mechanism, strategy, or settlement?
   - **Distance**: 622px Feed preview, expanded Feed, or exported social clip?
   - **Temperature**: urgent, skeptical, calm, analytical, or contrarian?
   - **Capacity**: what can move while the claim remains readable at every keyframe?
   - **Motif**: which visual relationship belongs to this thesis alone?
   - **Continuity**: which one hero element persists and changes state across the full piece?
5. Choose one persistent hero: observed price path, key number, event marker, relative spread, causal path, risk ladder, or settlement line. A headline may be the hero when the view is primarily rhetorical.
6. Write 4-7 beats. Default Feed rhythm is `hook -> evidence -> mechanism -> view -> hold`; settlement is optional. Use uneven timing and leave at least 450ms for the final readable state.
7. Bind every beat to existing binding refs. Observed or reported material stays solid. Conditional or future material stays dashed. Never animate qualitative evidence as a quantitative magnitude.
8. Author `ViewpointMotionSpecV1`, validate it, then hand it to `$render-cuebook-viewpoint-motion`.
9. Inspect poster, 4-7 deterministic keyframes, reduced-motion output, and the complete playback. Revise the motion spec when a frame loses the claim or creates false causal certainty.

```bash
node scripts/validate_viewpoint_motion_spec.mjs viewpoint-motion-spec-v1.json
```

## Timing Defaults

- Cuebook Feed: 3.2-5.0 seconds, autoplay once when substantially in view, no loop.
- Expanded Feed: 4-7 seconds.
- Social explainer: 6-12 seconds; keep one thesis and one visual hero.
- Final hold: at least 450ms and preferably 15% of total duration.
- Use one memorable motion peak. The rest supports reading.

## Motion Semantics

- Historical or observed paths reveal from left to right and remain solid.
- The `now` boundary may arrive as a vertical line only when time separation matters.
- Future, conditional, or creator-projected paths reveal after `now` and remain dashed.
- News enters at its timestamp or causal position; it does not float as decoration.
- Numbers count only when the change itself carries meaning. Otherwise reveal the final value directly.
- Causal paths light in reading order. Keep uncertainty visible through wording and geometry.
- Settlement appears only when deadline or threshold is part of the public argument.

## Hard Gates

- No motion plan without an approved static visual and poster fallback.
- No layout redesign inside the motion Skill. Return to `$direct-cuebook-viewpoint-visual` when hierarchy, grid, or typography needs to change.
- No unrelated full-screen cuts or repeated fade-up scenes. The hero must persist or transform continuously.
- No autoplay audio in the Cuebook Feed. Audio is an explicit export option.
- No infinite loops, decorative cursor choreography, fake loading, or motion that delays the claim.
- `prefers-reduced-motion` must resolve to the complete static poster or final readable frame.
- External time control is mandatory so screenshots and video frames are deterministic.
- Every keyframe must remain understandable at 622 x 264, and the static publication poster must remain exactly 2488 x 1056.

## Resources

- `references/huashu-adaptation-v1.md`: Huashu-derived methods adapted to Cuebook.
- `references/viewpoint-motion-spec-v1.schema.json`: canonical motion-direction contract.
- `scripts/validate_viewpoint_motion_spec.mjs`: structural and semantic validator.
