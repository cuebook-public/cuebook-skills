---
name: collect-market-commentator-corpus
description: Normalize public or explicitly authorized market-commentator material into the CorpusV1 contract. Use when Codex receives JSON, JSONL, or CSV exports of posts, articles, newsletters, or transcripts and must preserve Chinese text, links, entities, metrics availability, deduplication evidence, and provenance before downstream analysis. Do not use this skill to profile an author, infer a persona, imitate a living person, or draft market content.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Collect Market Commentator Corpus

Create a bounded, attributable `corpus.v1` artifact. Normalize supplied material only; do not analyze the commentator or write in their style.

## Workflow

1. Confirm every input is public or covered by the user's authorization. Do not ingest leaked, private, or access-controlled material without explicit rights.
2. Read `references/collection-playbook.md` when selecting fields, handling exports, or interpreting provenance.
3. Run the deterministic normalizer:

```bash
node scripts/normalize_corpus.mjs INPUT.json \
  --rights-basis public \
  --source-label "public account export" \
  --output corpus-v1.json
```

Pass multiple input paths to combine JSON, JSONL, and CSV files. Add `--subject-name`, repeat `--subject-handle`, or supply platform/author defaults only when the input omits them.

4. Check the output against `references/corpus-v1.schema.json`. Treat `quality.warnings` as unresolved collection limitations, not facts to fill by inference.
5. Hand the resulting CorpusV1 to `../distill-market-commentator-profile/SKILL.md` only when profile analysis is requested.

## Contract Rules

- Preserve source text in Unicode; normalize line endings and incidental whitespace without translating or paraphrasing.
- Represent outbound links, entities, and metrics structurally. Extract only explicit cashtags; never treat every uppercase token as a ticker.
- Keep absent metrics absent. `metrics.available: false` never means zero engagement.
- Deduplicate by external ID, canonical URL, and conservative content fingerprints. Merge evidence and retain every contributing source record in item provenance.
- Record the rights basis, source file digest, source record index, canonical source URL, and transformations.
- Emit no profile, quality judgment about the author, engagement strategy, writing instructions, or generated post.

## Resources

- `references/corpus-v1.schema.json`: authoritative CorpusV1 JSON Schema.
- `references/collection-playbook.md`: source, field-mapping, deduplication, and provenance rules.
- `scripts/normalize_corpus.mjs`: standard-library JSON/JSONL/CSV normalizer.
