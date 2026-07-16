# Autonomous Calibration Policy

## Goal

Deliver three selectable finished candidates without a conversational repair loop. Calibration is a production step, not public content.

## Resolution Order

1. Cuebook snapshots, OHLCV, calendar, narrative, and instrument registry.
2. Authorized creator input and validated source corpus.
3. Official issuer, exchange, regulator, protocol, or government sources.
4. Approved live quote, market-data, and news providers.
5. Honest qualitative fallback or omission.

Never fill a missing fact, curve, threshold, event time, legal right, or creator conviction from general plausibility.
Compile the creator's material premises before applying this order. A named current news event, requested metric, comparator, price level, or settlement reference remains material unless the semantics explicitly mark it as incidental.

## Material Evidence Contract

Compile material evidence into `material_evidence.requirements`. Each requirement carries its upstream `requirement_id`, one canonical `request_class`, and one or more `required_anchor_ids`. Source `kind` and requirement `request_class` answer different questions: `kind` identifies who produced the source; `request_class` identifies which material premise the anchor resolves.

| `request_class` | Required anchor payload |
| --- | --- |
| `news_anchor`, `official_event` | Linked source metadata and supported fact refs. An anchor whose source kind is `news` or `company_release` must include `published_at`; this is mandatory when the anchor is material. |
| `valuation_metric`, `comparison_metric` | Metric name, exact basis, unit, and either a finite numeric value or `value_state: N/M` with a reason. Comparisons also name the comparison subject. |
| `price_level` | Instrument ref, finite value, unit, observed time, price `observation_basis`, and market session. |
| `market_series` | Series and instrument refs, metric, interval, synchronized window, timezone, and observation basis. |
| `settlement_reference` | Bound settlement claim ref and the five eligibility fields: metric, operator, threshold, deadline, and authoritative source. |

Every candidate must include every required anchor. Preserve the same anchor ID, request class, source metadata, and typed payload across all three; copy or layout variation never authorizes evidence-type drift. A search snippet is not an anchor, `N/M` is a resolved metric result rather than missing data, and a bare price without its observation basis is unresolved.

## Fast Resolution

Resolve only primitives selected by the expression plan for public copy, visual bindings, or settlement. Do not fetch a legal detail, comparator, quote, or series merely because it exists in the source material.

Use cache keys built from entity or instrument ID, provider or source URL, source hash, observation basis, and time bucket. Recommended freshness windows:

- completed OHLC bars: immutable after provider finalization;
- forming bars and open-market quotes: 15 seconds;
- closed-market latest quote: 5 minutes;
- breaking news and official event changes: 5 minutes;
- instrument mapping and venue metadata: 24 hours;
- issuer product facts and operating metrics: reuse until the official source changes, with a 24-hour revalidation ceiling;
- policy and disclosure checks: 24 hours unless a flagged jurisdiction or product change requires refresh.

Research and market-data refresh run in parallel. Revalidate one stale primitive rather than rebuilding the research pack. A cache miss cannot cause unrelated branches to wait.

## Automatic Repairs

- Verify every volatile current fact and timestamp it.
- Separate product capability from current adoption and revenue.
- Separate creator interpretation from observed fact.
- Correct entity, ticker, venue, quote basis, and jurisdiction mismatches.
- Remove a hard number that lacks an attributable basis.
- Replace unsupported optional quantitative art with a qualitative relationship allowed by the expression plan. Do not use this repair when the missing number or event is material to the creator's stated reason.
- Compress repeated context before shrinking type.
- Regenerate clipped, generic, or mobile-illegible layouts.
- Remove stock AI transitions and internal workflow language.

## Retry Policy

Use one repair round per failed branch by default and a second only for source or rendering failure. A failed attempt is never returned. Keep passed siblings and regenerate only the failed copy or layout. Block when three source-faithful candidates cannot be produced without inventing material meaning, or when any typed material requirement remains unresolved.

## Public Copy Budget

- headline: 24 visible characters;
- body: 160 visible characters;
- close: 36 visible characters;
- total including tags: 220 visible characters;
- paragraphs: 3;
- hard numbers: 3;
- tags: 2-4, each no more than 12 characters.

Each candidate should contain one judgment, one reason, one consequence or next condition, and one material caveat when needed.

## Visual Budget

Use one dominant visual idea, one proof, and an optional condition. Keep total visible image copy at or below 120 characters and prefer 55-95. Disclosures, sources, settlement prose, and research-completeness notes stay outside the image. Preserve the same first-three-second reading order at the 1340 x 528 authoring canvas and 670 x 264 preview; publish only the exact 2680 x 1056 raster.

## Selection Semantics

- `ready_for_selection`: all three candidates passed; no content is selected.
- Selecting a candidate confirms that exact copy and visual.
- Settlement eligibility mirrors the expression-plan fields `metric`, `operator`, `threshold`, `deadline`, and `authoritative_source`; a bound claim is eligible only when all five are present.
- Selection confirms settlement only when the exact subject, direction, baseline, market session, metric, operator, threshold, deadline, and authoritative source were visibly presented and the selection receipt explicitly records all nine confirmations.
- `ready_for_selection` cannot carry a `frozen` settlement. Selected content without explicit settlement confirmation remains `needs_confirmation`; only selected and explicitly confirmed settlement becomes `frozen`.

## Public Surface

Expose only:

- candidate label;
- headline, body, close, and tags;
- full and compact visual;
- linked typed evidence anchors with source metadata plus the metric, price, series, or settlement basis required by their `request_class`;
- necessary public disclosures;
- optional one-line settlement status.

Keep calibration statuses, repairs, source routing, fingerprints, scores, and retry history internal.
