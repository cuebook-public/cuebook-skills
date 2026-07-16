# Cuebook Visual Intent Routing V1

## Purpose

Lock the visual communication job, evidence shape, Query capabilities, Create Skill path, and renderer choice once inside `CreatorExpressionPlanV1`. Downstream Skills execute this route; they do not independently reinterpret the creator's intent.

This routing layer borrows one useful process idea from [Academic Figure Skills](https://github.com/Azhi-ss/academic-figure-skills): identify the user's current stage and run only the minimum valid downstream path. Cuebook extends that idea with market-data lineage, creator ownership, observed-versus-conditional geometry, deterministic rendering, Feed-size review, and optional settlement semantics.

## Routing Order

1. **Reader question**: write the one question the image must answer at Feed distance.
2. **Primary job**: select one communication job from the canonical registry.
3. **Three candidate jobs**: lock exactly one `fast_read`, one `proof`, and one `system` job. They share one meaning fingerprint but answer three different reader questions.
4. **Evidence shapes**: name only shapes that are supported by declared data requirements or creator-owned qualitative relationships.
5. **Query route**: bind every visual data requirement to one Query capability and its exact Cuebook MCP tool path, including asset resolution when the request is asset-bound. An existing artifact may satisfy that route at runtime; it does not change the locked capability.
6. **Skill path**: select the shortest registered Create path. Reuse a valid Query bundle, data bundle, direction set, or selected direction instead of rerunning an earlier stage.
7. **Renderer route**: use the adaptive static viewpoint renderer by default. Add the thesis-chart detail renderer only when full OHLC, volume, indicators, long history, or an explicit chart clock is part of the requested expression.

## Three Candidate Families

| Family | Reader need | Allowed jobs |
| --- | --- | --- |
| `fast_read` | What does the creator believe? | `conviction_snapshot` |
| `proof` | What is the strongest evidence or comparison? | `evidence_proof`, `relative_comparison`, `distribution_risk`, `trigger_watch` |
| `system` | How does the thesis work or unfold? | `news_synthesis`, `mechanism_path`, `scenario_range`, `flow_map`, `strategy_map`, `cycle_map` |

The primary job must appear in the three candidate targets. Candidate families are presentation entrances, not different theses.

## Intent Contract

The intent layer must finish with an executable contract, not a mood board:

- one `primary_job`, `reader_question`, `primary_message`, and `reader_takeaway`;
- exactly three candidate targets: one `fast_read`, one `proof`, and one `system`;
- each candidate's own reader question, evidence shapes, and material `D*` requirement refs;
- one Query capability and the exact MCP tool IDs for every visual `D*` ref;
- one registered Skill path, primary renderer, optional detail renderer, resume policy, registry hash, and route hash.

The planner may choose different evidence entrances for the same job when the creator's material differs. A `relative_comparison` may use a pair spread, indexed curves, or two comparable point metrics; the plan must name which one and bind it to real requirements. Downstream Skills may improve composition, but they may not swap the proof shape or silently request a different tool.

## Intent-To-Execution Map

| Reader job | Common evidence entrances | Common Query capabilities | Render consequence |
| --- | --- | --- | --- |
| `conviction_snapshot` | creator judgment, one metric, one level | current market state, market evidence | compact viewpoint |
| `evidence_proof` | point metric, observed series, event set, news cluster | fundamentals, market series, market evidence | compact viewpoint |
| `relative_comparison` | pair spread, multi-series, comparable metrics, ordered categories | fundamentals, market series, derived metrics | compact viewpoint; detail chart only for full history |
| `distribution_risk` | sample distribution, quantile scenarios, payoff series | market series, derived metrics | compact viewpoint |
| `trigger_watch` | price level, OHLCV, calendar or event set | current state, market series, market evidence | add thesis chart when OHLCV or chart clock is material |
| `news_synthesis` | news cluster, event set, calendar | market evidence, published story | compact viewpoint |
| `mechanism_path` | qualitative relation, causal graph, additive components | market evidence, narrative, fundamentals | compact viewpoint |
| `scenario_range` | quantiles, distribution, payoff | market series, derived metrics | compact viewpoint |
| `flow_map` | quantified flow, series, part-to-whole | market series, derived metrics | compact viewpoint |
| `strategy_map` | ordered categories, levels, payoff | fundamentals, market series, derived metrics | compact viewpoint |
| `cycle_map` | series, events, calendar, causal graph | market series, market evidence, narrative | compact viewpoint; detail chart when long history is material |

These are routing defaults, not geometry templates. The selected candidate records remain the authority.

## Query Boundary

`query-cuebook` owns read access. Create Skills never call MCP read tools directly.

Each `query_request` binds one `data_requirements` ref to:

- a semantic capability such as `market_evidence`, `fundamental_metrics`, `market_series`, or `settlement_binding`;
- the exact tool IDs from the Cuebook MCP capability map;
- `reuse_or_query_gap`, which means reuse a compatible frozen result first and query only the unresolved requirement.

The route is a request plan, not proof that a tool ran. Actual result refs remain in `CuebookQueryBundleV1` and `ViewpointDataBundleV1`.

## Tool And Skill Ownership

| Owner | May use | Must not do |
| --- | --- | --- |
| `plan-cuebook-creator-expression` | semantics, route registry, supplied artifact metadata | run MCP reads or choose final pixels |
| `query-cuebook` | exact registered MCP tools such as `search_assets`, `search_market_evidence`, `query_fundamental_metrics`, `query_market_series`, `compute_market_metrics`, `get_market_state`, and `resolve_settlement_binding` | author the creator's judgment or design a visual |
| `assemble-cuebook-viewpoint-data` | frozen Query result refs and deterministic transforms | browse, widen the thesis, or invent geometry |
| `direct-cuebook-viewpoint-visual` | locked jobs, evidence shapes, data bundle, palette and expression registries | reclassify intent, fetch data, or render settlement internals |
| `render-cuebook-viewpoint-visual` | approved HTML-native direction, deterministic capture and audit tools | alter the meaning fingerprint or evidence selection |
| `render-cuebook-thesis-chart` | bound OHLCV, levels, clock, and indicator artifacts | become the default renderer for every viewpoint |

## Minimum Paths

| Latest valid artifact | Next path |
| --- | --- |
| Semantics only | expression plan -> gap Query if needed -> data -> directions -> selected render |
| Expression plan + complete Query bundle | data -> directions -> selected render |
| Valid ViewpointDataBundleV1 | directions -> selected render |
| Valid VisualDirectionSetV1 | selected render |
| Selected ViewpointVisualV1 | no visual work |

`viewpoint_static_plus_thesis_chart` branches the full chart from the data bundle; it does not make the compact viewpoint wait for a chart that is not selected.

## Taste Boundary

Intent routing decides **what must be communicated and proved**. The design director decides **how it occupies space**. Do not lock palette, grid, motif, or exact chart grammar in the intent layer. Those remain creator-adaptive and content-derived under the Cuebook Static Design Kernel.

Hard constraints remain upstream-owned: claim, direction, horizon, evidence basis, cutoff, materiality, and renderer eligibility. High-freedom choices remain downstream-owned: hierarchy, asymmetry, visual metaphor, palette preset, whitespace, and composition.
