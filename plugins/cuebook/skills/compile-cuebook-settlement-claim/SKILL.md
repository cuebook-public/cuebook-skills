---
name: compile-cuebook-settlement-claim
description: Compile a settlement-eligible CreatorExpressionPlanV1, finalized Cuebook market post, PostV1, or TradingThesisV1 into one primary, machine-settleable SettlementClaimV1 plus a readable summary and one-line footer. Supports fixed deadlines and trigger-activated views whose horizon ends at a sourced protocol event such as the next Bitcoin halving. Use after the expression fingerprint is locked or after content writing when the semantics contain a creator-owned forward commitment with an asset, direction, and horizon. Return not_applicable for pure observations, sentiment witnesses, anecdotes, or retrospective attribution. Do not fetch outcomes, score reputation, place trades, invent missing fields, or rewrite a frozen thesis.
---

# Compile Cuebook Settlement Claim

Keep the post readable. Compile its main forward-looking commitment into a separate contract that can be frozen beside the published content.

## Workflow

1. Accept finalized prose, `PostV1`, `CreatorExpressionPlanV1`, or `TradingThesisV1`. For candidate fast paths, prefer the locked expression plan so settlement can run beside text and visual generation. Preserve its artifact reference and decision cutoff. Require `settlement_eligibility.eligible: true` when an expression plan exists; otherwise return `not_applicable` without manufacturing a claim. When a frozen thesis exists, project its subject, direction, and resolution exactly; block any conflict.
2. Select one primary claim per content item. If the copy makes unrelated forecasts, return separate candidates and require the creator to choose one before release.
3. Extract asset, direction, action state, baseline, clock, horizon basis, metric, operator, threshold, observation mode, session, source, and any event or benchmark condition. Record each field as explicit, inferred, proposed, confirmed, or missing.
4. Preserve baseline quote semantics. A publication-time price may be `last_trade`, `last_close`, midpoint, NAV, spot, or an official observation. Store its exact timestamp, source, and market state. Do not relabel it to match the later settlement metric.
5. Choose a pattern from `references/settlement-patterns.md`: terminal comparison, window barrier, relative return, range, event, spread, probability, fundamental value, trigger-activated horizon, or a compound/sequence of atomic conditions. Use `intent.action_state` to distinguish immediate, trigger-dependent, observe-only, hold, avoid, and exit content.
6. Build the success condition first. Make failure its deterministic complement at expiry unless a sourced early-failure condition is explicitly declared. `wait_for_trigger` uses an ordered `sequence`: trigger first, outcome second, with the entry-price rule stated explicitly. When price and volume must confirm on the same sealed bar, compile one sourced composite signal event instead of treating them as separate moments.
7. Resolve market-session and source ambiguity. `last trade`, `close`, `intraday high`, `official settlement`, `NAV`, `spot`, and `extended-hours trade` are different observations.
8. Render two projections from the same contract: `public_view.settlement_summary` and deterministic `public_view.one_line`. A waiting directional claim renders as `条件看多` or `条件看空`.
9. Keep unconfirmed defaults in `needs_confirmation`. A suggested horizon or default `terminal official close > baseline` can help the author decide, but it cannot silently become a ready claim.
10. Validate with `scripts/validate_settlement_claim.py`. For a machine-settleable release, pass the ready or frozen claim to `$compile-cuebook-settlement-formula`; formula blockers propagate back to the claim.
11. Freeze only after the creator confirms every proposed field, the claim hash matches, and the linked settlement formula validates.

## Minimums

The public footer may show only asset, direction, deadline, and success condition. Machine settlement additionally requires:

- unambiguous instrument and venue;
- action state, trigger when applicable, and entry-price rule;
- baseline quote type, observation time, source, and market state;
- declaration time, observation window, timezone, and market session;
- a fixed timestamp or a sourced protocol-event horizon;
- metric, operator, threshold, and observation mode;
- authoritative source and ambiguity/adjustment policy.

For `USO 看多，到期高于 117.79`, use a terminal comparison: `official_close > 117.79 USD at expiry`. For `到期前摸到 119.83`, use a window barrier: `any regular-session official_close >= 119.83 USD`. They are different claims.

## Hard Gates

- Never infer an unspecified number, deadline, market session, benchmark, event definition, or data source as confirmed.
- Treat a threshold that conflicts with the asset's sourced scale or the locked upstream view as a possible transcription error. Preserve the raw token, propose the likely correction, and block freezing until the creator confirms it.
- Never use evidence observed after `declared_at` to backdate the claim.
- Never call a publication-time live quote an official close merely because expiry uses official close.
- `wait_for_trigger` requires an ordered trigger-then-outcome sequence. `observe_only`, `avoid`, and `exit` cannot be emitted as active long or short claims.
- A trigger-activated horizon may compare the terminal observation with the trigger close. Use `target.value_source: trigger_observation`; never invent that future price at publication time.
- A protocol-event horizon needs a stable event ID, public label, authoritative event source, and an outcome observed immediately after that event. An estimated calendar date may be a fallback, not the primary boundary.
- A ready or frozen claim needs no missing fields and every proposed field must be confirmed.
- A long claim cannot pass solely on a downside price condition; a short claim cannot pass solely on an upside price condition.
- Relative performance requires a named benchmark. Range conditions require ordered bounds. Event conditions require an objective event definition and source.
- Compound conditions use `all`, `any`, or ordered `sequence`. Do not merge unrelated forecasts merely to improve the chance of a win.
- A content claim bound to a frozen `TradingThesisV1` cannot change its subject, direction, probability, threshold, window, or observation basis.
- This skill compiles the contract. A separate deterministic service observes the market and produces the outcome.
- This skill owns human intent and public settlement wording. `$compile-cuebook-settlement-formula` owns executable math, typed variables, and lifecycle evaluation semantics.

## Output Contract

Return `SettlementClaimV1` from `references/settlement-claim-v1.schema.json` and validate it:

```bash
python scripts/validate_settlement_claim.py settlement-claim-v1.json
python scripts/validate_settlement_claim.py settlement-claim-v1.json --print-one-line
```

To freeze, set `state` to `frozen`, leave `lineage.canonical_hash` null, calculate the hash, then store and validate it:

```bash
python scripts/validate_settlement_claim.py settlement-claim-v1.json --print-canonical-hash
```

## Resources

- `references/settlement-patterns.md`: condition patterns, defaults, and examples.
- `references/settlement-claim-v1.schema.json`: authoritative artifact schema.
- `scripts/validate_settlement_claim.py`: contract, one-line, and hash validator.
- `tests/test_validate_settlement_claim.py`: regression tests.
- `evals/trigger_cases.json`: routing examples.
- `evals/rubric.md`: quality gate.
