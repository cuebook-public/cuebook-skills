# Media Collection Playbook

## Input Boundary

Use supplied files, public pages, official feeds, or authorized exports. Record `public` or `authorized` as the rights basis. Public visibility does not establish the right to reuse an image, chart, audio track, or video clip; store asset reuse rights separately.

Do not use browser fingerprint evasion, stolen cookies, reverse-engineered signatures, CAPTCHA workarounds, hidden endpoints, or bulk collection that conflicts with platform rules.

## Unit Mapping

Map the smallest meaningful ordered units instead of flattening everything into one body:

| Surface | Common segment roles |
| --- | --- |
| Long-form article | `title`, `dek`, `thesis`, `evidence`, `analysis`, `valuation`, `risk`, `invalidation`, `conclusion`, `disclosure`, `source_list` |
| Reddit | `title`, `question`, `body`, `edit`, `reply`, `source_list`, `disclosure` |
| Xiaohongshu image note | `cover`, `card`, `caption`, `source_list`, `disclosure` |
| Short video | `hook`, `voiceover`, `on_screen_text`, `shot`, `evidence`, `disclosure`, `cta` |

Keep one segment per section, card, beat, subtitle block, shot, edit, or reply when the source exposes that boundary. Use `other` only when no supported role fits.

## Asset Mapping

- Store images, charts, screenshots, video, audio, and documents in `assets`.
- Link segments to assets by `asset_ids`.
- Preserve supplied OCR or transcript without silently correcting claims.
- Use `rights_status: unknown` when reuse rights are absent.
- Use `not-reusable` when the source or user explicitly limits reuse.
- A generated visual direction belongs in a downstream package, not the source corpus.

## Community Context

For community content, preserve the community name, flair, OP intent, rules URL, and the time the rules were checked. Comments and author edits are part of the medium: record their parent relationship and author role. Do not collect private profiles or infer demographics.

## Finance Compliance Context

Record supplied account qualification, content class, commercial relationship, AI label, identity disclosure, and the segment IDs that carry risk or sponsorship disclosure. For video, keep disclosure timing in the segment. Use `unknown` when the page or export does not expose a field; do not infer compliance from tone or follower count.

## Sample Frame

Describe how samples were chosen. Prefer recent plus baseline material and include ordinary items, not only highly visible posts. `sample_role` describes selection (`baseline`, `recent`, `high_attention`, `other`, `unknown`); it does not claim causal performance.

## Missing Data

Keep these as warnings rather than filling them by inference:

- no transcript or OCR for a visual/audio item;
- no segment boundaries;
- no video duration or beat timing;
- no asset rights;
- no community rules snapshot;
- no engagement metrics or observation time;
- no canonical URL, author, or publication time.
