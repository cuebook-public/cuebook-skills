---
name: orchestrate-cuebook-creator-workflow
description: Plan, run, resume, inspect, or repair an end-to-end MCP-connected Cuebook trading-content creator workflow as CreatorWorkflowRunV1, starting from Cuebook news, calendar events, narratives, trade ideas, trade history, a frontend ContentRecipeV1, or existing creator artifacts. Use for ingredient recipes, saved presets, three publishable candidates, static viewpoint cards, settleable claims, daily batches, cross-platform programs, release preparation, publication handoff, receipts, corrections, and postmortems that coordinate versioned Skills with available Cuebook MCP tools. Do not use for direct order execution, credential handling, unavailable backend writes, or claiming content was published without a verified platform receipt.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for asset resolution and market data; degrades to partial results, never invented values, when tools are unavailable. Python 3.11+ for validators.
---

# Orchestrate Cuebook Creator Workflow

Operate the control plane for Cuebook creator work. Reuse existing skills as capability nodes, preserve artifact lineage, and stop when a blocking gate fails. The run record contains references and states, not duplicated research or copy.

## Plugin Bootstrap

1. Load `../../assets/plugin-index-v1.json`, then its canonical SkillCatalogV1, creation menu, and MCP capability map references.
2. Resolve the six creation selections into installed Skill IDs before building the workflow DAG. Do not expose automatic or internal Skills as user choices.
3. Discover the connected `cuebook` MCP server. Treat `available_tools` in the capability map as the release baseline and verify actual tool availability at runtime.
4. Route every authenticated read through `$query-cuebook` and register its immutable `CuebookQueryBundleV1`; Create nodes consume bundle refs and never call read tools directly. Authorized writes remain separate Create actions.
5. When a selected option depends on a missing R1 or R2 tool, preserve the requested option and return an explicit backend requirement or manual handoff. A blocked required query blocks creation. Do not silently substitute unsupported data or claim an external write occurred.

## Standard Sequence

1. **Catalog**: load the pinned SkillCatalogV1 to resolve available skills, presets, versions, and extensions.
2. **Intake**: run `$normalize-cuebook-creator-feed` and register `CreatorFeedV1`.
3. **Recipe and triage**: run `$compose-cuebook-content-recipe` before selection for `ingredient_first`/`preset_auto`, or after selection for `opportunity_first`; register `ContentRecipeV1` and `ContentOpportunitySetV1`.
4. **Evidence route**: for each selected opportunity, run `$validate-cuebook-projection`, then `$route-cuebook-narrative`. Stop on projection reject or route abstention.
5. **Seed Query binding**: compile the smallest support request needed to verify the user's material current premises and safely compile semantics. Invoke `$query-cuebook`, then register the bundle, hash, cutoff, state, and selected result refs. Do not prefetch a broad visual package before the expression intent exists. A partial usable bundle makes dependent semantics conditional; a blocked material premise stops it.
6. **Research and semantics**: consume the bound query results and their referenced `ResearchPackV1` when research is required. Compile the research pack or direct creator/source input with `$compile-cuebook-market-view-semantics`. `MarketViewSemanticsV1` is the authoritative meaning and ownership boundary.
7. **Optional trade protocol**: only when the semantics contain explicit trade intent, resolve `$classify-cuebook-trading-logic` and/or user-selected `$compose-cuebook-trading-thesis`. Source-only, observation, explanation, and sentiment semantics skip both.
8. **Expression bridge and visual route**: run `$plan-cuebook-creator-expression` after semantics and any resolved trade protocol. Register one `CreatorExpressionPlanV1`, including its locked visual intent, three candidate jobs, evidence shapes, exact Query tool bindings, Skill path, renderer route, and route hash. Pass its meaning fingerprint and visual route hash unchanged to every downstream branch.
9. **Intent-driven gap Query**: compare `visual_plan.execution_route.query_requests` with every compatible current Query result. Reuse valid results whose entity, basis, cutoff, freshness, rights, and contract match. If any routed requirement remains unresolved, invoke `$query-cuebook` once with the smallest mixed gap request and register the new immutable bundle. Do not rerun Query when all routed requirements are already satisfied, and never substitute another tool for the locked capability.
10. **Program**: run `$plan-market-content-program` when the resolved recipe requires batches, event lifecycles, multiple outputs, derivatives, or a series.
11. **Parallel text and data**: run `$render-cuebook-market-post` in reasoning-complete mode and, when a visual is selected, `$assemble-cuebook-viewpoint-data` as sibling branches from the same expression plan and compatible Query bundles. Neither branch may depend on the other. Compact selector copy is derived only after the full post passes.
12. **Static viewpoint layout and render**: execute the locked visual Skill path from the latest valid artifact. Compile one source-linked logic progression. When a bounded trading view has an honest observed series, run `$render-cuebook-market-figure` in `argument_curve` mode and pass its source-linked plot semantics into `$direct-cuebook-viewpoint-visual` as the evidence hero; the plot remains an internal component, not a separate final card. Project the shared argument into the locked fast-read, proof, and system jobs as three structurally different HTML layouts, and register an exact 2488 x 1056 publication preview plus a 622 x 264 compact preview, capture report, and rendered-audit report for every direction in `VisualDirectionSetV1`. Then use `$render-cuebook-viewpoint-visual` for the selected or combined direction. Use `$render-cuebook-thesis-chart` only when the route includes the optional full-chart detail branch for real OHLC/K-line, long price history, forming bars, explicit levels, or settlement clock. Every route retains the same plan ref, meaning fingerprint, and route hash. Logic-card, market-signal, and standalone 720 x 420 SVG outputs remain internal compatibility modules.
13. **Optional settlement**: when the expression plan marks a claim eligible and the recipe selects settlement, compile the claim and formula from the bound settlement result. Registration is a separate approved write action after both hashes are frozen. Non-trade semantics skip both.
14. **Autonomous choices**: when the recipe requests `publish_candidate_set`, run `$assemble-cuebook-publish-candidates`. Generate three passed reasoning-complete `PostV1` siblings, derive compact selector excerpts, and pair them with the three passed `VisualDirectionSetV1` previews. A material news premise carries at least one linked evidence anchor in every candidate; a material metric premise carries a resolved same-basis value or an explicit `not meaningful` result. Complete research, market-data, policy, copy, and visual calibration internally; return only `PublishCandidateSetV1` in `ready_for_selection` or a blocked set with no partial candidates.
15. **Media and viewpoint card**: assemble structured media after post and any selected visual/settlement artifacts. A `ViewpointCardV1` requires `PostV1` and `ViewpointVisualV1`; thesis, trade logic, and settlement remain optional inputs.
16. **Discovery preflight**: resolve SEO/GEO from the recipe and owned-web outputs. GEO depends on SEO.
17. **Govern and freeze**: run `$prepare-market-content-release` for `release_candidates`; bind decisions to exact artifact hashes.
18. **Activation handoff**: pass an approved `ReleaseBundleV1` to an explicitly configured external publisher.
19. **Reconcile and learn**: run `$reconcile-market-content-history` on receipts, revisions, corrections, engagement snapshots, and authorized outcomes.

Read `references/workflow-map.md` for scenario paths, role gates, and skill ownership.

## Operating Rules

- Create the run DAG before advancing nodes. Every installed node names one capability, concrete skill, semantic version, dependencies, input artifacts, output contract, owner, gate, and blocking policy.
- Pin `recipe_ref` and the canonical catalog version; every resolved installed skill has exactly one matching recipe version pin and one workflow node.
- Close the recipe and run graph through every transitive `requires_all` dependency. A dependency output must be accepted by the consumer's input contracts.
- Append `StateEventV1` entries for every transition. The current node state is a folded view of those events.
- Register every output with stable artifact ID, schema, hash, producer, inputs, and current/superseded/invalidated status. `ResearchPackV1`, `CreatorExpressionPlanV1`, `ViewpointDataBundleV1`, and `PublishCandidateSetV1` entries also carry an inline `gate_summary` copied from the validated artifact at registration time: `quality_decision`, `artifact_state`, and `unresolved_material_request_count`.
- Treat every artifact `locator` as opaque. Gate validation uses only the run DAG and registry metadata; it never fetches, opens, imports, or otherwise dereferences locator content.
- Advance a node only when its dependencies are completed or explicitly skipped with a reason.
- A completed installed node requires an output artifact matching its declared contract.
- Preserve gate cautions, route abstention, research gaps, policy failures, and approval changes as blockers or state events. Never flatten them into prose.
- Use `ready_for_handoff` only after an exact current ReleaseBundleV1 has release approval. Use `complete` only after required receipt/reconciliation work is complete.
- Never use `published` as a workflow assertion without a verified `PublicationReceiptV1` produced by an external connector.
- Never send credentials through Skill inputs or artifacts. OAuth and platform credentials remain inside the MCP server or authorized publication connector.
- Call `publish_release` only when the runtime exposes it, the exact current release hash has approval, and an idempotency key exists. Otherwise stop at `ready_for_handoff`.

## Publish Candidate Fast Path

Use this path whenever the requested output is only `publish_candidate_set`:

1. Reuse accepted feed, research, semantics, instrument, policy, and complete-bar artifacts whose hashes and freshness windows still pass.
2. Compile and fulfill only the material support needed for semantics through one seed `$query-cuebook` request.
3. Compile one semantics artifact, one expression fingerprint, and one locked visual intent route. Reuse matching seed results and issue at most one mixed gap Query for unresolved routed requirements.
4. Fan out three sibling branches from that fingerprint and route hash: one batched reasoning-complete post generation, one three-direction visual generation, and one optional settlement compilation. When the expression plan requests a proof series, compile its `argument_curve` once and reuse the same sourced geometry across the three layouts.
5. Batch-capture all full and compact previews with bounded concurrency.
6. Assemble and validate the candidate set. Retry only a failed sibling or stale primitive.

Skip content-program planning, cross-platform media, selected-direction rendering, SEO/GEO, release freezing, and publishing handoff until the user chooses a candidate or the recipe explicitly requests them. A warm fast-path run does not revisit unchanged upstream nodes.

## Mode Rules

- `plan_only`: create the DAG and stop at `planned`.
- `single`: one selected opportunity; program planning may be skipped for one compact asset.
- `batch`: two or more opportunities; ContentProgramV1 is required.
- `event_lifecycle`: use pre-event, live, post-event, and expiry nodes as applicable; ContentProgramV1 is required.
- `postmortem`: require authorized history and reconciliation before performance language.
- `correction`: make reconciliation/correction propagation blocking and invalidate dependent current artifacts before rendering the correction.

## Human Gates

- `research`: source coverage, comparators, calculations, uncertainty, and falsifier.
- `editorial`: angle, audience utility, compression, channel fit, and original voice.
- `compliance`: disclosures, rights, claims, jurisdiction, privacy, and financial-content policy.
- `release`: exact frozen payload, destinations, schedule, approvals, expiry, and rollback readiness.

An approval records artifact IDs and their hashes. A changed hash requires a new decision.

## Hard Gates

- Dependency cycle, stale catalog, missing recipe, unresolved skill, skill-version mismatch, missing artifact, hash mismatch, unknown opportunity, or invalid state event chain: block the run.
- Projection reject, route abstention, blocked ResearchPackV1, or unresolved material disclosure: block dependent render/release nodes.
- Missing or malformed gate metadata on a registered research pack, expression plan, viewpoint-data bundle, or candidate set: block the run. A locator cannot be dereferenced to repair missing registry metadata.
- A render, candidate, card, media, or release node may advance only when every current gate-bearing ancestor and every gate-bearing artifact in its registered input lineage has a release-safe summary: research is `ready/ready`, expression is `ready` with `ready` or `frozen` state, data is `ready/ready`, candidate sets are `ready_for_selection` or `selected`, and every unresolved-material count is zero. Otherwise keep an untouched node pending or transition an attempted downstream node to `blocked` with a blocker record; `completed` is invalid.
- Missing or conflicting `MarketViewSemanticsV1`, changed expression meaning fingerprint or visual route hash, or text/visual branches bound to different `CreatorExpressionPlanV1` revisions: block dependent output nodes.
- A material creator premise about current news, PR, a requested number, valuation comparison, or settlement level that remains unresolved or is removed by qualitative fallback: block `ready_for_selection`; preserve a conditional research artifact for inspection.
- A material current premise with no hash-verified `CuebookQueryBundleV1`, a blocked Query bundle, an unavailable handed-off result, or a Create node that directly called a Query MCP tool: block the run.
- Trade logic, trading thesis, or settlement required for source-only non-trade semantics: repair the DAG by removing the unsupported trade branch.
- Completed node without its declared artifact: block.
- GEO node without an SEO dependency on owned-web work: repair.
- Release prepared before all applicable render and preflight nodes complete: block.
- A settleable or reputation-linked output with no ready/frozen `SettlementClaimV1`, unconfirmed proposed fields, or a mismatch with its frozen thesis: block release of the settlement attachment. The prose may continue only when the recipe permits ordinary commentary without a settleable claim.
- A `ViewpointCardV1` may preview in `conditional` state, but it cannot freeze while its unified visual is conditional, an included settlement needs confirmation, or material disclosures remain unknown.
- A `PublishCandidateSetV1` in `ready_for_selection` requires exactly three passed candidates with one meaning fingerprint, three distinct copy angles, three distinct full/compact visual pairs, no blocked calibration stage, and no preselected candidate. Failed drafts remain internal.
- Candidate selection confirms the exact copy and visual only. An included `SettlementClaimV1` remains `needs_confirmation` until the selection receipt explicitly records every visible contract field.
- A logic-card, market-figure, or market-signal compatibility visual remains internal and cannot replace the selected `ViewpointVisualV1` in a new card path. A validated market-figure plot may be embedded as the evidence hero inside that `ViewpointVisualV1`; a `ThesisChartV1` may accompany it as full-chart detail.
- External publish marked complete without PublicationReceiptV1: block.
- `ready_for_handoff` without current release approval bound to the current release hash: block.
- Workflow `complete` while any blocking node is pending, running, blocked, or deferred: reject.

## Boundaries

- Do not embed source text, research facts, drafts, or release payloads into this run contract. Register their artifacts.
- Do not inspect artifact payloads through registry locators. Artifact-producing Skills own payload validation and must publish their normalized gate summary into the registry alongside the payload hash.
- Do not invent a universal publishing skill. Platform connectors own credentials, idempotency, and API behavior.
- Do not optimize the research truth layer using clicks, likes, or later returns.
- Do not place or modify trades.

## Output Contract

Return `CreatorWorkflowRunV1` from `references/creator-workflow-run-v1.schema.json`, then run `node scripts/validate_creator_workflow.mjs`:

```json
{
  "schema_version": "creator-workflow-run-v1",
  "workflow_id": "WF_...",
  "recipe_ref": "RECIPE_...",
  "catalog_version": "1.26.0",
  "query_bundle_refs": [],
  "mode": "single",
  "state": "ready_for_handoff",
  "selected_opportunity_refs": [],
  "nodes": [],
  "artifact_registry": [],
  "approvals": [],
  "state_events": [],
  "blockers": [],
  "quality_report": {}
}
```

## Resources

- `references/workflow-map.md`: canonical stages, scenario paths, roles, and capability ownership.
- `references/creator-workflow-run-v1.schema.json`: authoritative control-plane contract.
- `scripts/validate_creator_workflow.mjs`: DAG, state, artifact, approval, and mode checks.
- `scripts/build_example_bundle.mjs`: generate and validate a no-database six-contract example bundle.
- `tests/validate_creator_workflow.test.mjs`: regression suite using `node:test`.
- `evals/trigger_cases.json`: routing cases.
- `evals/rubric.md`: orchestration quality gate.
- `evals/failure_cases.md`: stable orchestration failures.
- `../../assets/creation-menu-v1.json`: six-step creation selection surface.
- `../../assets/mcp-capability-map-v1.json`: available and required Cuebook MCP tools, phases, contracts, and external-write gates.
