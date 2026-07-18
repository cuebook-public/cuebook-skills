<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/distill-market-commentator-profile/` from the public Skill directory.
# Distill Market Commentator Profile

Turn a bounded public or authorized corpus into `profile.v1`. Analyze repeated methods and evidence coverage; never clone a person or produce content in their voice.

## Input Modes

- `CorpusV1`: run the deterministic distiller directly.
- Authorized JSON, JSONL, or CSV: normalize with `references/modules/collect-market-commentator-corpus.md`, then distill.
- Handle, author, channel, or URL set: collect a bounded public corpus first, record every source and limitation, normalize it, then distill.

Do not bypass login, paywall, rate limit, robots policy, deleted-content controls, or platform access restrictions. Do not fill inaccessible posts or missing fields from memory.

## Workflow

1. Normalize the request with `references/modules/distill-market-commentator-profile/templates/brief-template.md`: target identity, platforms, market domains, time window, sample frame, source boundary, and allowed access. Include recent and baseline posts; do not collect only viral examples.
2. If collection is needed, use public search, supplied URLs, official feeds, or authorized exports. Prefer attributable full text and preserve canonical URL, author, platform, publication time, observation time, outbound links, and metrics availability. Stratify by platform, time, and format before comparing performance.
3. Record collection gaps explicitly. A search snippet is a discovery lead; treat it as evidence only when the underlying page is accessible and attributable.
4. Normalize raw records with `references/modules/collect-market-commentator-corpus.md`. Keep CorpusV1 as the provenance boundary.
5. Check `schema_version == "corpus.v1"`, non-empty items, and `public` or `authorized` provenance.
6. Read `references/modules/distill-market-commentator-profile/references/distillation-matrix.md`, then run:

```bash
node references/modules/distill-market-commentator-profile/scripts/distill_posts.mjs corpus-v1.json --output profile-v1.json
```

7. Validate against `references/modules/distill-market-commentator-profile/references/profile-v1.schema.json`. Review `quality_gate`, low-confidence entries, evidence item IDs, platform concentration, link coverage, and metrics availability.
8. Pass only `cuebook_bridge` and grounded map entries downstream. Apply controls by stable `rule_id`, and require the renderer to return the IDs it used.

## Safety Boundary

- Do not output sample posts, catchphrases, imitation prompts, or instructions to sound like a named living author.
- Abstract writing mechanics such as hook type, cadence, and caveat use. Keep biography, private access, and personality-dependent moves out of reusable guidance.

## Interpretation Rules

- Treat absent metrics as unavailable, never as zero. Do not rank engagement unless `engagement_ranking_available` is true.
- Compare high- and baseline-performance posts only inside a comparable platform/time/metric stratum. A handful of visible counts does not establish an effective pattern.
- Derive source domains with URL parsing from structured outbound links; do not count the post's own canonical URL as a cited source.
- Trust normalized entity tickers and explicit cashtags only. Do not infer tickers from bare uppercase tokens such as `AI`, `CPI`, or `ETF`.
- Match Chinese terms without Latin word-boundary assumptions. Preserve Chinese evidence text in CorpusV1; expose only item IDs in ProfileV1.
- Require recurrence before calling a pattern strong. A small or poorly attributed corpus must remain `caution`.

## Resources

- `references/modules/distill-market-commentator-profile/references/profile-v1.schema.json`: authoritative ProfileV1 JSON Schema.
- `references/modules/distill-market-commentator-profile/references/distillation-matrix.md`: map taxonomy, confidence model, and Cuebook bridge rules.
- `references/modules/distill-market-commentator-profile/scripts/distill_posts.mjs`: dependency-free CorpusV1-to-ProfileV1 distiller.
- `references/modules/distill-market-commentator-profile/templates/brief-template.md`: collection and distillation boundary.
- `references/modules/distill-market-commentator-profile/evals/trigger_cases.json`: routing cases, including neighbors and adversarial requests.
- `references/modules/distill-market-commentator-profile/evals/expected_artifacts.json`: ProfileV1 contract expectations.
- `references/modules/distill-market-commentator-profile/evals/rubric.md`: evidence and usefulness review.
- `references/modules/distill-market-commentator-profile/evals/failure_cases.md`: stable classifier and collection regressions.
