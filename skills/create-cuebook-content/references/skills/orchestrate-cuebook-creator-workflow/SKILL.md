---
name: orchestrate-cuebook-creator-workflow
description: Run or resume the release-grade phase of an MCP-connected Cuebook Frame workflow after a fast preview is selected, or coordinate an explicitly requested advanced batch. Use for selected Frame freezing, three alternatives only when requested, paired release derivatives, optional settleable claims, Frame media upload, draft preparation, authorized publication, withdrawal consent, publication receipts, corrections, withdrawals, and postmortems. Do not build a workflow DAG for an ordinary first preview; do not use for social-platform programs, direct order execution, credential handling, unavailable backend writes, or claiming publication without a verified receipt.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for asset resolution and market data; degrades to partial results, never invented values, when tools are unavailable. Node.js 18+ for validators.
---

# Orchestrate Cuebook Creator Workflow

Operate the release-grade control plane after a creator-facing preview exists. Reuse existing skills as capability nodes, preserve artifact lineage, and stop when a blocking gate fails. Never make the creator wait for this control plane before seeing a valid title, body, and image.

## Fast Preview Boundary

For a raw idea whose requested result is simply a Frame, return to the public `create-cuebook-content` entrypoint and use its `preview_fast` route. Before selection, do not create a DAG, normalize a feed, select an opportunity, compose a recipe, build a program, materialize research/semantics/expression/data/post/direction/candidate contracts, render compact/OG images, or run release gates. Enter this orchestrator only when the creator selected a preview, explicitly requested three advanced alternatives, or requested an authorized write.

## Plugin Bootstrap

1. Load `../../../assets/plugin/plugin-index-v1.json`, then its canonical SkillCatalogV1, creation menu, and MCP capability map references.
2. Resolve the six creation selections into installed Skill IDs before building the workflow DAG. Do not expose automatic or internal Skills as user choices.
3. Discover the connected `cuebook` MCP server. Treat `available_tools` in the capability map as the release baseline and verify actual tool availability at runtime.
4. Route every authenticated read through `../query-cuebook/SKILL.md` and register its immutable `CuebookQueryBundleV1`; Create nodes consume bundle refs and never call read tools directly. Authorized writes remain separate Create actions.
5. When a selected option depends on a missing R1 or R2 tool, preserve the requested option and return an explicit backend requirement or manual handoff. A blocked required query blocks creation. Do not silently substitute unsupported data or claim an external write occurred.

## Standard Sequence

1. **Catalog**: load the pinned SkillCatalogV1 to resolve available skills, presets, versions, and extensions.
2. **Intake**: run `../normalize-cuebook-creator-feed/SKILL.md` and register `CreatorFeedV1`.
3. **Recipe and triage**: run `../compose-cuebook-content-recipe/SKILL.md` before selection for `ingredient_first`/`preset_auto`, or after selection for `opportunity_first`; require exactly one `frame/publish_candidate_set` output and a visual branch, then register `ContentRecipeV1` and `ContentOpportunitySetV1`.
4. **Evidence route**: for each selected opportunity, run `../validate-cuebook-projection/SKILL.md`, then `../route-cuebook-narrative/SKILL.md`. Stop on projection reject or route abstention.
5. **Seed Query binding**: compile the smallest support request needed to verify the user's material current premises and safely compile semantics. Invoke `../query-cuebook/SKILL.md`, then register the bundle, hash, cutoff, state, and selected result refs. Do not prefetch a broad visual package before the expression intent exists. A partial usable bundle makes dependent semantics conditional; a blocked material premise stops it.
6. **Research and semantics**: consume the bound query results and their referenced `ResearchPackV1` when research is required. Compile the research pack or direct creator/source input with `../compile-cuebook-market-view-semantics/SKILL.md`. `MarketViewSemanticsV1` is the authoritative meaning and ownership boundary.
7. **Optional trade protocol**: only when the semantics contain explicit trade intent, resolve `../classify-cuebook-trading-logic/SKILL.md` and/or user-selected `../compose-cuebook-trading-thesis/SKILL.md`. Source-only, observation, explanation, and sentiment semantics skip both.
8. **Expression bridge and visual route**: run `../plan-cuebook-creator-expression/SKILL.md` after semantics and any resolved trade protocol. A selected fast preview retains one chosen visual job; an explicit alternative request retains fast-read, proof, and system. Pass the meaning fingerprint and visual route hash unchanged downstream.
9. **Intent-driven gap Query**: compare `visual_plan.execution_route.query_requests` with every compatible current Query result. Reuse valid results whose entity, basis, cutoff, freshness, rights, and contract match. If any routed requirement remains unresolved, invoke `../query-cuebook/SKILL.md` once with the smallest mixed gap request and register the new immutable bundle. Do not rerun Query when all routed requirements are already satisfied, and never substitute another tool for the locked capability.
10. **Program**: run `../plan-market-content-program/SKILL.md` when the resolved recipe requires batches, event lifecycles, multiple outputs, derivatives, or a series.
11. **Parallel text and data**: run `../render-cuebook-market-post/SKILL.md` in Frame-sized mode and `../assemble-cuebook-viewpoint-data/SKILL.md` as sibling branches from the same expression plan and compatible Query bundles. Neither branch may depend on the other. The body carries the creator viewpoint and concise mechanism; the image data branch carries observed evidence, reasoning beats, and timing when material.
12. **Selected viewpoint render**: execute the locked visual path only for retained directions. Recompose the selected fast-preview template with production fonts, full and compact derivatives, capture, audit, bindings, and manifest lineage. Add OG only for public/unlisted visibility. Three structurally different release directions are required only for an explicit alternative request. Use `../render-cuebook-thesis-chart/SKILL.md` only when the selected route genuinely needs OHLC/K-line, long history, forming bars, explicit levels, or a settlement clock.
13. **Optional settlement**: when the expression plan marks a claim eligible and the recipe selects settlement, compile the claim and formula from the bound settlement result. Registration is a separate approved write action after both hashes are frozen. Non-trade semantics skip both.
14. **Candidate freeze**: run `../assemble-cuebook-publish-candidates/SKILL.md`. Preserve one selected preview without siblings, or assemble three only when explicitly requested. Build each exact public projection as `title + body + image`; keep all lineage and calibration backstage.
15. **Selection and Frame assembly**: select the copy-to-image pair atomically, validate that `candidate.frame` exactly matches the frozen internal copy split and publication visual, then assemble `FrameDraftAssemblyV1 + FrameDraftAssemblyBindingV1`. Optional thesis, trade logic, and settlement remain backstage inputs.
16. **Frame activation**: after explicit user intent, execute only the capability-advertised Frame sequence: upload every rendition, register the manifest, create or update the draft, run `prepare_frame_publish`, call `publish_frame` with its exact `prepared_hash` and `publish_token`, and verify through `get_frame`. Do not request or poll separate action consent for initial publication. If a required B2/B3 tool is absent, stop at the latest completed phase without legacy fallback.
17. **Receipt and readback**: require the publish receipt's versioned Frame ref and verify it through `get_frame`. The readback exposes the full Frame and one attached visual semantic ref, never image bytes, display URLs, rendition IDs, or `media[]`.
18. **Reconcile and learn**: run `../reconcile-market-content-history/SKILL.md` on receipts, revisions, corrections, engagement snapshots, and authorized outcomes.

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
- Execute a Frame mutation only when the runtime advertises it, every command has its own fresh lowercase UUIDv7, and the preceding receipt is bound. Initial and correction publication require the exact prepared hash and short-lived publish token under the active `cuebook.frame.publish` grant and first-party publish action; neither accepts `consent_request_id`. Withdrawal still requires approved first-party consent bound to its prepared action. Otherwise stop at the latest valid phase.

## Selected Preview Freeze Path

Use this path whenever one `FramePreviewV1` candidate has been confirmed:

1. Reuse the preview's creator view, Cuebook query refs, title, body, image, and hashes; refresh only a stale material primitive.
2. Compile one minimal meaning fingerprint and one selected visual route. Do not normalize feed, select opportunities, compose a recipe, or plan a content program.
3. Re-render only the selected direction with production fonts, compact, and visibility-required OG derivatives; run release audits once.
4. Materialize the selected `PostV1`, one-direction selected `VisualDirectionSetV1`, one-candidate selected `PublishCandidateSetV1`, and Frame assembly. Compile settlement only when explicitly chosen.
5. Stop before media upload, prepare, or publish unless the user requested the next write. Stop before withdrawal consent unless the user requested withdrawal.

## Mode Rules

- `plan_only`: create the DAG and stop at `planned`.
- `single`: one selected opportunity; program planning may be skipped for one compact asset.
- `batch`: two or more opportunities; ContentProgramV1 is required.
- `event_lifecycle`: use pre-event, live, post-event, and expiry nodes as applicable; ContentProgramV1 is required.
- `postmortem`: require authorized history and reconciliation before performance language.
- `correction`: make reconciliation/correction propagation blocking and invalidate dependent current artifacts before rendering the correction.

## Human Gates

- `research`: source coverage, comparators, calculations, uncertainty, and falsifier.
- `editorial`: creator lift, angle, compression, Frame fit, text-image division of labor, and original voice.
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
- Release prepared before all applicable render nodes complete: block.
- A settleable or reputation-linked output with no ready/frozen `SettlementClaimV1`, unconfirmed proposed fields, or a mismatch with its frozen thesis: block release of the settlement attachment. The prose may continue only when the recipe permits ordinary commentary without a settleable claim.
- A `ViewpointCardV1` may preview in `conditional` state, but it cannot freeze while its unified visual is conditional, an included settlement needs confirmation, or material disclosures remain unknown.
- A `PublishCandidateSetV1` in `ready_for_selection` requires exactly three explicitly requested alternatives. A `selected` set may retain the sole confirmed preview with `candidate_count: 1`, or the original three with one selected. Failed drafts remain internal.
- Candidate selection confirms the exact copy and visual only. An included `SettlementClaimV1` remains `needs_confirmation` until the selection receipt explicitly records every visible contract field.
- A logic-card, market-figure, or market-signal compatibility visual remains internal and cannot replace the selected `ViewpointVisualV1` in a new card path. A validated market-figure plot may be embedded as the evidence hero inside that `ViewpointVisualV1`; a `ThesisChartV1` may accompany it as full-chart detail.
- External publish marked complete without PublicationReceiptV1: block.
- `ready_for_handoff` without current release approval bound to the current release hash: block.
- Workflow `complete` while any blocking node is pending, running, blocked, or deferred: reject.

## Boundaries

- Do not embed source text, research facts, drafts, or release payloads into this run contract. Register their artifacts.
- Do not inspect artifact payloads through registry locators. Artifact-producing Skills own payload validation and must publish their normalized gate summary into the registry alongside the payload hash.
- Do not invent a universal publisher or social derivative. The first-party Frame MCP family owns authorization, idempotency, publication behavior, and withdrawal consent.
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
- `../../../assets/plugin/creation-menu-v1.json`: six-step creation selection surface.
- `../../../assets/plugin/mcp-capability-map-v1.json`: available and required Cuebook MCP tools, phases, contracts, and external-write gates.
