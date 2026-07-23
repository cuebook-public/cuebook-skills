# Cuebook Canvas Craft V1

Occupation, scale drama, surface depth, and set diversity for the 1.56:1 viewpoint canvas. The other references say what a direction must not do; this contract says what a composed canvas must positively achieve. Read it with `composition-primitives-v1.md` before authoring HTML, and self-check every direction against it during the kernel craft pass.

The failure mode this contract exists to kill: a compliant but inert render — one text column beside one thin graphic floating on a flat ground, repeated three times with different palettes. That layout is the model default for a wide canvas. It passes every gate and still looks like nothing.

## The 1.56:1 canvas is short, not small

At 1244 x 800 vertical space is scarce and horizontal space is abundant. Compositions that work at 4:5 or 1:1 die here.

- Think in horizontal fields, seams, and bands. A vertical rail wastes the axis the canvas actually has.
- Full-height elements are cheap drama: a seam, an inverted panel, a bleeding numeral, or an evidence field that touches both the top and bottom edges reads as command of the canvas.
- Stacked small blocks read as a mobile layout pasted into a cinema frame. If the composition would survive unchanged at 1:1, it is not using the ratio.

## Occupation contract

- The **active field** — heroes, supports, structural surfaces, and shaped negative space that participates in the argument — must command at least 80% of canvas area. Leftover margin bands around a small centered composition do not count as design.
- Negative space must be **shaped, bounded, and singular**: at most one connected deliberate void, at most 25% of canvas area, bounded by structure on at least two sides (an axis, a seam, a panel edge), and carrying a nameable meaning (the unwritten future, silence after a verdict, the gap between price and trigger). If the void's meaning cannot be named in the `design_read`, it is leftover space — recompose.
- Evidence that is the hero should **bleed**. Take the chart, threshold field, or comparison to the canvas edges and let annotations live inside the geometry's quiet regions, instead of framing the evidence in an inset box with dead margins on four sides.
- Bound marks, labels, and curve endpoints still respect the bottom-right 218 x 93 brand safe zone. Bleed the field, not the labels: keep role containers and bound geometry clear of the zone and let only unbound background surfaces continue underneath the wordmark.

## Scale drama contract

- Every direction declares one `scale_extreme` in its `layout_system`: the single element whose size is indefensible by body-copy logic and is the direction's memory hook. It must be at least 3x the visual size of the next element class. Eligible: a display numeral (160-300px at 1244), poster claim typography (72-150px), a full-bleed evidence field, or a full-height structural seam or motif.
- A 44-56px claim beside a 340px-tall chart is two medium things; that is hierarchy without drama. Push one of them past the comfort point and let the other recede.
- Oversized numerals and glyphs may crop off a canvas edge when the value stays unambiguous; mark intentional crops with `data-overlap-ok="true"` and verify legibility at 622.
- Small type earns its keep by contrast: metadata at 23px reads as precision jewelry only when something nearby is enormous.

## Surface depth contract

- A flat single-ground canvas is a deliberate poster choice, not a default. If the direction is not a declared flat poster, build **two or three depth planes** from the preset's surface tokens: ground, one lifted or recessed field (`surface_1`, a plot band, a threshold zone), and optionally one inverted panel (ink-ground with paper text) for the claim or verdict.
- Color regions beat floating lines. A conditional threshold reads stronger as a **shaded zone** (the region above the invalidation line, the territory the thesis forbids) than as one dashed line in empty space; keep the zone tint within the preset's neutrals-plus-role system.
- A full-height inverted seam — dark panel against light field or the reverse — is the cheapest honest way to give a wide canvas an editorial spine. At most one inversion per direction.
- Depth planes are still quiet: no gradients, glows, shadows deeper than a hairline, or glass. Planes separate meaning (claim territory vs evidence territory vs condition territory), never decorate.

## Skeleton recipes at 1.56:1

Concrete starting geometry per `composition-primitives-v1.md` skeleton. Bend them; do not shrink them.

| Skeleton | 1.56:1 recipe | Compact rule |
|---|---|---|
| Poster | Claim at 84-150px owns the left/upper 55-70% as 2-3 balanced lines; one proof mark (number, micro-curve, level tick) physically interrupts or underlines the claim; ground may be fully inverted. | Claim scales to >=36px effective; proof mark stays attached. |
| Split tension | One full-height seam at roughly 34-42% or 58-66%, fields on each side in unequal surface values (one may be inverted); the seam is the argument's hinge and can carry the mechanism label. | Seam survives; fields compress but do not stack. |
| Evidence stage | Evidence bleeds to all four edges; claim sits inside the geometry's quietest region as an overlaid compact block; conditions anchor to geometry features (cutoff, threshold, deadline), not to a footer. | Same bleed; overlay text >=11px effective or relocated to the second-quietest region. |
| Processional | Reading path runs the full 1244 width through 3-5 stations with one destination verdict; stations sit on a continuous band or rail, never as floating equal cards; spacing encodes time or causal distance. | Stations compress horizontally; the destination keeps the largest mass. |
| Ladder / terrain | Ordered categories occupy one continuous full-width slope or stepped field; each step's area or elevation encodes its basis; labels sit on their steps. | Steps merge labels inward; slope geometry intact. |
| Margin note | One dominant visual (curve, number, structure) at 70-85% of canvas; one editorial annotation challenges it from a margin; the annotation's smallness is the point. | Annotation stays small but >=11px effective. |
| Freeform motif | Geometry derived from the thesis; must still declare its active field, scale extreme, and depth planes in `layout_system`. | Declare a compact recomposition explicitly. |

## Set diversity contract

Three directions are three different images, not three arrangements of the same furniture. Score the set on five axes before rendering:

1. **Entry corner**: where the eye lands first (top-left copy, center geometry, right-field numeral, seam).
2. **Dominant axis**: horizontal band flow, vertical stratification, diagonal or curve-led sweep.
3. **Ground value**: light, dark, or split/inverted — the set may not use three near-identical grounds unless the creator's voice_spec demands it.
4. **Scale extreme type**: typography, numeral, evidence field, or structural seam — no two directions may share one.
5. **Evidence integration**: full-bleed field, overlaid panel, inline interruption, or structural zone.

A valid set differs on **at least three axes between every pair** of directions. The "copy column beside a graphic on a flat ground" arrangement may appear **at most once per set** — it is the acknowledged default, permitted only where clarity genuinely beats character.

Thumbnail check before finalizing: render the three compacts side by side; squint. If two mass silhouettes match, one direction is a palette swap wearing a different chart — regenerate it with a different skeleton, axis, or ground.

## Self-check during the craft pass

Answer for each direction, in `layout_system` or the internal review note:

- What is the scale extreme, and is it >=3x its runner-up?
- What percentage of the canvas does the active field command, and what is the single deliberate void's meaning?
- How many depth planes exist, and what meaning does each separate? (Or: why is flat the choice?)
- Which of the five diversity axes does this direction own against its two siblings?
- Would this composition survive unchanged at 1:1? If yes, it is not using 1.56:1 — stretch, bleed, or split it.
