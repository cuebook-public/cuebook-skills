# Media Format Distillation Method

## Separation Model

Use four independent layers:

| Layer | Owns | Does not own |
| --- | --- | --- |
| `ProfileV1` | account attention, source habits, reasoning moves, prose mechanics | platform layout or current facts |
| `MediaFormatV1` | unit order, packaging, evidence placement, media timing, interaction contract | identity, facts, or investment conclusion |
| `ResearchPackV1` | evidence, comparators, market context, thesis, counterevidence, invalidation | platform packaging |
| `MediaPackageV1` | one grounded artifact for a requested channel and format | stronger claims than its inputs allow |

Apply them in this priority: evidence and projection gate, live policy, MediaFormatV1, then ProfileV1. A lower layer cannot relax a higher constraint.

## Target Families

### Long-Form Investment Article

Distill title/dek, thesis placement, evidence blocks, valuation assumptions, counterargument, risk, invalidation, conclusion, citations, disclosures, and comment follow-up. Keep the platform's AI and exclusivity rules outside the writing pattern.

### Community Due Diligence

Distill community, flair, OP intent, body shape, source placement, edits, replies, counterclaims, and how the author updates the thesis. The unit is the thread, not the opening post alone.

### Image Note or Carousel

Distill cover promise, card sequence, one-card-one-job density, chart or screenshot placement, source card, caption, tags, disclosures, and save-oriented utility. Do not copy visual assets or exact cover wording.

### Short Finance Video

Distill duration, hook window, timed beats, voiceover, on-screen text, visual proof, disclosure, and ending condition. Separate what is heard, read, and shown.

### Compliance Track

Measure whether the sample exposes qualification, content class, commercial relationship, AI label, identity disclosure, and risk-disclosure placement. Treat missing fields as unknown. For timed media, record whether disclosure timing is preserved; never infer legal compliance from recurrence.

## Quality Gate

- Fewer than five analyzed items: `caution`; patterns are provisional.
- Target pair below 80% of the corpus: `caution`; split the corpus.
- High-attention-only sample: `caution`; no performance inference.
- Image/video target with weak asset coverage: `caution`.
- Timed target with weak beat timing: `caution`.
- Community target without current community context and rules: `caution`.
- Invalid contract, no analyzable items, or inaccessible provenance: reject before distillation.

`performance_inference_allowed` requires at least eight analyzed items, metrics on at least 80%, and both ordinary (`baseline` or `recent`) and `high_attention` samples. It only permits association language.

## Bridge Rules

Every reusable rule needs:

- stable `rule_id`;
- one abstract action;
- weight or recurrence;
- evidence item IDs;
- no copied phrase or asset;
- no fact claim.

The renderer must return applied media rule IDs. Unsupported rules remain unused rather than being filled from general platform stereotypes.
