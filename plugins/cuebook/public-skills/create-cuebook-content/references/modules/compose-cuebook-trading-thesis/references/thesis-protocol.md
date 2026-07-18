# Cuebook Trading Thesis Protocol

## Product invariant

A Cuebook thesis answers one durable question:

> At the decision cutoff, what did this creator believe would happen to this instrument, why, over what window, what would disprove it, and how will the platform resolve it?

The thesis is the source of truth. A feed card, X thread, Telegram post, article, video, alert, or profile statistic is a view over that source.

## Atomic object

`TradingThesisV1` contains five inseparable commitments:

1. **Identity**: creator, instrument, direction, horizon, revision, and cutoff.
2. **Reasoning**: claim, evidence, mechanism, countercase, scenarios, and gaps.
3. **Trade shape**: observation, conditional entry, catalysts, and invalidation, without execution instructions.
4. **Resolution**: metric, operator, threshold, time window, source, fallback, and score modes fixed before activation.
5. **Integrity**: disclosures, lineage, versioning, and canonical hash.

## Idea development

When Cuebook develops a creator's idea, preserve authorship as a small provenance chain:

`creator_seed -> cuebook_contributions -> creator_decision -> idea_delta -> final_trade_idea`

Cuebook contributions must be typed and evidence-linked. They may add evidence, connect markets, surface a countercase, add market context, or propose a settlement rule. Keep this chain in internal provenance so the product can explain how the idea developed without turning the public post into workflow narration. Public copy states the creator's final judgment and support directly; required source attribution and policy-driven AI disclosure remain separate concerns.

## Quote and action semantics

The reference observation is the price available when the view was formed. Preserve whether it was a last trade, last close, midpoint, NAV, official close, settlement, or spot observation, together with source, timestamp, and market state. The later settlement metric is separate.

`action_state` distinguishes `enter_now`, `wait_for_trigger`, `observe_only`, `hold`, `avoid`, and `exit`. A thesis waiting for a trigger stays conditional until the lifecycle service records activation. This prevents a watch-style post from being scored as an immediate long or short call.

## Three records, three owners

Do not make one mutable row carry the whole product.

| Record | Owner | Mutability | Purpose |
|---|---|---|---|
| `TradingThesisV1` | thesis composer | immutable after freeze | declaration and resolution contract |
| `ThesisLifecycleEventV1` | lifecycle service | append only | activate, expire, invalidate, challenge, supersede, retract |
| `ThesisOutcomeV1` | settlement service | append only, dispute-aware | observations, result, score inputs, resolution provenance |

The feed reads a materialized `ThesisViewV1` built from these records. Settlement never edits the original claim.

## Declaration states

- `draft`: incomplete private work.
- `conditional`: useful reasoning with named missing evidence or resolution fields.
- `ready`: all declaration gates pass; still editable.
- `frozen`: canonical hash recorded; substantive edits require a new revision.

Runtime states such as scheduled, live, expired, awaiting resolution, settled, disputed, invalidated, superseded, and retracted are derived from lifecycle events and outcomes.

## Revision rules

- Typography or channel formatting does not create a thesis revision because it lives in a rendered artifact.
- Any change to claim, asset, direction, probability, evidence selection, mechanism, horizon, invalidation, or resolution contract creates a new revision before freeze.
- After freeze, a changed view becomes a linked `update`, `fork`, `challenge`, or `supersede`; the original remains readable.
- A correction event may repair a factual label while preserving both old and corrected records. It cannot silently improve a forecast.

## Resolution rules

- The criteria must identify a result without discretionary reinterpretation after the window closes.
- The authoritative observation source and fallback source order are fixed before activation.
- Corporate actions, symbol changes, market closures, missing data, and ambiguous events use the declared adjustment and ambiguity policies.
- `binary_accuracy` answers whether the declared criterion passed.
- `brier` evaluates probabilistic calibration and requires a probability.
- `directional_accuracy`, `return`, and `excess_return` are separate views. Raw return alone must not become reputation.
- The settlement service records every observation with source, `as_of`, retrieval time, and transformation.

## Reputation rules

Aggregate reputation only after deterministic settlement. Show sample size and segment results by asset class, horizon, thesis type, and time period. Useful dimensions include calibration, directional accuracy, excess return, drawdown, timeliness, update discipline, and resolution coverage. Never collapse all dimensions into a context-free win rate.

## AI roles

- **Cold start creator**: AI may publish clearly labeled theses under an AI identity.
- **Creation copilot**: AI may assemble evidence, expose gaps, propose countercases, and draft a resolution contract.
- **Preflight judge**: AI may explain why a thesis is weak, duplicated, promotional, or hard to resolve.
- **Settlement**: deterministic data and policy code own the result; AI may summarize the outcome but cannot choose it.
- **Reputation**: deterministic aggregation owns scores; AI may explain score composition.

## Publishing projections

Every derivative stores `thesis_ref`, `revision`, and `canonical_hash`.

- Thesis card: claim, direction, horizon, confidence, top evidence, invalidation, next catalyst, resolution window, disclosure, and live status.
- Compact post: hook, claim, two proofs, countercase, and next condition.
- Thread or article: mechanism graph, scenarios, source notes, and complete resolution criteria.
- Update: new observation plus explicit relation to the original; no rewritten history.
- Outcome card: criterion, observed result, score, source, dispute state, and impact on segmented reputation.

## Product precedents

- TradingView public ideas encourage authors to explain the reason for a view, append updates to the original, and lock edits shortly after publication: https://www.tradingview.com/support/solutions/43000591338-publishing-and-updating-ideas/
- TradingView limits editing or deletion of public ideas after 15 minutes to protect historical integrity: https://www.tradingview.com/support/solutions/43000477695-i-d-like-to-edit-delete-my-idea-or-script/
- Metaculus treats resolution criteria as the backbone of a forecast and fixes open, close, and resolve timing: https://www.metaculus.com/question-writing/
- Metaculus uses proper scoring rules and time-aware forecasting scores, supporting calibration as a separate reputation dimension: https://www.metaculus.com/help/scores-faq/
