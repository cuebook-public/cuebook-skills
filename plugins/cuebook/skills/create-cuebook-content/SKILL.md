---
name: create-cuebook-content
description: Create Cuebook market posts, creator viewpoint graphics, settlement protocols, or publishing candidates from a user's explicit idea, selected Cuebook material, or an existing CuebookQueryBundleV1. Use when the requested deliverable is clearly a post, thread, trading viewpoint, viewpoint graphic, settlement condition, release bundle, or three publishing candidates. Preserve authorship, invoke query-cuebook whenever material current news, market data, fundamentals, comparators, history, or settlement bindings are missing, then return three calibrated candidates only when the workflow is not blocked. Do not use for read-only search, summaries, reports, data tables, or factual charts; do not silently publish, place trades, fabricate query results, or present a source opinion as the user's own view without explicit adoption.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for asset resolution and market data; degrades to partial results, never invented values, when tools are unavailable. Node.js 18+ for validators.
---

# Create Cuebook Content

Provide one creation entrance for writing, viewpoint graphics, settlement expression, and release preparation. Creation owns the creator's expression. It may consume query output, but query data never becomes authorship by itself.

## Workflow

1. Capture and validate `CreatorSeedV1` from `references/creator-seed-v1.schema.json`. When the input is free-form visitor text still missing a verified asset, direction, or horizon, run `$intake-cuebook-viewpoint` first: it triages 查询 versus 表达观点, elicits only the missing fields, verifies them, and returns a confirmed `ViewpointIntakeV1` seed — or routes a pure lookup to query without creation. Preserve the seed verbatim and classify authorship as `creator_led`, `cuebook_assisted`, or `cuebook_generated`. A source post or Cuebook story is material, not proof that the current creator adopts its trade.
2. Compile the creator's requested subject, direction, horizon, mechanism, evidence needs, output channels, visual preference, and settlement intent.
3. Detect the latest compatible supplied artifact: creator seed, Query bundle, semantics, expression plan, viewpoint-data bundle, visual direction set, selected visual, or release bundle. Resume from that stage and do not reconstruct already validated artifacts.
4. Decide whether a seed query is required for semantics. Material current news, PR, price, valuation, comparator, history, or settlement premise requires a fresh or reusable `CuebookQueryBundleV1`. Freeze its query ID, content hash, result refs, source refs, state, `as_of`, freshness, warnings, and unavailable capabilities. After the expression plan locks the visual intent route, let the orchestrator issue one additional mixed Query only for unresolved routed requirements. Rendering branches never browse or call providers independently.
5. Run `$compose-cuebook-content-recipe`, then `$orchestrate-cuebook-creator-workflow`. The workflow may use query-layer research skills through the explicit `create -> query` module edge.
6. Preserve one meaning fingerprint across text, visual, and settlement branches. Produce exactly three meaning-equivalent candidates with real differences in expression and composition only when creation is `ready` or `conditional`.
7. Compile a settlement claim and formula only when the creator supplied or accepted the required asset, direction or comparator, horizon, observation rule, and threshold semantics.
8. When the deliverable is a Frame publication, assemble `FrameDraftAssemblyV1`: the FrameDraftV1-compatible draft (title, body, disclosures, media roles publication/compact — plus og for public or unlisted), the `SettlementIntentV1` built from the intake seed (family, explicit threshold, 1h-to-6-month horizon intent, direction-consistent targets), the visual-manifest lineage hash, and a fresh **UUIDv7** `idempotency_key`. Each `frame_draft.media[].sha256` is the exact encoded PNG byte hash. The visual manifest's `role_hashes` are canonical RGBA8 pixel hashes and must never be substituted for those byte hashes. The manifest is authoritative for `alt_text_by_role`; duplicate alt text in the assembly must match it exactly. Validate the assembly with `node scripts/validate_frame_draft_assembly.mjs assembly.json` before any backend call; non-settleable directions assemble no intent and stay store-only.
9. Return `CuebookCreationBundleV1`. Selecting a settlement format only compiles artifacts; it never registers them. Saving, settlement registration, and publishing use the separate approved `write_actions` in the creation menu.
10. When the user asks to publish and the Frame MCP family is available, follow the frozen sequence in `../../assets/mcp-capability-map-v1.json`: `get_frame_capabilities` → `begin_frame_media_upload` for each role → signed HTTPS PUT for each role → `complete_frame_media_upload` for each role → poll owner-only `get_frame_media_status` until encoded-byte and canonical-pixel receipts are ready → `register_frame_visual_manifest` → `create_frame_draft` with `FrameDraftAssemblyV1 + FrameDraftAssemblyBindingV1` (or `update_frame_draft` under optimistic concurrency) → `prepare_frame_publish` → the user approves the exact prepared hash on Cuebook's first-party consent page → poll `get_frame_action_consent` → `publish_frame` → `get_frame` using the receipt's versioned Frame ref. The status call returns processing and hashes only: never pull image bytes, dereference a display URL, or treat a rendition as an independently retrievable product. If the host cannot perform the signed PUT, return `blocked/client_upload_capability_required`; never fall back to base64. After registration, revalidate with `node scripts/validate_frame_draft_assembly.mjs assembly.json --binding binding.json --visual-manifest frame-visual-manifest-v1.json` before draft creation.
11. Give every mutation its own fresh lowercase UUIDv7. The assembly key belongs only to `create_frame_draft`; begin, complete, register, update, prepare, publish, correction, and withdrawal commands never reuse it or each other's keys. Replaying the same key with the same payload recovers the same receipt; changing the payload under that key is a conflict. Content fixes after release use `create_frame_correction_draft` → `prepare_frame_correction_publish` → first-party consent → `publish_frame_correction`, while preserving the frozen contract. Stopping distribution uses `prepare_frame_withdraw` → first-party consent → `withdraw_frame`. A tool absent from `tools/list` or returning unavailable means that phase is not enabled; report the state and do not fall back to a legacy write.

## Query Use

- Reuse a compatible query bundle when its subjects, basis, cutoff, and freshness satisfy the creation request.
- Run a new seed query when a material semantic premise changed or expired. Run a gap query only after the expression plan declares a visual requirement not covered by compatible frozen results.
- Mark `query_binding.required: false` only when the output contains no material current claim, such as a supplied evergreen explanation or formatting-only transformation.
- A partial usable query makes creation `conditional`. An unavailable or blocked required query makes creation `blocked`, with no candidate set and no candidate refs.

## Artifact Entry Routing

- `CreatorSeedV1` or raw idea: run the complete creation route.
- `CuebookQueryBundleV1`: reuse it for semantics, then plan expression and query only visual gaps.
- `MarketViewSemanticsV1`: start at expression planning.
- `CreatorExpressionPlanV1`: verify its meaning and visual route hashes, then start at gap resolution or data assembly.
- `ViewpointDataBundleV1`: start at visual direction composition.
- `VisualDirectionSetV1`: start at selection or final rendering.
- `ViewpointVisualV1`: skip visual work and continue with card, release, or approved write handling.

Compatibility requires matching schema, plan revision, hashes, cutoff, freshness, rights, basis, and passed gates. A merely present artifact is not automatically reusable.

## Creation Boundary

- A read-only request routes to `$query-cuebook` and stops there.
- Creation may invoke query. Query may never invoke creation.
- Do not write in a source commentator's first person, mimic signature language, or claim a source trade as the current creator's position.
- A sourced stance requires explicit adopted claim refs and an adoption confirmation unless the artifact is clearly labeled `cuebook_generated`.
- Do not place trades or silently publish. Frame drafts, media uploads, settlement registration, and publishing are separate authorized writes with explicit approval, exact hashes, OAuth scope, and UUIDv7 idempotency rules. The legacy `save_creator_artifact` and `register_settlement_claim` writes are superseded by the Frame draft/publish family and must not be reintroduced.

## Output

Return the contract in `references/cuebook-creation-bundle-v1.schema.json`. Validate it with:

```bash
node scripts/validate_creator_seed.mjs creator-seed-v1.json
node scripts/validate_creation_bundle.mjs creation-bundle-v1.json --query-bundle query-bundle-v1.json
```

Use `references/skill-assembly-golden.json` as the cross-repository `FrameDraftAssemblyV1 + FrameDraftAssemblyBindingV1` compatibility fixture.

Use `../../assets/creation-menu-v1.json` for product-facing creation choices and `../../assets/cuebook-modules-v1.json` for the module dependency boundary.
