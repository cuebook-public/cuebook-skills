---
name: collect-market-media-corpus
description: Normalize public or explicitly authorized market articles, Reddit threads, Xiaohongshu image notes, short videos, transcripts, OCR, comments, and supplied media manifests into MediaCorpusV1. Use before cross-media format distillation when the input contains sections, cards, frames, audio, subtitles, community context, or interactions that CorpusV1 cannot represent. Do not use for scraping bypass, private data, account profiling, format analysis, publishing, or writing new market content.
---

# Collect Market Media Corpus

Create a bounded, attributable `media-corpus.v1` artifact. Preserve the content units that make a medium work; do not analyze whether they are effective and do not generate replacements.

## Workflow

1. Confirm that every input is public or covered by the user's authorization. Refuse leaked, private, paywalled, deleted, or access-controlled material without explicit rights.
2. Collect only through supplied files, public pages that are normally accessible, official feeds, or authorized exports. Do not bypass login, robots controls, rate limits, anti-bot checks, or platform APIs.
3. Read `references/collection-playbook.md` before mapping sections, cards, timelines, comments, or asset rights.
4. Normalize JSON or JSONL records:

```bash
python scripts/normalize_media_corpus.py INPUT.json \
  --rights-basis public \
  --source-label "public sample set" \
  --sample-frame "recent plus baseline" \
  --output media-corpus-v1.json
```

5. Validate the result against `references/media-corpus-v1.schema.json`. Keep missing OCR, transcript, timing, comments, metrics, rules, and rights as explicit warnings.
6. Hand the artifact to `$distill-market-media-format` only when the user requests format or platform-grammar analysis.

## Contract Rules

- Preserve supplied text, transcript, OCR, card order, section order, timing, edits, and comment relationships. Normalize whitespace only.
- Represent article sections, community posts, carousel cards, voiceover, on-screen text, shots, disclosures, and source lists as ordered segments.
- Keep assets structural. Record dimensions, duration, source, and reuse rights when supplied; never infer permission from public visibility.
- Keep community context tied to the item. A Reddit format sample without subreddit rules or OP intent remains incomplete.
- Treat absent metrics as unavailable, never zero. Do not label high-engagement samples as proven formats.
- Deduplicate conservatively by external ID, canonical URL, or content fingerprint while retaining every source record.
- Emit no commentator profile, media-format rules, performance claims, generated copy, publishing action, or imitation prompt.

## Resources

- `references/media-corpus-v1.schema.json`: authoritative MediaCorpusV1 schema.
- `references/collection-playbook.md`: mapping, rights, provenance, and missing-data rules.
- `scripts/normalize_media_corpus.py`: deterministic JSON/JSONL normalizer.
- `tests/test_normalize_media_corpus.py`: regression tests for structure, provenance, and missing metrics.
