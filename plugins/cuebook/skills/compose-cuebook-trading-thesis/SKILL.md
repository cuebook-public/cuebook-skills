---
name: compose-cuebook-trading-thesis
description: Compose a MarketViewSemanticsV1 with genuine avoid, conditional, or explicit trade intent, CreatorViewIntentV1, creator seed, Cuebook reasoning, validated ResearchPackV1, or selected opportunity into a versioned TradingThesisV1 with attributable idea development, evidence, countercase, action state, invalidation, disclosures, and a precommitted resolution contract. Skip pure observations, sentiment witnesses, and source anecdotes; they go from semantics to expression without a thesis. Do not use for final prose, order execution, settlement, reputation scoring, feed ranking, or imitation.
---

# Compose Cuebook Trading Thesis

Turn a market view into a declaration that can be inspected later without rewriting history. The output is the canonical reasoning object; channel copy is a projection of it.

## Workflow

1. Accept a validated `MarketViewSemanticsV1`, `CreatorViewIntentV1`, `ResearchPackV1`, selected Cuebook opportunity, or bounded source packet. Stop with `not_applicable` when semantic trade intent is `none` or `observe_only`. For creator intent, map its asset, deadline, outcome, benchmark or range, evidence choices, and free text exactly; preserve the intent ref in lineage. Run projection and narrative gates upstream when an entity, ticker, proxy, or direction is not already resolved.
2. Fix `decision_cutoff_at`. Exclude evidence observed after that instant. Preserve source artifact, fact, gate, route, and opportunity references in `lineage` and `evidence_ledger`.
3. When a creator seed exists, preserve it verbatim or as a faithful summary in `idea_provenance.creator_seed`. Record each Cuebook contribution as evidence, connection, countercase, market context, or settlement rule with evidence refs. Then record the creator's decision, the idea delta, and the final trade idea. Never fabricate a seed or let Cuebook claim work unsupported by its evidence refs.
4. Write one falsifiable claim for one primary instrument. Record `why_now`, direction, horizon, confidence, and optional probability. A probability requires a stated basis.
5. Build the reasoning graph: mechanisms, supporting evidence, challenging evidence, unresolved gaps, and at least two scenarios for a directional thesis.
6. Describe the setup without writing an order. Preserve the reference quote's exact basis (`last_trade`, `last_close`, midpoint, NAV, or settlement), timestamp, source, and market state. Record `action_state`, entry or trigger condition, catalysts, and invalidation. Do not add position size, leverage, order type, or personalized action.
7. Precommit the resolution contract before activation. Name the metric, operator, threshold, observation basis, time window, authoritative source, benchmark when needed, fallback policy, and scoring modes.
8. Record public disclosure state for position, commercial relationship, identity, and AI assistance. AI-authored or AI-assisted public theses must say so.
9. Keep `wait_for_trigger` work in `draft` or `conditional` until a lifecycle event activates it. Move an immediate thesis to `ready` only after evidence and resolution gates pass.
10. To freeze, set `lifecycle_state` to `frozen`, compute the canonical hash with `scripts/validate_trading_thesis.py --print-canonical-hash`, store it in `lineage.canonical_hash`, and validate again. Any substantive change after freeze becomes a new revision or linked thesis.
11. Route the frozen thesis downstream. Use `$plan-market-content-program` for a release family, `$render-cuebook-market-post` for compact text, `$render-cuebook-market-media` for structured media, `$render-cuebook-thesis-chart` for a claim-bound market chart, `$compute-cuebook-market-indicators` for deterministic OHLCV evidence, `$assemble-cuebook-viewpoint-card` for the product preview, and `$prepare-market-content-release` for final handoff.

Read `references/thesis-protocol.md` before composing or revising a thesis.

## Hard Gates

- A ready or frozen directional thesis needs sourced current evidence, challenging evidence, a falsifier, at least two scenarios, and a complete resolution contract.
- Evidence or a reference observation dated after `decision_cutoff_at` cannot support the declaration.
- A proxy requires an explicit causal bridge and a passed or cautioned projection gate. A `watch_only` mapping cannot be frozen as a directional call.
- A resolution window must begin at or after the decision cutoff and end after it begins.
- A public frozen thesis requires known position, commercial, identity, and AI-assistance disclosure states.
- `brier` scoring requires a probability. Relative-performance scoring requires a benchmark.
- A stale target already crossed before the decision cutoff must be repaired using verified market data before freeze.
- A numeric reference observation without quote basis, timestamp, source, and market state cannot become ready.
- `wait_for_trigger` needs an explicit trigger and remains conditional until activation. `observe_only` or `avoid` cannot masquerade as an active long or short call.
- Public Cuebook attribution requires `idea_provenance.mode: cuebook_assisted`, a real creator seed, and evidence-linked Cuebook contributions.
- A `CreatorViewIntentV1` free-text field remains creator-owned. AI additions belong in Cuebook contribution fields and downstream evidence blocks, never in a silently rewritten seed.
- Personalized instructions, leverage, position sizing, credentials, and order placement are out of scope.

## Protocol Boundary

`TradingThesisV1` is an immutable declaration after freeze. Activation, expiry, invalidation, challenge, supersession, settlement, dispute, and retraction belong to an append-only lifecycle service. Market observations and `ThesisOutcomeV1` belong to a deterministic settlement service. Reputation is computed from outcomes with coverage and calibration, never written by this skill.

## Output Contract

Return the exact shape in `references/trading-thesis-v1.schema.json`. Validate it with:

```bash
python scripts/validate_trading_thesis.py trading-thesis-v1.json
```

To prepare a frozen object, calculate its hash after setting `lifecycle_state` to `frozen` and leaving `lineage.canonical_hash` null:

```bash
python scripts/validate_trading_thesis.py trading-thesis-v1.json --print-canonical-hash
```

## Resources

- `references/thesis-protocol.md`: product semantics, lifecycle, settlement, and rendering boundary.
- `references/trading-thesis-v1.schema.json`: authoritative declaration contract.
- `scripts/validate_trading_thesis.py`: deterministic cross-reference, cutoff, resolution, disclosure, and hash checks.
- `tests/test_validate_trading_thesis.py`: regression suite.
- `evals/trigger_cases.json`: routing examples.
- `evals/rubric.md`: quality rubric for forward evaluation.
