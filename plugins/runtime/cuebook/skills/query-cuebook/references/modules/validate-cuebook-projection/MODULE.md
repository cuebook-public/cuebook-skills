<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/validate-cuebook-projection/` from the public Skill directory.
# Validate Cuebook Projection

Treat rejection recall as the primary metric. A clean rejection is better than polished copy on the wrong ticker.

## Workflow

1. Normalize snake_case and camelCase Cuebook fields, evidence records, assets, aliases, and timestamps.
2. Run `references/modules/validate-cuebook-projection/scripts/validate_projection.mjs` for a deterministic first pass.
3. Inspect every emitted check against `references/modules/validate-cuebook-projection/references/projection-rules.md`.
4. Add human judgment only where the script reports missing metadata or an ambiguous proxy.
5. Return `GateV1` exactly as defined in `references/modules/validate-cuebook-projection/references/gate-v1.schema.json`.

## Decision Boundary

- `pass`: evidence supports the asset and the claimed bridge.
- `caution`: the asset mapping is plausible, but a source, model line, timestamp, or derived claim still needs support.
- `reject`: the source belongs to another asset, the proxy bridge never reaches the selected asset, or a narrow event is forced into a broad ETF.

Do not silently reroute, rewrite, or repair a rejected cue. Put suggested fixes in `repairs` and source tickers in `closer_assets`.

## Claim Discipline

Keep sourced facts, derived claims, and unsupported claims separate. For current publication, require timestamps and let `render-cuebook-market-post` add attributable live context after validation.

## Resources

- `references/modules/validate-cuebook-projection/references/projection-rules.md`: gate codes and repair rules.
- `references/modules/validate-cuebook-projection/references/gate-v1.schema.json`: machine contract.
- `references/modules/validate-cuebook-projection/references/db-regression-cases.json`: representative local and production Cuebook cases.
- `references/modules/validate-cuebook-projection/scripts/validate_projection.mjs`: deterministic validator.
