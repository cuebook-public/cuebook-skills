# Upstream Provenance

Audited on 2026-07-14 without running either installer or optional external integration.

## AgriciDaniel/claude-seo

- Repository: https://github.com/AgriciDaniel/claude-seo
- Audited commit: `6cf1ea9fe4c2088b2ad3089797f846850fd66164`
- License: MIT
- Adopted concepts: separate technical, content, schema, and drift checks; raw observation before scoring; dependency-ordered recommendations; acceptance and falsification checks; public-URL safety; optional data integrations that remain explicit.
- Rejected as hard rules: fixed word counts, title or description lengths, keyword-density targets, universal link counts, unverified traffic or citation statistics, and ranking promises.

## yaojingang/yao-geo-skills

- Repository: https://github.com/yaojingang/yao-geo-skills
- Audited commit: `136eb92c90946ea56ec63f912d5025bcbc884f39`
- License: MIT
- SEO-adjacent concepts adopted: observed-versus-inferred evidence states, page extractability checks, source ledgers, and acceptance-ready repair lists.
- Kept outside this skill: answer-engine sampling, entity graphs, fact cards, and citation monitoring; those belong to `optimize-cuebook-market-geo`.

This skill is an independent implementation. No upstream installer, crawler, prompt library, or credential workflow is bundled.
