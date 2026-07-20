# Launch Visual Copy Contract

Use this contract for frontend-selectable Cuebook Feed visuals. The image amplifies one market judgment; it does not carry the full research record.

## Keep

- one claim;
- one proof block or one causal relationship;
- one catalyst, horizon, next observable, or explicit invalidation when it changes the trade;
- optional ticker and the mandatory canonical Cuebook wordmark.

Every visible string must change the judgment, prove it, or change what happens next. Delete anything that merely demonstrates research completeness.

## Move Outside The Image

- legal and product disclosures;
- source names, methodology, evidence counts, and freshness narration;
- settlement wording unless the threshold or deadline is the visual argument;
- repeated ticker, direction, horizon, or explanatory prose;
- UI labels and decorative metadata.

Public disclosures stay beside the visual in the candidate payload. They never compete with the viewpoint inside the bitmap.

## Material Evidence

- Declare upstream `input_refs`, `fact_refs`, and `data_requirement_refs` in `VisualDirectionSetV1`; every binding source ref must resolve to one of them.
- Copy `request_class` and `material_to_claim` from the upstream requirement and set `selected_for_display` for the evidence chosen for the image.
- A selected material news anchor, valuation metric, comparison metric, market series, official event, price level, or settlement reference survives in every master and at phone display scale. Reverse deletion cannot remove it.
- A missing material anchor blocks a selectable set. Do not replace it with a generic phrase, proxy, or decorative mark.

## Hard Copy Budget

- total visible text: 120 characters;
- claim role: 32;
- evidence role: 60;
- condition role: 28;
- context role: 18;
- brand role: 0 visible characters; SVG only;
- at most eight visible role groups.

Prefer 55-95 total characters. Use the remaining budget only for a data-led comparison or timeline whose labels carry real meaning.

## Line Breaking

- Mark the root `data-cuebook-visual-contract="launch-v1"`.
- Mark every visible text container with `data-role="claim|evidence|condition|context|brand"`.
- Do not place `<br>` inside the claim. Use `text-wrap: balance`, a deliberate width, and natural wrapping.
- Keep the claim to two authored lines and ensure it remains readable when the same master is displayed at 622 x 264.
- Keep verb-object phrases, ticker-action phrases, dates, values, and units together.
- CJK text breaks between any two characters by default, so `text-wrap: balance` alone cannot protect a word. Segment every visible CJK string — claim, evidence, and condition alike — into semantic phrase spans (`<span class="w">` with `white-space: nowrap`) so lines can break only between phrases.
- A CJK semantic word — a market term such as `油价`, `库存`, or `增产`, a proper name, a ticker phrase, or a value with its unit — must never split across lines in the publication master.
- Attach trailing punctuation to the preceding phrase span. No rendered line may start with a closing punctuation mark or end with an opening one.
- Reject orphan lines made only of a connector, modal, or short verb such as `拿到`, `因为`, `所以`, or `但是`.
- Rewrite before reducing the claim below 64px at the 1244 canvas.

## Composition

- One element owns the canvas. Supporting text must be visibly quieter.
- Do not add a footer band unless the catalyst or deadline is part of the argument.
- Prefer whitespace over a third support.
- Use one dominant semantic color role plus one support role; add a third only when it answers a different market question. Keep hierarchy readable in grayscale.
- Mark the root with `data-entry-role`, `data-color-system="semantic-v1"`, `data-palette-family`, `data-palette-strategy`, and `data-palette-preset`. The family and preset IDs must match the registry. Mark every non-brand visible group with `data-visual-level="1|2|3|4"`, and every chromatic element with a supported `data-color-role`.
- Generated CSS text is forbidden. Factual labels must exist in HTML and carry a role and source binding.
- A `data-binding-ref` counts only inside the launch root when it is visibly rendered on or inside a non-brand `data-role` or `data-logic-step-id` element and labels visible text or geometry. `hidden`, `aria-hidden="true"`, `display:none`, `visibility:hidden`, zero opacity, empty markers, and unrelated metadata fail the binding audit.
- Put bindings directly on text or SVG data geometry. For meaningful CSS-only geometry, add `data-binding-display="geometry"`; the rendered audit still verifies nonzero visible bounds at full and phone display scales.
- Decorative HTML and SVG remain unbound. They may use `aria-hidden="true"` and need no launch role, visual level, or logic-step marker when they carry no visible copy or evidence.
- Reserve the bottom-right 218 x 93 safe zone. Argument text, labels, curve endpoints, and data marks cannot enter it.

## Final Brand Lock

- The last HTML mutation is `scripts/stamp_cuebook_wordmark.mjs`.
- Use the exact canonical SVG at `right: 41px`, `bottom: 34px`, `width: 136px`, and `height: 26px` on the 1244 x 528 authoring canvas.
- Use `#F2F3F4` on dark local backgrounds and `#101411` on light local backgrounds.
- Do not add visible `Cuebook` text, a `C` badge, pill, plate, border, or shadow.
- The 2x publication capture yields a 272 x 52 mark. At 622 x 264, scale or override all four geometry values by exactly one half.
- After brand lock, run the launch linter and production capture. A later design mutation invalidates the lock.

## Automatic Reduction Order

When the visual is crowded, remove in this order:

1. disclosure and source note;
2. repeated context;
3. explanatory sentence already encoded by the composition;
4. third support;
5. optional context label that repeats ticker, direction, or horizon.

Never solve crowding with tiny type or awkward manual line breaks.
The canonical wordmark is fixed product furniture and is never removed to solve crowding.

## Reverse-Deletion Gate

Hide every visible group once before brand lock. Restore it only when removing it changes the judgment, supplies the unique proof, or changes what happens next.

- Prefer four to six visible role groups; eight is a hard ceiling.
- Default to one evidence modality: number, curve, causal path, comparison, or timeline.
- Remove repeated implications, duplicate ticker or horizon labels, unexplained acronyms, ornamental arrows, diamonds, badges, and captions that merely narrate the geometry.
- A value labeled on evidence geometry counts as stated. Restating it in claim or support copy is a repeated fact; the rendered audit rejects display-scale restatements. Reserve `data-value-restate-ok="true"` for the single case where the restated value is the claim itself and the geometry proves its composition rather than the same scalar.
- Never remove a binding marked both `material_to_claim` and `selected_for_display`; change the upstream selection first if it no longer belongs in the image.
- Whitespace is a valid result. Never fill it with another fact simply because data exists.
