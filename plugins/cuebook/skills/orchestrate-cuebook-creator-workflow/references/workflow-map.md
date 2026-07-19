# Cuebook Creator Workflow Map

This map targets `SkillCatalogV1` version `1.28.0`.

## Creator Fast Preview

For an ordinary raw idea, execute `asset resolve -> one bounded parallel Query phase -> in-memory meaning lock -> one copy batch -> one stable-template render batch -> four lightweight checks -> FramePreviewV1`. Default to one candidate. Do not create the workflow DAG or the capability table below until selection. Three candidates are opt-in.

## Selected Freeze Path

After confirmation, execute `reuse selected preview/query refs -> minimal semantics/expression lineage -> selected PostV1 + selected visual direction -> full/compact/visibility-required OG -> deep audit + manifest -> one-candidate selected set -> Frame assembly`. Continue to upload and publication only when requested.

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
| Viewpoint layout | freeze one selected layout or generate three explicit alternatives | `direct-cuebook-viewpoint-visual` | VisualDirectionSetV1 |
| Visual | render the selected adaptive compact visual | `render-cuebook-viewpoint-visual` | ViewpointVisualV1 |
| Visual detail, optional | render real OHLC/K-line and settlement clock | `render-cuebook-thesis-chart` | ThesisChartV1 |
| Settle, optional | compile post commitment | `compile-cuebook-settlement-claim` | SettlementClaimV1 |
| Settlement math, automatic | compile executable variables, formulas, and lifecycle | `compile-cuebook-settlement-formula` | SettlementFormulaV1 |
| Candidate assembly | freeze one selected Frame or pair three explicit alternatives | `assemble-cuebook-publish-candidates` | PublishCandidateSetV1 |
| Render | media package | `render-cuebook-market-media` | MediaPackageV1 |
| Enrich | compute OHLCV indicators | `compute-cuebook-market-indicators` | IndicatorPackV1 |
| Assemble | build product viewpoint card | `assemble-cuebook-viewpoint-card` | ViewpointCardV1 |
| Govern | prepare release | `prepare-market-content-release` | ReleaseBundleV1 |
| Activate | platform publisher | external connector | PublicationReceiptV1 |
| Reconcile | history and corrections | `reconcile-market-content-history` | ContentHistoryLedgerV1 |

ProfileV1 and MediaFormatV1 are versioned library inputs. Corpus collectors and distillers run when those libraries need refreshing, not on every content run. `render-cuebook-logic-card`, `render-cuebook-market-figure`, and `render-cuebook-market-signal` remain internal compatibility modules and are not preset choices. `render-cuebook-thesis-chart` is not replaced: it remains the automatic optional full-chart route beside the primary compact viewpoint visual.

The default Create branch is:

`user input -> bounded CuebookQueryBundleV1 -> FramePreviewV1 -> user selection -> selected release artifacts -> FrameDraftAssemblyV1 -> optional publish`

The former full research/program/candidate DAG remains available for explicit advanced batches and postmortems; it is not the default preview route.

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
| Viewpoint visual | raw idea -> one fast preview -> selection -> one release-grade layout at required sizes -> release |
| Viewpoint card | research/creator input -> semantics -> optional trade protocol -> expression -> post + data -> static layouts -> selected visual -> optional settlement -> card/release |
| Direct candidate selection | explicit three-request -> shared evidence/meaning -> three batched copies + template previews -> user selection -> selected release freeze |
| Daily desk | intake -> recipe/triage -> gate/route -> research -> semantics -> expression -> program -> post/media -> release |
| Event lifecycle | intake -> recipe/triage -> gate/route -> research -> semantics -> optional trade protocol -> expression -> program -> pre/live/post outputs -> optional settlement -> release/expiry |
| Owned-web article | research -> semantics -> expression -> program -> post/media -> optional visual -> release |
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
