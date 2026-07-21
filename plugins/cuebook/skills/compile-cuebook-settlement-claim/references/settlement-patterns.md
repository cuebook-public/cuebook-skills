# Settlement Patterns

## Baseline versus settlement observation

Keep the publication baseline and settlement metric independent. Example: a post may use a `28.33 USD` `last_trade` observed during premarket as its baseline while success uses the official regular-session close at expiry. Preserve baseline `observation_basis`, `observed_at`, `market_state`, and source. Never upgrade a current quote into an official close.

## Conditional action

For content that says wait for confirmation, set `intent.action_state` to `wait_for_trigger`, name the first condition in `trigger_condition_ref`, and use `success.logic: sequence`. The first condition is the trigger; the second is the outcome. State whether entry uses the publication baseline or the trigger observation. Keep the artifact in `needs_confirmation` until every proposed trigger, clock, and source is confirmed.

When several facts must hold on the same sealed market bar, model them as one versioned signal event. Example: `BTC UTC daily close > 65,000 USD AND sealed-bar volume / mean(previous 20 sealed bars) >= 1.0`. The event source must expose the bar, ratio, lookback, and detector version.

## Trigger-activated horizon

Some views start only after confirmation and then remain active through a market or protocol cycle. Use `clock.end_mode: protocol_event`, keep `clock.window_end` null, and provide `end_event_ref`, `end_event_label`, and `end_event_source_ref`. The outcome uses `observation_mode: first_after_event` and the same event reference. When success means the asset ends the cycle above the activation close, set `target.value_source: trigger_observation` and leave the numeric target null.

Example public projection:

`BTC conditional long | through the next BTC halving | a high-volume daily close above 65,000 -> first post-halving daily close > trigger close | pending confirmation`

## Field Policy

Classify every value:

- `explicit`: stated in the content or supplied artifact.
- `inferred`: deterministic mapping, such as `$USO` to `USO:ARCX` from an approved instrument registry.
- `proposed`: a creator choice suggested by the skill.
- `confirmed`: a proposed value accepted by the creator.
- `missing`: required and unresolved.

Proposals remain `needs_confirmation`. Typical proposals include a default horizon, official-close basis, regular session, or terminal return above the publication baseline.

## Patterns

| Pattern | Meaning | Required fields | Example |
| --- | --- | --- | --- |
| `terminal_value` | One observation at expiry | metric, operator, value, deadline | At Jul 17 close, USO > 117.79 |
| `window_barrier` | Any or every observation in a window | metric, operator, value, observation mode | Before Jul 17, any official close >= 119.83 |
| `relative_return` | Asset return versus benchmark | benchmark, return window, operator, threshold | AAPL beats SPY by > 3% |
| `range` | Value finishes or remains inside bounds | lower, upper, observation mode | BTC close between 90k and 100k |
| `event` | Objective event occurs or does not occur | event definition, deadline, source | SEC approval occurs by date |
| `spread` | Named spread crosses or ends beyond a level | legs/formula, operator, threshold | Brent-WTI spread > $5 |
| `probability` | Market-implied probability crosses a level | market/question ID, operator, threshold | Contract probability >= 60% |
| `fundamental` | Reported value compares with a threshold | period, accounting basis, source | Q3 revenue > $10bn |
| `triggered_horizon` | A confirmation activates a view through a fixed or event-bounded horizon | composite trigger, trigger entry rule, horizon, terminal outcome | BTC confirms above 65k on volume, then stays bullish through the next halving |

Use `success.logic` for complex claims:

- `all`: every condition must pass.
- `any`: at least one condition must pass.
- `sequence`: conditions must pass in array order; each condition should carry its own effective window when timing differs.

## Direction Defaults

Only propose these when the content states a direction but omits a success rule:

- `long`: terminal official regular-session close `>` publication baseline.
- `short`: terminal official regular-session close `<` publication baseline.
- `outperform`: compile to long the named asset and short the benchmark; equal-notional excess total return `> 0`.
- `underperform`: compile to short the named asset and long the benchmark; equal-notional excess total return `> 0` after the legs are oriented.
- No user-entered percentage is required for outperform/underperform. Freeze a positive excess-return margin only when the creator explicitly states one.

The deadline, source, session, and baseline still need provenance. A default is never author-confirmed merely because it is conventional.

## Observation Distinctions

- `at_expiry`: inspect one value at the deadline.
- `any_in_window`: pass when one qualifying observation occurs before expiry.
- `every_observation`: every scheduled observation must pass.
- `first_after_event`: inspect the first scheduled observation after a defined event.
- `event_by_expiry`: inspect whether an event occurred by the deadline.

Never collapse regular-session high, extended-hours trade, official close, ETF NAV, futures settlement, and spot price into one generic `price`.

## Public Projection

The full summary explains success and failure in natural language. The deterministic one-line is generated from the contract:

`USO long | through 2026-07-17 | regular-session close at expiry > 117.79 USD | pending settlement`

For a barrier:

`USO long | through 2026-07-17 | any regular-session close during the window >= 119.83 USD | pending settlement`
