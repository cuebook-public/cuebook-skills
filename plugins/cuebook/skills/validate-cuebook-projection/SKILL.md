---
name: validate-cuebook-projection
description: Validate whether Cuebook evidence supports the selected tradable asset, directness, causal bridge, and factual claims. Use for source/ticker mismatches, direct versus proxy checks, broad-index overreach, target-only analyst cards, stale evidence, or evidence-versus-inference labeling before routing or writing. Do not choose a writing lane, fetch live market data, or draft posts.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Validate Cuebook Projection

Treat rejection recall as the primary metric. A clean rejection is better than polished copy on the wrong ticker.

## Workflow

1. Normalize snake_case and camelCase Cuebook fields, evidence records, assets, aliases, and timestamps.
2. Run `scripts/validate_projection.mjs` for a deterministic first pass.
3. Inspect every emitted check against `references/projection-rules.md`.
4. Add human judgment only where the script reports missing metadata or an ambiguous proxy.
5. Return `GateV1` exactly as defined in `references/gate-v1.schema.json`.

## Decision Boundary

- `pass`: evidence supports the asset and the claimed bridge.
- `caution`: the asset mapping is plausible, but a source, model line, timestamp, or derived claim still needs support.
- `reject`: the source belongs to another asset, the proxy bridge never reaches the selected asset, or a narrow event is forced into a broad ETF.

Do not silently reroute, rewrite, or repair a rejected cue. Put suggested fixes in `repairs` and source tickers in `closer_assets`.

## Claim Discipline

Keep sourced facts, derived claims, and unsupported claims separate. For current publication, require timestamps and let `render-cuebook-market-post` add attributable live context after validation.

## Resources

- `references/projection-rules.md`: gate codes and repair rules.
- `references/gate-v1.schema.json`: machine contract.
- `references/db-regression-cases.json`: representative local and production Cuebook cases.
- `scripts/validate_projection.mjs`: deterministic validator.
- `scripts/validate_projection.test.mjs`: regression runner.
