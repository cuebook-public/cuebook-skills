<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/compile-cuebook-settlement-claim/` from the public Skill directory.
# Compile Cuebook Settlement Claim

Keep the post readable. Compile its main forward-looking commitment into a separate contract that can be frozen beside the published content.

## Workflow

1. Accept finalized prose, `PostV1`, `CreatorExpressionPlanV1`, or `TradingThesisV1`. For candidate fast paths, prefer the locked expression plan so settlement can run beside text and visual generation. Preserve its artifact reference and decision cutoff. Require `settlement_eligibility.eligible: true` when an expression plan exists; otherwise return `not_applicable` without manufacturing a claim. When a frozen thesis exists, project its subject, direction, and resolution exactly; block any conflict.
2. Select one primary claim per content item. If the copy makes unrelated forecasts, return separate candidates and require the creator to choose one before release.
3. Extract asset, direction, action state, baseline, clock, horizon basis, metric, operator, threshold, observation mode, session, source, and any event or benchmark condition. Record each field as explicit, inferred, proposed, confirmed, or missing.
4. Preserve baseline quote semantics. A publication-time price may be `last_trade`, `last_close`, midpoint, NAV, spot, or an official observation. Store its exact timestamp, source, and market state. Do not relabel it to match the later settlement metric.
5. Choose a pattern from `references/modules/compile-cuebook-settlement-claim/references/settlement-patterns.md`: terminal comparison, window barrier, relative return, range, event, spread, probability, fundamental value, trigger-activated horizon, or a compound/sequence of atomic conditions. Use `intent.action_state` to distinguish immediate, trigger-dependent, observe-only, hold, avoid, and exit content.
6. Build the success condition first. Make failure its deterministic complement at expiry unless a sourced early-failure condition is explicitly declared. `wait_for_trigger` uses an ordered `sequence`: trigger first, outcome second, with the entry-price rule stated explicitly. When price and volume must confirm on the same sealed bar, compile one sourced composite signal event instead of treating them as separate moments.
7. For every new eligible single-asset `long` or `short` Frame, use the standard exact-deadline observation policy advertised by Frame: the server captures the publication baseline and selects the authoritative completed price observation at or before the exact deadline. Keep source, market state, grace, adjustments, and sealing explicit inside the contract, but never ask the creator to choose regular hours, after hours, trading days, or next eligible close. Retain older session-specific contracts only for backward-compatible reading and resolution.
8. Render two projections from the same contract: `public_view.settlement_summary` and deterministic `public_view.one_line`. A waiting directional claim renders as `conditional long` or `conditional short`.
9. A creator-owned target, pair, asset, direction, or horizon remains `needs_confirmation` until supplied. There is no default horizon. A Cue-informed horizon is usable only when the creator requested timing help and explicitly accepted the proposal; an already stated time always wins. The standard single-asset zero-threshold rule is policy-derived after explicit publish intent and does not require a second prompt; the same publish action confirms the selected Frame and its exact-deadline contract.
10. Validate with `references/modules/compile-cuebook-settlement-claim/scripts/validate_settlement_claim.mjs`. For a machine-settleable release, pass the ready or frozen claim to `references/modules/compile-cuebook-settlement-formula.md`; formula blockers propagate back to the claim.
11. Freeze only after the creator confirms every creator-owned term, the standard policy fills only its deterministic internal fields, the claim hash matches, and the linked settlement formula validates.

## Minimums

The public footer may show only asset, direction, deadline, and success condition. Machine settlement additionally requires:

- unambiguous instrument and venue;
- action state, trigger when applicable, and entry-price rule;
- baseline quote type, observation time, source, and market state;
- declaration time, observation window, timezone, and market session;
- a fixed timestamp or a sourced protocol-event horizon;
- metric, operator, threshold, and observation mode;
- authoritative source and ambiguity/adjustment policy.

For `USO long, above 117.79 at expiry`, use a terminal comparison: `official_close > 117.79 USD at expiry`. For `touches 119.83 before expiry`, use a window barrier: `any regular-session official_close >= 119.83 USD`. They are different claims.

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
- This skill owns human intent and public settlement wording. `references/modules/compile-cuebook-settlement-formula.md` owns executable math, typed variables, and lifecycle evaluation semantics.

## Output Contract

Return `SettlementClaimV1` from `references/modules/compile-cuebook-settlement-claim/references/settlement-claim-v1.schema.json` and validate it:

```bash
node references/modules/compile-cuebook-settlement-claim/scripts/validate_settlement_claim.mjs settlement-claim-v1.json
node references/modules/compile-cuebook-settlement-claim/scripts/validate_settlement_claim.mjs settlement-claim-v1.json --print-one-line
```

To freeze, set `state` to `frozen`, leave `lineage.canonical_hash` null, calculate the hash, then store and validate it:

```bash
node references/modules/compile-cuebook-settlement-claim/scripts/validate_settlement_claim.mjs settlement-claim-v1.json --print-canonical-hash
```

## Resources

- `references/modules/compile-cuebook-settlement-claim/references/settlement-patterns.md`: condition patterns, defaults, and examples.
- `references/modules/compile-cuebook-settlement-claim/references/settlement-claim-v1.schema.json`: authoritative artifact schema.
- `references/modules/compile-cuebook-settlement-claim/scripts/validate_settlement_claim.mjs`: contract, one-line, and hash validator.
- `references/modules/compile-cuebook-settlement-claim/evals/trigger_cases.json`: routing examples.
- `references/modules/compile-cuebook-settlement-claim/evals/rubric.md`: quality gate.
