# CorpusV1 Collection Playbook

Use this reference to turn already accessible material into `corpus.v1`. Collection ends at normalization; profile analysis belongs to `../../distill-market-commentator-profile/SKILL.md`.

## Source Boundary

Accept only:

- public pages or public exports;
- user-owned archives and exports;
- API or platform data obtained under valid authorization;
- licensed material whose use permits this analysis.

Reject or omit leaked messages, private DMs, bypassed paywalls, undisclosed personal data, and material whose authorization is unclear. Set `--rights-basis public` or `authorized`; never guess it from the file.

## Input Shapes

Accept `.json`, `.jsonl`, and `.csv` in UTF-8.

- JSON may be an array or an object containing `items`, `posts`, `tweets`, `records`, or `data`.
- JSONL must contain one object per non-empty line.
- CSV headers may use common export aliases. Nested `author`, `links`, `entities`, `metrics`, and `provenance` cells may contain JSON.
- Combine formats by passing multiple input paths in one command.

## Canonical Fields

| CorpusV1 field | Common input aliases |
| --- | --- |
| `text` | `text`, `full_text`, `content`, `body`, `tweet`, `post`, `message` |
| `created_at` | `created_at`, `published_at`, `timestamp`, `date`, `time` |
| `url` | `url`, `permalink`, `post_url`, `canonical_url` |
| `external_id` | `external_id`, `post_id`, `tweet_id`, `status_id`, `id` |
| `platform` | `platform`, `source_platform`, `channel_type` |
| author | nested `author`, or `author_name`/`name` and `author_handle`/`handle`/`username` |
| links | `links`, `urls`, `outbound_links`, plus explicit URLs in text |
| entities | nested `entities`, plus `tickers`, `hashtags`, `mentions`, and named-entity lists |
| metrics | nested `metrics`/`public_metrics`, or common count fields such as `like_count` |

Use `--default-platform`, `--default-author-name`, and `--default-author-handle` only to fill missing values. Do not overwrite supplied attribution.

## Text And Language

- Decode and emit UTF-8 with `ensure_ascii=false`.
- Preserve Chinese and mixed-language source text. Normalize Unicode to NFC, line endings, and repeated horizontal whitespace only.
- Detect `zh`, `en`, `mixed`, or `und` when no language field exists. Treat language detection as metadata, not translation.
- Skip empty-text records and report them in `quality.warnings`.

## Links And Domains

- Keep the post's canonical URL in `item.url`; keep outbound citations and media links in `item.links`.
- Lowercase and IDNA-normalize hostnames, remove fragments/default ports, and remove known tracking query parameters.
- Derive `domain` with URL parsing. Never derive it with path-splitting regexes.
- Preserve a supplied link title when present; map unknown link kinds to `other`.

## Entities And Tickers

- Preserve supplied entity lists and extract hashtags, mentions, explicit `$CASHTAGS`, and exchange-qualified symbols.
- Do not infer tickers from bare uppercase words. Tokens such as `AI`, `CPI`, `ETF`, `YES`, and `NO` are not ticker evidence by themselves.
- Normalize ticker symbols to uppercase; preserve names and Chinese named entities as Unicode strings.

## Metrics Availability

- Store only observed numeric values in `metrics.values`.
- Set `metrics.available` from the presence of at least one value and enumerate absent core fields in `metrics.missing`.
- Parse commas and `K/M/B` or Chinese `万/亿` count suffixes. Do not convert a missing, invalid, or hidden metric to zero.
- When duplicates contain different snapshots, retain the maximum observed count per field and the latest valid observation time.

## Deduplication And Provenance

Match conservatively by platform plus external ID, canonical post URL, or a normalized-content fingerprint tied to author/time context. Do not use fuzzy semantic similarity.

When records merge:

- keep the richer text and non-empty attribution;
- union links and entities;
- merge metric snapshots without fabricating missing values;
- append every source record reference;
- add `deduplicated_merge` to transformations.

The corpus and each item must retain rights basis, source label, file SHA-256, record index, record ID, source URL, and upstream provenance when supplied.

## Command

```bash
node scripts/normalize_corpus.mjs export.json archive.jsonl notes.csv \
  --rights-basis authorized \
  --source-label "user-authorized research archive" \
  --subject-name "Example Commentator" \
  --subject-handle "@example" \
  --output corpus-v1.json
```
