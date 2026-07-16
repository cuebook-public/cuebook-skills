# Cuebook Static Design Kernel V1

## Purpose

This is the single execution order for Cuebook viewpoint art direction. It fuses the useful parts of Taste-Skill, Huashu-Design, Jakub Krehel's color/typography/UI skills, and Emil Kowalski's design-engineering practice into a finance-specific static workflow.

The kernel does not define one visual style. It defines how a creator-owned market argument becomes a clear, distinctive, source-faithful image.

## Source Method Map

| Source | Method retained in Cuebook | Enforced by |
| --- | --- | --- |
| [Taste-Skill](https://github.com/Leonxlnx/taste-skill) | design read before styling, explicit variance/density dials, redesign preserve/retire, anti-default audit, render before approval | `design_read`, structural-diversity validator, dual-size previews |
| [Huashu-Design](https://github.com/alchaincyf/huashu-design) | context-first design, five form questions, content-derived motif, three real directions, honest placeholder instead of fabricated content, rendered review | three `design_logic` values, `form_from_content`, source bindings, preview gates |
| [Academic Figure Skills](https://github.com/Azhi-ss/academic-figure-skills) | detect the user's current stage, route only the minimum sibling Skills, make palette selection conditional, and hand off structured artifacts | `VisualIntentRouteV1`, `resume_from_latest_valid_artifact`, conditional palette selection, stage-specific contracts |
| [Jakub Krehel skills](https://github.com/jakubkrehel/skills) | perceptual OKLCH color, local contrast, semantic type scale, deliberate wrapping, tabular numbers, optical alignment, coherent surface geometry | palette registry, type-scale contract, HTML linter, rendered craft review |
| [Emil Kowalski skills](https://github.com/emilkowalski/skills) | small details compound, every effect needs a purpose, optical correctness outranks mechanical sameness, perceived quality comes from the whole path | craft pass, reverse deletion, optical checks, static-only restraint |

Cuebook keeps the methods and replaces their generic web-page assumptions with market meaning, source binding, creator voice, a 1244 x 528 authoring canvas, an exact 2488 x 1056 publication raster, and a 622 x 264 reading test.

## Fixed Execution Order

### 0. Resume from the latest valid stage

- Read the locked visual intent route before loading design references.
- Reuse a valid `ViewpointDataBundleV1`, `VisualDirectionSetV1`, or selected direction instead of repeating its producer Skill.
- Run Query only for unresolved requirement refs, never as a broad default fetch.
- Load palette, chart, news, distribution, payoff, or benchmark references only when the selected intent and evidence shapes require them.

### 1. Lock meaning and truth

- Preserve direction, asset, horizon, caveat, creator ownership, and source cutoff.
- Resolve facts, current values, series, and event status upstream.
- Declare upstream input, fact, and data-requirement refs; preserve each binding's request class, materiality, and display selection.
- Use a bound placeholder or remove the visual element when data is missing. Never create convincing-looking evidence.

### 2. Write the Design Read

Declare format, audience, tone, creator register, reading distance, existing references, constraints, and redesign mode. Set:

- `design_variance`: structural freedom from 1 to 10;
- `visual_density`: visible information load from 1 to 10.

Higher variance changes composition. Higher density changes grouping. Neither permits decoration or unreadable type.

### 3. Compile the logic progression

Read `logic-progression-v1.md`. Build one source-linked argument spine before choosing a grid. It must connect the public claim to its strongest support and consequence without skipping the mechanism that makes the claim intelligible.

The visual hierarchy may enter from claim, evidence, mechanism, or strategy. The underlying logic progression remains stable.

### 3.5 Route the financial argument

Read `finance-visual-argument-system-v1.md`. Select one primary `market_relationship`, one compatible `argument_archetype`, and one evidence contract before choosing geometry. Then select a registered visual grammar and composition archetype.

- The relationship answers what the reader needs to compare or understand.
- The archetype explains why that relationship matters to a trader.
- The evidence contract determines which geometry is honest.
- The composition archetype determines how the argument reads at 622 x 264.

If the evidence gate fails, downgrade or return upstream. Do not select a chart merely to increase visual variety.

### 4. Answer the five form questions

1. **Role**: conviction, evidence, explanation, comparison, strategy, or tracking?
2. **Distance**: what remains legible and meaningful at 622 x 264?
3. **Temperature**: urgent, skeptical, calm, analytical, contrarian, or promotional?
4. **Capacity**: how many groups fit before hierarchy collapses?
5. **Motif**: which relationship belongs to this thesis and would fail for another one?

Write `form_from_content` in one sentence. A sentence that fits any ticker fails.

### 5. Generate three independent directions

Use the same meaning, bindings, and logic progression.

1. `product_native`: Cuebook clarity control, optimized for immediate reading.
2. `benchmark_transfer`: one verified structural principle transferred from real editorial, research, or information design.
3. `content_native`: a spatial motif derived from the thesis itself.

The three directions also use the three palette strategies exactly once. Design logic and palette strategy are independent axes. A palette swap, font swap, or radius swap never creates a new direction.

Use three different composition archetypes. At most one may be an editorial statement. A quantitative thesis includes at least one proof-led direction where evidence geometry owns roughly 55-72% of usable area.

### 6. Build hierarchy before color

- One entry group only.
- Level 1 carries the judgment or the evidence hook.
- Level 2 proves or explains it.
- Level 3 changes what happens next.
- Level 4 is expendable context.
- Four or fewer type sizes and weights.
- Claims use natural balanced wrapping. Supporting copy uses natural pretty wrapping.
- CJK copy is segmented into nowrap phrase spans before any wrapping rule applies; a semantic word or value-unit pair never splits across lines. Balanced wrapping chooses between phrases, never inside one.
- Market numbers use tabular numerals.
- Letter spacing stays at zero for stable Chinese and bilingual rendering.
- The grayscale image must retain the same reading order.
- In a proof candidate, chart or comparison geometry carries more visual weight than the headline. A big number is supporting annotation when comparison, structure, series, distribution, or payoff is the real proof.

### 7. Apply creator-adaptive semantic color

Choose palette expression after hierarchy. Keep 70-85% neutral and use one to three semantic roles. Every hue needs a market meaning plus a non-color cue. Run the deterministic palette selector and respect recent-palette history.

### 8. Complete the static craft pass

- Align optically where geometric centering looks wrong.
- Use one radius and surface rule; nested radii are concentric when nested surfaces are genuinely needed.
- Use separators, area, and whitespace before decorative cards or borders.
- Keep direct labels close to the evidence they explain.
- Keep the largest detail exceptionally refined: the claim wrap, number lockup, curve annotation, comparison seam, or causal transition.
- Remove any detail whose purpose cannot be named.

### 9. Reverse-delete

Temporarily remove every visible group. Restore it only when its absence changes the judgment, uniquely proves the judgment, or changes the catalyst, condition, horizon, or invalidation. A selected material binding is not deletable; changing it requires an upstream selection change. Prefer four to six visible groups and one evidence modality.

### 10. Render, inspect, repair

Capture 2488 x 1056 and 622 x 264; audit DOM geometry at 1244 x 528 and 622 x 264. Inspect actual pixels for:

- three-second comprehension;
- complete logic route;
- visible selected material bindings with declared upstream lineage;
- grayscale hierarchy;
- local color contrast;
- natural wrapping, no orphan words, and no CJK word split across a line break;
- optical alignment and surface consistency;
- no clipping, overlap, placeholders, or external dependencies;
- real structural difference across the three directions.

Revise failed directions internally. Text-only design descriptions are not finished candidates.

### 11. Brand lock last

Reserve the bottom-right safe zone, stamp the canonical wordmark, then run validation and capture only. Any later design mutation invalidates the lock.

## Static Scope

Motion is intentionally excluded. Static composition must already communicate the argument, evidence state, and reading sequence. Future motion may reveal the same approved logic progression; it may not repair an unclear still image.

## Cuebook Taste

Cuebook taste is a decision system, not one visual skin:

- judgment appears before taxonomy;
- evidence geometry is earned by sourced data;
- one hero and at most two supporting relationships carry the argument;
- creator voice and thesis temperature influence palette and composition without changing semantic color meaning;
- the visual remains legible at 622 x 264 and precise at 2488 x 1056;
- observed material, conditional rules, and future space remain visually distinct;
- three candidates differ by reader job, evidence entrance, spatial skeleton, and palette strategy, while preserving one meaning fingerprint.

This leaves high freedom in typography, whitespace, asymmetry, motif, and composition while keeping low freedom in financial meaning, data basis, time, source, and settlement boundaries.

## Hard Failure Conditions

- The visual presents a conclusion with no visible support or bridge.
- A connector implies a causal relationship absent from the source graph.
- All three directions share the same spatial skeleton.
- Color carries hierarchy that disappears in grayscale.
- Tiny metadata, decorative labels, or fake market marks fill unused space.
- A creator's visual voice is inferred only from bullish or bearish direction.
- A direction passes from prose intent without full and compact rendered inspection.
