---
name: distill-market-media-format
description: Distill a public or authorized MediaCorpusV1 into an evidence-backed MediaFormatV1 for long-form investment articles, Reddit posts or comments, Xiaohongshu image notes, and finance short videos. Use when the user wants reusable platform grammar, section or beat order, evidence placement, packaging, visual/audio structure, interaction behavior, and policy-aware Cuebook bridge rules. Do not use for collecting raw media, profiling a person, copying a living creator, claiming virality, drafting publishable content, or bypassing platform access controls.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Distill Market Media Format

Turn an attributable `media-corpus.v1` sample into `media-format.v1`. Distill the grammar of a medium or community, not the identity of an author.

## Input Boundary

- Accept `MediaCorpusV1` directly.
- For supplied JSON, JSONL, transcripts, OCR, screenshots, comments, or media manifests, normalize first with `$collect-market-media-corpus`.
- For URLs or handles, collect a bounded public sample without bypassing login, paywalls, robots controls, rate limits, or anti-bot systems.
- Split mixed platform/format corpora before production use. The deterministic script analyzes the dominant pair and reports concentration loss.

## Workflow

1. Define the target as a platform plus format, such as `reddit + community_post`, `xiaohongshu + image_note`, or `douyin + short_video`.
2. Check the sample frame. Include ordinary and recent examples; do not infer effectiveness from top-performing posts alone.
3. Read `references/distillation-method.md` and the relevant entry in `references/platform-policies.md`.
4. Run:

```bash
python scripts/distill_media_format.py media-corpus-v1.json \
  --output media-format-v1.json
```

5. Validate against `references/media-format-v1.schema.json`. Review target concentration, structural coverage, timing or asset coverage, community-rule coverage, and `performance_inference_allowed`.
6. Return `cuebook_bridge` rule IDs as reusable query output. A downstream Create workflow may hand them to a renderer; this Query skill never invokes a Create skill.

## Interpretation Rules

- `common` means recurrent in the bounded sample. It does not mean causal, optimal, viral, or platform-approved.
- Permit performance comparisons only when the corpus contains comparable metrics, ordinary and high-attention samples, and enough items. Even then, call the result an association.
- Keep person-level attention, source preferences, reasoning habits, and prose rhythm in `ProfileV1`. Keep section roles, card order, shot timing, packaging, and community interaction in `MediaFormatV1`.
- Abstract titles, hooks, transitions, visuals, and calls to action into roles. Do not retain signature phrases, exact templates, private biography, or identity performance.
- Preserve counterarguments, disclosures, source placement, replies, edits, and invalidation. They are part of the format, not cleanup material.
- Treat comments and engagement as discovery signals. A score, like count, or majority opinion never upgrades a claim's evidence class.
- Recheck current platform and community policy before any publish-ready render. A policy snapshot in this skill is a routing aid, not legal assurance.

## Safety Boundary

- Do not produce a style-cloning prompt or text “in the voice of” a living creator.
- Do not turn Seeking Alpha structure into an AI-written Seeking Alpha submission; current contributor rules prohibit AI-assisted article writing and rewriting.
- Do not automate Reddit promotion, karma farming, coordinated voting, or cross-community repetition.
- Do not treat publicly visible images, charts, audio, or video as reusable assets without rights.
- Do not encode personalized investment orders, leverage, position sizing, price-level instructions, or hidden sponsorship.

## Resources

- `references/media-format-v1.schema.json`: MediaFormatV1 contract.
- `references/distillation-method.md`: format taxonomy, quality gates, and bridge rules.
- `references/platform-policies.md`: dated policy routing notes and official-source links.
- `scripts/distill_media_format.py`: deterministic MediaCorpusV1 distiller.
- `tests/test_distill_media_format.py`: cross-format regression tests.
- `evals/trigger_cases.json`: positive, neighboring, mixed, and adversarial routing cases.
