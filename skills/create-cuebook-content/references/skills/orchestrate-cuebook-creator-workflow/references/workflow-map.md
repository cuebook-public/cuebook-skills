# Cuebook Creator Workflow Map

This map targets `SkillCatalogV1` version `1.26.0`.

## Candidate Fast Path

For `publish_candidate_set`, execute `reuse/freshness check -> seed Query for material semantics -> research -> semantics -> expression fingerprint + visual intent route -> gap-only mixed Query when needed -> market primitives -> parallel post batch + three visual directions + optional settlement -> batch capture -> candidate assembly`. Defer program, media, selected visual, SEO/GEO, release, and publication nodes until selection.

## Capability Ownership

| Stage | Capability | Skill | Contract |
| --- | --- | --- | --- |
| Intake | normalize feed | `normalize-cuebook-creator-feed` | CreatorFeedV1 |
| Recipe | compose selected ingredients | `compose-cuebook-content-recipe` | ContentRecipeV1 |
| Triage | select opportunities | `select-cuebook-content-opportunities` | ContentOpportunitySetV1 |
| Evidence | validate projection | `validate-cuebook-projection` | GateV1 |
| Route | classify narrative | `route-cuebook-narrative` | RouteV1 |
| Query boundary | execute all reads and freeze reusable lineage | `query-cuebook` | CuebookQueryBundleV1 |
| Research | build research | `build-market-research-pack` | ResearchPackV1 |
| Semantics | compile source-faithful meaning | `compile-cuebook-market-view-semantics` | MarketViewSemanticsV1 |
| Trade, optional | classify explicit trade | `classify-cuebook-trading-logic` | TradeLogicProfileV1 |
| Trade, optional | freeze trading thesis | `compose-cuebook-trading-thesis` | TradingThesisV1 |
| Expression | lock shared meaning, authorship, visual jobs, exact Query tools, Skill path, and renderer route | `plan-cuebook-creator-expression` | CreatorExpressionPlanV1 |
| Query gap | fulfill only unresolved intent-routed requirements | `query-cuebook` | CuebookQueryBundleV1 |
| Program | plan derivatives | `plan-market-content-program` | ContentProgramV1 |
| Text branch | compact text from expression plan | `render-cuebook-market-post` | PostV1 |
| Data branch | resolve requested visual primitives | `assemble-cuebook-viewpoint-data` | ViewpointDataBundleV1 |
| Viewpoint layout | generate and review three real typographic and spatial layouts | `direct-cuebook-viewpoint-visual` | VisualDirectionSetV1 |
| Visual | render the selected adaptive compact visual | `render-cuebook-viewpoint-visual` | ViewpointVisualV1 |
| Visual detail, optional | render real OHLC/K-line and settlement clock | `render-cuebook-thesis-chart` | ThesisChartV1 |
| Settle, optional | compile post commitment | `compile-cuebook-settlement-claim` | SettlementClaimV1 |
| Settlement math, automatic | compile executable variables, formulas, and lifecycle | `compile-cuebook-settlement-formula` | SettlementFormulaV1 |
| Candidate assembly | pair three compact posts, three visuals, and shared settlement semantics for direct user selection | `assemble-cuebook-publish-candidates` | PublishCandidateSetV1 |
| Render | media package | `render-cuebook-market-media` | MediaPackageV1 |
| Enrich | compute OHLCV indicators | `compute-cuebook-market-indicators` | IndicatorPackV1 |
| Assemble | build product viewpoint card | `assemble-cuebook-viewpoint-card` | ViewpointCardV1 |
| Discover | owned-web SEO | `optimize-cuebook-market-seo` | MarketSEOPackV1 |
| Discover | answer-engine GEO | `optimize-cuebook-market-geo` | MarketGEOPackV1 |
| Govern | prepare release | `prepare-market-content-release` | ReleaseBundleV1 |
| Activate | platform publisher | external connector | PublicationReceiptV1 |
| Reconcile | history and corrections | `reconcile-market-content-history` | ContentHistoryLedgerV1 |

ProfileV1 and MediaFormatV1 are versioned library inputs. Corpus collectors and distillers run when those libraries need refreshing, not on every content run. `render-cuebook-logic-card`, `render-cuebook-market-figure`, and `render-cuebook-market-signal` remain internal compatibility modules and are not preset choices. `render-cuebook-thesis-chart` is not replaced: it remains the automatic optional full-chart route beside the primary compact viewpoint visual.

The core Create branch is:

`seed CuebookQueryBundleV1 + user input -> ResearchPackV1/MarketViewSemanticsV1 -> optional TradeLogicProfileV1/TradingThesisV1 -> CreatorExpressionPlanV1 + VisualIntentRouteV1 -> optional gap CuebookQueryBundleV1 -> (three PostV1 siblings || ViewpointDataBundleV1 -> three VisualDirectionSetV1 previews) -> optional SettlementClaimV1 -> PublishCandidateSetV1 -> user selection -> ViewpointVisualV1/ViewpointCardV1 -> ReleaseBundleV1`

`PostV1` and `ViewpointDataBundleV1` are parallel children of the same expression plan and compatible immutable Query bundles. Both downstream branches preserve its meaning fingerprint and visual route hash. No Create node calls a read MCP tool directly. Trade logic, thesis, and settlement are absent for source-only non-trade semantics.

## Visual Resume Paths

| Latest compatible artifact | Minimum remaining path |
| --- | --- |
| MarketViewSemanticsV1 | expression -> gap Query if needed -> data -> directions -> selected render |
| CreatorExpressionPlanV1 + complete Query result refs | data -> directions -> selected render |
| ViewpointDataBundleV1 | directions -> selected render |
| VisualDirectionSetV1 | selected render |
| ViewpointVisualV1 | no visual work |

Compatibility requires matching plan revision, meaning fingerprint, visual route hash, cutoff, entity, basis, rights, freshness, and passed gate summary. A cached artifact that fails any check is not a resume point.

## Registry Gate Propagation

The artifact producer writes a normalized `gate_summary` into the registry in the same registration step as the artifact hash. The orchestrator validates this summary without reading the artifact `locator`.

| Artifact | `quality_decision` | `artifact_state` | Ready for downstream work |
| --- | --- | --- | --- |
| CuebookQueryBundleV1 | normalized from query `state` | normalized from query `state` | `ready` / `ready`; partial becomes `conditional` |
| ResearchPackV1 | artifact `quality_report.decision` | repeat the decision as its normalized state | `ready` / `ready` |
| CreatorExpressionPlanV1 | artifact `quality_report.decision` | artifact `state` | `ready` / (`ready` or `frozen`) |
| ViewpointDataBundleV1 | artifact `quality_report.decision` | artifact `state` | `ready` / `ready` |
| PublishCandidateSetV1 | artifact `quality_report.decision` | artifact `state` | matching `ready_for_selection` or `selected` |

`unresolved_material_request_count` counts unresolved creator premises material to the public claim, including named current news/PR, requested numbers or comparators, price/settlement levels, and required market-data primitives. A selectable or selected candidate set must carry zero. Optional decoration and explicitly non-material requests do not increment it.

For each render, candidate, card, media, and release node, walk current gate-bearing artifacts produced by related ancestor nodes plus every artifact in the node's transitive registered input lineage. Any conditional/blocked/non-ready summary or positive unresolved-material count prevents `ready`, `running`, or `completed`; an attempted downstream node transitions to `blocked` and records a blocker. A blocked `PublishCandidateSetV1` may remain registered for inspection, but it has no selectable partial candidates. Registry locators remain opaque strings throughout this check.

## Scenario Paths

| Scenario | Required path |
| --- | --- |
| Source-only commentary | intake -> recipe/triage -> gate/route -> research -> semantics -> expression -> post -> release |
| Viewpoint visual | research/creator input -> semantics -> expression -> post + data -> three static layouts at two sizes -> selected compact visual -> optional full thesis chart -> release |
| Viewpoint card | research/creator input -> semantics -> optional trade protocol -> expression -> post + data -> static layouts -> selected visual -> optional settlement -> card/release |
| Direct candidate selection | research/creator input -> semantics -> expression -> three compact posts + data -> three static layouts at two sizes -> optional settlement proposal -> candidate set -> user selection |
| Daily desk | intake -> recipe/triage -> gate/route -> research -> semantics -> expression -> program -> post/media -> release |
| Event lifecycle | intake -> recipe/triage -> gate/route -> research -> semantics -> optional trade protocol -> expression -> program -> pre/live/post outputs -> optional settlement -> release/expiry |
| Owned-web article | research -> semantics -> expression -> program -> post/media -> optional visual -> SEO -> GEO -> release |
| Trade postmortem | intake -> triage -> reconcile authorized history -> research -> semantics -> expression -> post -> release |
| Correction | intake -> correction selection -> reconcile/invalidate -> research correction -> semantics -> expression -> notice -> release |

`ingredient_first` and `preset_auto` place recipe composition before constrained selection. `opportunity_first` places it after selection. The gate depends on both artifacts.

## Governance

Keep four decisions separate:

1. Research approval verifies evidence and reasoning.
2. Editorial approval verifies usefulness and expression.
3. Compliance approval verifies claims, rights, disclosures, and jurisdiction.
4. Release approval binds the exact frozen payload to destination and schedule.

Publication and measurement remain separate state planes. A platform response proves publication only when it contains a durable remote identity and verifiable state. Engagement measures packaging. Market outcomes support calibrated retrospective evaluation only after a registered window; they do not retroactively validate source quality.
