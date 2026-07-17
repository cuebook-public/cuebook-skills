---
name: create-cuebook-content
description: Create Cuebook Frames from a user's explicit idea, selected Cuebook material, or an existing CuebookQueryBundleV1. Use when the requested deliverable is a creator-owned market viewpoint expressed as one title, one body, and one paired image, optionally backed by hidden settlement semantics and a later approved Frame publication. Preserve authorship, improve the creator's expression, invoke query-cuebook whenever material current news, market data, fundamentals, comparators, history, or settlement bindings are missing, then return three calibrated Frame choices only when the workflow is not blocked. Do not create X, Xiaohongshu, Reddit, Telegram, thread, caption, or other social-platform variants; do not use for read-only search, summaries, reports, data tables, or factual charts; do not silently publish, place trades, fabricate query results, or present a source opinion as the user's own view without explicit adoption.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for asset resolution and market data; degrades to partial results, never invented values, when tools are unavailable. Node.js 18+ for validators.
---

# Create Cuebook Content

Provide one creation entrance for Frame writing, its paired viewpoint image, optional settlement semantics, and release preparation. Creation owns the creator's expression. It may consume query output, but query data never becomes authorship by itself.

## Workflow

1. Capture and validate `CreatorSeedV1` from `references/creator-seed-v1.schema.json`. When the input is free-form visitor text still missing a verified asset, direction, or horizon, run `references/skills/intake-cuebook-viewpoint/SKILL.md` first: it triages 查询 versus 表达观点, elicits only the missing fields, verifies them, and returns a confirmed `ViewpointIntakeV1` seed — or routes a pure lookup to query without creation. Preserve the seed verbatim and classify authorship as `creator_led`, `cuebook_assisted`, or `cuebook_generated`. A source post or Cuebook story is material, not proof that the current creator adopts its trade.
2. Compile the creator's requested subject, direction, horizon, mechanism, evidence needs, visual preference, and settlement intent. The destination is fixed to Frame; do not ask the user to choose a platform. A ready or conditional creation always includes both text and one paired visual.
3. Detect the latest compatible supplied artifact: creator seed, Query bundle, semantics, expression plan, viewpoint-data bundle, visual direction set, selected visual, or release bundle. Resume from that stage and do not reconstruct already validated artifacts.
4. Decide whether a seed query is required for semantics. Material current news, PR, price, valuation, comparator, history, or settlement premise requires a fresh or reusable `CuebookQueryBundleV1`. Freeze its query ID, content hash, result refs, source refs, state, `as_of`, freshness, warnings, and unavailable capabilities. After the expression plan locks the visual intent route, let the orchestrator issue one additional mixed Query only for unresolved routed requirements. Rendering branches never browse or call providers independently.
5. Run `references/skills/compose-cuebook-content-recipe/SKILL.md`, then `references/skills/orchestrate-cuebook-creator-workflow/SKILL.md`. The workflow may use query-layer research skills through the explicit `create -> query` module edge.
6. Preserve one meaning fingerprint across text, visual, and settlement branches. Produce exactly three meaning-equivalent Frame candidates with real differences in expression and composition only when creation is `ready` or `conditional`. Each candidate's only creator-facing projection is one title, one body, and one paired image.
7. Compile a settlement claim and formula only when the creator supplied or accepted the required asset, direction or comparator, horizon, observation rule, and threshold semantics.
8. Require one confirmed candidate and its paired selected visual direction before assembling `FrameDraftAssemblyV1`. Verify that its public projection contains exactly `frame.title`, `frame.body`, `frame.image_ref`, and image `alt_text`; render only the first three. Set `frame_draft.title` to the selected `copy.headline` exactly and `frame_draft.body` to trimmed `copy.body + "\n\n" + copy.close`; both must equal the public `frame` projection and must never be rewritten after selection. Carry the selected direction-set ref, the exact encoded PNG byte hash for each media role, the authoritative per-role manifest alt text, the `SettlementIntentV1` accepted during selection, the visual-manifest lineage hash, and a fresh **UUIDv7** `idempotency_key`. Manifest `role_hashes` are canonical RGBA8 pixel hashes and must never substitute for byte hashes. Run the pre-upload Frame handoff preflight below; non-settleable directions assemble no intent and stay store-only.
9. Return `CuebookCreationBundleV1`. Selecting a settlement format only compiles artifacts; it never registers them. Saving, settlement registration, and publishing use the separate approved `write_actions` in the creation menu.
10. When the user asks to publish and the Frame MCP family is available, follow the frozen sequence in `assets/plugin/mcp-capability-map-v1.json`: `get_frame_capabilities` → `begin_frame_media_upload` for each role → signed HTTPS PUT for each role → `complete_frame_media_upload` for each role → poll owner-only `get_frame_media_status` until encoded-byte and canonical-pixel receipts are ready → `register_frame_visual_manifest` → `create_frame_draft` with `FrameDraftAssemblyV1 + FrameDraftAssemblyBindingV1` (or `update_frame_draft` under optimistic concurrency) → `prepare_frame_publish` → the user approves the exact prepared hash on Cuebook's first-party consent page → poll `get_frame_action_consent` → `publish_frame` → `get_frame` using the receipt's versioned Frame ref. The status call returns processing and hashes only: never pull image bytes, dereference a display URL, or treat a rendition as an independently retrievable product. If the host cannot perform the signed PUT, return `blocked/client_upload_capability_required`; never fall back to base64. Run the registered handoff preflight below before draft creation.
11. Give every mutation its own fresh lowercase UUIDv7. The assembly key belongs only to `create_frame_draft`; begin, complete, register, update, prepare, publish, correction, and withdrawal commands never reuse it or each other's keys. Replaying the same key with the same payload recovers the same receipt; changing the payload under that key is a conflict. Content fixes after release use `create_frame_correction_draft` → `prepare_frame_correction_publish` → first-party consent → `publish_frame_correction`, while preserving the frozen contract. Stopping distribution uses `prepare_frame_withdraw` → first-party consent → `withdraw_frame`. A tool absent from `tools/list` or returning unavailable means that phase is not enabled; report the state and do not fall back to a legacy write.

## Creator Experience Contract

- Begin with the creator's actual judgment. Treat it as the idea to improve, not a claim to debunk before helping.
- Keep three layers distinct internally: the creator-owned viewpoint, Cuebook-supported reasoning or hypothesis, and Cuebook-backed observed facts. Combine them fluently in the Frame without mislabeling ownership.
- Evidence may strengthen, connect, narrow, or condition the viewpoint. If fresh Cuebook data creates a material contradiction, state the conflict plainly and let the creator choose an honest version; never silently replace their view or turn the Frame into a correction lesson.
- Make the result feel like an upgrade: sharper title, concise causal body, and an image that makes the reasoning, observed trend, and time horizon easier to grasp. Support the user; do not lecture, score, or expose internal caveats unless they change the claim.
- Keep text and image complementary. The title and body carry the hook, viewpoint, and concise mechanism. The image carries two to four reasoning beats, observed evidence or trend, and an observation-window, horizon, or accepted settlement marker when material. Never draw a fabricated future price path.
- Keep tags, candidate labels, evidence ledgers, source counts, quality scores, settlement objects, disclosures, and workflow state backstage. The creative shown to the user is only title, body, and one image.
- After delivering, selection, or publication, add one short conversational handoff outside the Frame: acknowledge a specific strength in the creator's idea, say what Cuebook concretely helped support or structure without taking ownership, and suggest one useful next watch, comparison, follow-up, or settlement check. Do not use generic praise or a marketing slogan.

## Frame Handoff Preflight

Before upload, prove the assembly still carries the exact user-selected content, paired visual direction, capture artifacts, and encoded PNG hashes:

```bash
node scripts/validate_frame_draft_assembly.mjs assembly.json \
  --candidate-set publish-candidate-set-v1.json \
  --direction-set visual-direction-set-v1.json \
  --capture-report capture-report.json
```

After manifest registration, repeat the same proof with the server binding and locally built manifest. This adds registered lineage, authoritative alt text, and canonical pixel-hash checks:

```bash
node scripts/validate_frame_draft_assembly.mjs assembly.json \
  --candidate-set publish-candidate-set-v1.json \
  --direction-set visual-direction-set-v1.json \
  --capture-report capture-report.json \
  --binding binding.json \
  --visual-manifest frame-visual-manifest-v1.json
```

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

- A read-only request routes to `references/skills/query-cuebook/SKILL.md` and stops there.
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

Use `assets/plugin/creation-menu-v1.json` for product-facing creation choices and `assets/plugin/cuebook-modules-v1.json` for the module dependency boundary.
