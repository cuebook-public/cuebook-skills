# Cuebook Frame Expression System V2

Use this compact system before the first preview. It is the fast bridge between a creator-owned market idea, one bounded Cuebook query, and one finished Frame image. It replaces template picking with relationship-first expression planning; it does not restore the release DAG.

## 1. Compile The Viewpoint

Preserve one connected public argument:

1. **Judgment** — what the creator believes.
2. **Observation** — what was noticed or retrieved.
3. **Mechanism** — why the creator thinks the observation may matter.
4. **Implication** — what should appear next or by the horizon.
5. **Countercase** — optional; the one condition that removes the thesis's support.

Assign every beat one state:

- `observed` or `reported`: requires exact frozen Cuebook result refs;
- `derived`: requires the inputs used by the local deterministic derivation;
- `creator_view`: belongs to the creator and carries no borrowed evidence refs;
- `conditional`: a future watch, scenario, or creator-owned boundary, never an observed fact.

The mechanism may remain a strong creator view. Do not weaken it into generic neutrality, but do not recolor price co-movement as proven flow or causality.

Every market grammar also carries one `observation_test`. Its `statement` must exactly match the observed sentence in the image and appear verbatim in the Frame body. The deterministic runner evaluates that sentence from the frozen raw series—for example primary return > benchmark return, benchmark return < 0, shallower maximum drawdown, faster recovery, rolling correlation above/below a threshold, an event-window reaction, or latest close relative to an explicit threshold. A source ref alone is not support. If the calculation fails, replace the sentence with the strongest supported observation and keep the creator's mechanism as a creator view.

## 2. Divide Title, Body, And Image

- **Title**: the memorable judgment or tension.
- **Body**: one tested observation followed by the author's mechanism, intuition, and horizon in natural prose.
- **Image**: the evidence relationship, time boundary, and next observable.

The image needs its own compact visual judgment, but it must not repeat the title exactly or paste the body into the canvas. If deleting the image loses no analytical information, choose a better grammar.

## 3. Route The Analytical Relationship

Choose the relationship before the composition or surface.

| Grammar | Reader question | Required evidence | Honest future language |
| --- | --- | --- | --- |
| `curve_story` | What changed over time, and is it persisting? | one observed series | empty clock, milestones, or conditions |
| `relative_divergence` | Which asset is stronger on one synchronized basis? | two synchronized series | relative checkpoint; no pair settlement implication |
| `drawdown_recovery` | Which path absorbed stress or recovered better? | observed close series plus visible trough-to-recovery duration | recovery checkpoints |
| `correlation_shift` | Did a measured relationship change? | synchronized returns and declared rolling window | monitoring only; never causal language |
| `event_window` | What changed around a dated event? | event ref plus pre/post series | later catalysts or reaction checkpoint |
| `threshold_regime` | Which explicit level changes the state? | observed series plus sourced/user-adopted level | trigger, invalidation, or expiry |
| `scenario_lanes` | Which future conditions lead to different outcomes? | creator conditions or sourced future events | non-probabilistic lanes |
| `causal_spine` | Through which supported or creator-owned channel can this matter? | connected beats; numeric curve optional only in a later route | conditional mechanism and next footprint |
| `evidence_balance` | What supports the view, and what meaningful countercase remains? | support plus real countercase | watch condition |

Use the nearest honest grammar. Do not manufacture a chart when the available object is prose, one unsourced scalar, or a causal intuition.

## 4. Use The Curve Vocabulary

`FramePreviewFastJobV2` accepts raw frozen candle envelopes and compiles these locally:

- `raw_price`: observed price path or candles;
- `indexed_return`: one or two paths rebased to the same declared observation window;
- `relative_spread`: primary return minus synchronized benchmark return;
- `drawdown`: distance from each series' running observed peak;
- `rolling_correlation`: rolling correlation of synchronized returns with an explicit window;
- `volume_ratio`: sealed observed volume divided by the prior-window average, as a support panel only.

Use at most one main curve and one support panel. The support must answer a different question. A future directional BTC claim stays on BTC's own price axis; SPY may appear in a separate relative-strength support panel, not as the settlement axis. Do not silently construct BTC/QQQ equal-notional settlement from a comparison view.

## 5. Show Future Time Without A Fake Forecast

The declaration boundary separates observed geometry from unresolved time. Select one future mode:

- `none`: no dated horizon and no invented future region;
- `empty_clock`: a dated blank region with declaration and horizon only;
- `conditional_lanes`: confirmation and invalidation branches, not a sequence of optimistic milestones;
- `milestone_ladder`: ordered catalyst, checkpoint, confirmation, and settlement beats.

A future beat may be `reported` only with a result ref. Every beat has a concise `criterion` that can be checked: a D/session window, operator, relative-strength sign, new high/low, break, event, confirmation, invalidation, or settlement. Scenario lanes require at least one dated confirmation-side branch and one dated invalidation branch; render both as D+ plus calendar date. Creator scenarios stay `creator_view` or `conditional`. V2 deliberately has no probability fan or future-price path. Add a fan only in a later contract that supplies calibrated quantiles, model vintage, method, cutoff, and horizon.

## 6. Make Data Status Visible

Choose one honest state before rendering:

- `frozen_observed`: the exact `data_as_of` equals the Cuebook query binding and the image visibly names source, as-of date, and generated transform definition;
- `synthetic_fixture`: the image is visibly stamped “test data / not publishable” and the preview can only be conditional;
- `creator_only`: no market series or data timestamp; the image is an explicitly creator-owned causal, scenario, or evidence expression.

Never let a synthetic fallback masquerade as observed market history. Transform definitions and alt text are generated from the selected grammar and raw geometry rather than supplied as free-form model copy.

## 7. Annotate What Matters

Use no more than four annotations:

- `event`: a sourced timestamp;
- `threshold`: an explicit same-unit value;
- `regime_start`: a sourced or reproducibly derived transition date;
- `note`: a short source-bound explanation.

Attach the annotation to the point, line, or region it explains. Do not use annotations as floating footnotes, source counters, or prose storage.

## 8. Compose From The Argument

Use the grammar's compatible composition:

- `curve_stage`: dominant observed curve plus a compact reasoning rail;
- `editorial_split`: judgment/reason on one side, proof on the other;
- `divergence_field`: shared comparison field plus distinct evidence, mechanism, and implication beats;
- `timeline_rail`: known/future events above an observed reaction curve;
- `threshold_field`: the state-changing level owns the visual hierarchy;
- `scenario_field`: observed premise beside conditional future lanes;
- `causal_spine`: observation → mechanism → implication;
- `evidence_balance`: support and countercase on equal declared terms.

Choose `paper_signal`, `midnight`, `warm_editorial`, or `cool_mono` after the structure is fixed. Surface diversity never substitutes for a different grammar or reading path. For three requested alternatives, require three grammars, three compositions, and at least two surfaces.

## 9. Query Only What The Visual Needs

- Resolve each asset once.
- Always use `get_candles` for a curve transform and keep the raw envelope intact.
- Add `get_market_state` for freshness and session validation, not for an unlocked visible current price.
- Add at most one focused evidence family when material:
  - `list_market_calendar` or `list_asset_events` for a dated event window or future catalyst;
  - `get_positioning` for an explicit positioning, derivatives, ratings, or leverage object;
  - `search_news` and then `get_news_cluster` only when one identified story cluster materially supports a reported beat;
  - `get_cues` or `get_cues_detail` only when the creator selects a Cuebook story whose interpretation is itself part of the Frame.
- Keep `get_reasoning_graph` deep-only. Never expose the workflow DAG, renderer route, or metric compiler as a user-facing Tool.

Run independent reads concurrently in one Cuebook batch. A missing advanced data shape degrades the grammar; it does not trigger a broad research loop.

## 10. Validate The Actual Creative

Before returning the preview, require all of the following:

- every observed, reported, and derived beat resolves to frozen results, and the displayed observation passes its executable test;
- every visible beat, curve, event, threshold, and future marker has a distinct stable `binding_id`;
- no observed series crosses `declared_at`;
- future conditions are not rendered as observed market geometry;
- the evaluated claim matches the main axis;
- the image adds evidence/time/mechanism rather than repeating title and body;
- source, as-of, transform definition, common time axis, and any future D+/calendar labels remain visible;
- alt text is generated for the actual grammar and candidate rather than cloned between candidates;
- the 2488 x 1056 PNG is fully decodable, materially painted, accessible, wordmarked, and byte-hashed;
- no mutable current/entry price is printed before a backend quote or entry lock.

The runner emits one `FramePreviewV1` for downstream compatibility. V2 grammar, composition, transforms, source bindings, and time language remain in the sidecar report. Treat the output as a `finished_bitmap` when selected so release does not silently redesign the pixels the creator approved.
