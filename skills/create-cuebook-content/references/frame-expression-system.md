# Cuebook Frame Expression System

Frame is a creator-owned pre-trade publishing medium: one memorable title, one concise body, and one image whose geometry carries the market argument. It supports intuitive single-asset views, relative and event ideas, conditional macro thinking, transparent creator-defined baskets, and long/short observation lenses. It is not a trading terminal, a research report, or a dashboard screenshot.

## 1. Preserve The Creator's Edge

Compile one meaning lock before selecting data or layout:

- `claim`: the memorable judgment the creator wants to own;
- `observation`: the behavior, event, relationship, or derived Lens state that can be shown;
- `mechanism`: why the creator thinks the observation matters;
- `implication`: what would become more plausible if the view keeps working;
- `countercase`: the creator's stop or the condition that removes the argument's support;
- `observation_window`: the frozen historical window used by the visual;
- `horizon`: the future date by which confirmation or invalidation should be revisited.

The system should enlarge the creator's original perception, not replace it with generic market commentary. Facts may be observed, reported, or derived. Claims and mechanisms remain creator-owned unless a source literally establishes them. Future implications and countercases remain conditional.

## 2. Ask Once, Then Build

Use the one-round heuristic interview from `SKILL.md`. The best question uncovers one missing edge: the anomaly, causal bridge, why-now trigger, next footprint, blind spot, or voice emphasis. Preserve the exact answer in `creator_signal` and use only what the creator adopts.

When the creator says to proceed, do not ask for more proof, price, target, invalidation, or settlement. A Fast Preview needs direction, observation window, and horizon—not a complete trade ticket.

## 3. Select An Idea Topology Before A Template

Choose the relationship that makes the idea legible in five seconds:

| Idea topology | Reader question | Grammar | Preferred composition |
| --- | --- | --- | --- |
| single-asset behavior | What changed over time? | `curve_story` | `curve_stage` or `editorial_split` |
| relative performance | Where did two paths separate? | `relative_divergence` | `divergence_field` |
| stress and recovery | Which asset absorbed pressure better? | `drawdown_recovery` | `divergence_field` or `editorial_split` |
| relationship regime | Did co-movement change? | `correlation_shift` | `editorial_split` |
| dated catalyst | What changed around an event? | `event_window` | `timeline_rail` |
| explicit trigger | What level changes the state? | `threshold_regime` | `threshold_field` |
| conditional macro view | Which future condition leads where? | `scenario_lanes` | `scenario_field` |
| transmission idea | What is the first and next footprint? | `causal_spine` | `causal_spine` |
| live support versus countercase | What is the real tension? | `evidence_balance` | `evidence_balance` |
| creator-defined observation basket | Do several transparent proxies move as one idea? | `creator_lens` | `lens_anatomy` |
| long/short expression | Is a transparent spread emerging between two sleeves? | `long_short_lens` | `contribution_stage` |

Do not choose a chart because market content is expected to contain one. Choose geometry because it answers the reader question.

## 4. Divide The Work Across Title, Body, And Image

- Title: one memorable judgment, not a topic label.
- Body: the exact tested observation, then the creator's mechanism and future horizon.
- Image: the evidence relationship, creator-owned interpretation, time boundary, component anatomy when relevant, and the next confirmation or invalidation.

The image must add something the prose cannot: comparison, curve shape, timing, contribution, branching, or transmission. Never paste the body into boxes. Never repeat the title as the image headline.

### Visual copy contract

A feed image is not a compressed research note. For chart and Lens compositions, use exactly this reading order:

1. one creator-owned claim at the top;
2. one tested observation attached to the curve, spread, threshold, event, or contribution geometry it describes;
3. one large first-person `creator_pulse` that sharpens the creator's distinctive mechanism;
4. one short `next_watch` line;
5. dated confirmation and invalidation inside unresolved future space.

Do not render observation, mechanism, and implication as three equal summary columns. Do not restate the body. A small chart-attached text scrim may protect legibility, but it must stay visually subordinate to the evidence and cannot become a floating card. Emotional value must be specific: make the creator's non-obvious perception feel recognized and publication-ready. Never use generic praise, hype, certainty, or motivational filler inside the Frame.

## 5. Use The Market Expression Route For Established Relationships

For the first nine grammars, build a `FrameMarketPreviewJob`. Pass raw frozen Cuebook envelopes to the deterministic compiler. It can derive:

- raw price or candles;
- indexed return from one common baseline;
- synchronized relative-return spread;
- drawdown and recovery duration;
- rolling return correlation with an explicit window;
- volume divided by a prior rolling average.

Use one main relationship and at most one support relationship. The support panel must answer a different question. Every displayed observation gets an executable test and bindings to the exact curve, event, threshold, or annotation that supports it.

## 6. Build A Creator Lens Only When It Adds Meaning

Use a `FrameLensPreviewJob` when the creator wants a custom basket, says “my own index,” wants several proxies to represent one thesis, or wants a long/short idea made visible.

First determine whether the name refers to a recognized official index or benchmark. If it does, resolve that canonical asset and use its official series. If no recognized index fits the creator's idea, build a **Creator Lens**; never present it as an official index.

### Component discovery

1. Start with creator-named components.
2. Use Cuebook `search_assets` to resolve them and, only when needed, discover explicit proxies for missing economic links.
3. Select 3–8 components. Record for each component:
   - ticker and canonical asset;
   - long or short side;
   - weight;
   - a concise inclusion reason;
   - origin: creator named, Cuebook discovered, or assistant proxy.
4. Fetch the smallest common `get_candles` window for all components in one parallel batch. Prefer compatible intervals and session families. If fewer than five synchronized observations remain, simplify the universe or choose a qualitative grammar; do not interpolate a convincing-looking curve.

Do not add a public MCP Tool for basket construction. The public reads remain asset discovery plus raw candles; deterministic local JavaScript performs the transparent calculation.

### Calculation

The Lens calculation is fixed:

`Lens = 100 + Σ(weight × component return since the first synchronized observation)`

- `creator_lens`: long-only weights sum to +1;
- `long_short_lens`: long weights sum to +1 and absolute short weights sum to 1;
- `equal` means equal absolute weights within each sleeve;
- the current Lens renderer supports `rebalance: none`; never claim weekly or monthly rebalancing until the compiler implements it;
- show the component weights, latest contribution in percentage points, synchronized-bar count, formula, and limitations.

### Selection honesty

Use one of two modes:

- `pre_registered`: the component universe was frozen no later than the observation start. Historical performance can serve as a forward-frozen observation.
- `retrospective_exploratory`: components were chosen after the observation window began. The visual must say it is a retrospective exploration and disclose hindsight or selection bias. Its historical curve describes the chosen proxies; it does not prove that the selection rule worked out of sample.

For a Lens invented during the current conversation, default to `retrospective_exploratory` unless the creator supplied a genuinely pre-existing basket or rule. Never backdate `universe_frozen_at`.

## 7. Make The Lens Image Explain Itself

`lens_anatomy` uses a dominant rebased curve and a component ledger with weights, reasons, origins, and contribution bars. It fits a creator asking “what collection best represents my idea?”

`contribution_stage` uses a dominant spread curve and visibly separate long and short sleeves with sleeve-level and component-level contributions. It fits a creator asking “what is winning against what?”

The detailed 2488 publication composition must show:

- a creator-owned headline with a real point of view;
- “Creator Lens” and “not an official index” language;
- source, as-of time, synchronized-bar count, base 100, weighting, selection mode, formula, and limitations;
- the observed curve only up to the declaration boundary;
- a blank future region with dated confirmation and invalidation conditions;
- the creator's countercase as visible language, not hidden metadata.

The independently composed 622 compact rendition keeps the Lens identity, observed curve or opposing sleeves, no more than the three strongest visible contributions, one unresolved future check, and minimal provenance. Formula, component reasons, synchronized-bar count, selection-mode detail, and limitations remain available in the publication view, structured references, and alt text; they must not become an unreadable miniature ledger.

## 8. Keep Future Time Rich But Unresolved

The future half of the idea can contain:

- an empty clock to the horizon;
- a reported catalyst with a frozen source;
- a checkpoint with a checkable criterion;
- a confirmation condition;
- an invalidation condition;
- scenario branches;
- an explicitly chosen later settlement point.

It cannot contain a fabricated future price path, projected candle, uncalibrated probability fan, or decorative arrow implying an outcome. A future region should make the creator's thought more falsifiable without turning the Frame into a lecture.

## 9. Design For A Feed, Not A Terminal

Frame is social-editorial. The native title and body already carry prose; the image supplies the visual insight. Use hierarchy and rhythm that survive a fast feed scan:

1. creator judgment;
2. one dominant relationship;
3. one creator pulse or anatomy layer;
4. future confirmation and invalidation;
5. source and method detail.

Use open editorial columns, tension fields, branches, rails, and contribution stages. Avoid turning every beat into the same rounded card. Do not copy navigation bars, tabs, KPI tiles, or app chrome from a dashboard reference. Borrow the useful idea—dense chart plus explanatory layers—without importing dashboard furniture.

Render publication and compact as two compositions from one meaning lock. The compact view uses a native 622 x 264 canvas, one dominant geometry, at most two essential copy groups, a 22 px essential-type floor, and one future check. It is never a uniform downscale. Preserve diversity through grayscale silhouette and reading direction, not by adding more small labels.

Surface comes after structure. `paper_signal`, `midnight`, `warm_editorial`, and `cool_mono` should change tone, not substitute for a different reading path. Three requested alternatives need different grammars or compositions, not merely different colors.

## 10. Validate Meaning And Pixels Together

A preview passes only when:

- the exact observed sentence is supported by the deterministic calculation;
- every external source is frozen and every visible component appears in candidate evidence;
- claims and mechanisms remain creator-owned while future beats remain conditional;
- the image shows every stable binding and no series crosses the declaration boundary;
- the custom construction is labeled Lens, never official index;
- retrospective selection bias is visible when applicable;
- title, body, and image do different jobs;
- no visible text is truncated;
- the SVG is accessible, contains no network asset, and uses the canonical Cuebook wordmark;
- the publication and compact PNGs are fully decodable, materially painted, exactly 2488 × 1056 and 622 × 264 respectively, and byte-hashed;
- mutable current or entry prices remain absent until a backend quote or entry lock exists.

Return the four-field public Frame immediately after these gates pass. Internal preview lineage, selection, derivatives, upload, and publication remain backstage.

## 11. Known Boundary

The current expression system does not yet express an options payoff or theta clock. A request for a straddle, skew, volatility surface, or option-specific decay should not be approximated with a price chart. Resolve a supported option contract and payoff engine in a future grammar, or clearly offer a non-options event view without pretending it represents the trade.
