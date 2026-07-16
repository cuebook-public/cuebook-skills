---
name: create-cuebook-content
description: Create Cuebook market posts, creator viewpoint graphics, settlement protocols, or publishing candidates from a user's explicit idea, selected Cuebook material, or an existing CuebookQueryBundleV1. Use when the requested deliverable is clearly a post, thread, trading viewpoint, viewpoint graphic, settlement condition, release bundle, or three publishing candidates. Preserve authorship, invoke query-cuebook whenever material current news, market data, fundamentals, comparators, history, or settlement bindings are missing, then return three calibrated candidates only when the workflow is not blocked. Do not use for read-only search, summaries, reports, data tables, or factual charts; do not silently publish, place trades, fabricate query results, or present a source opinion as the user's own view without explicit adoption.
---

# Create Cuebook Content

Provide one creation entrance for writing, viewpoint graphics, settlement expression, and release preparation. Creation owns the creator's expression. It may consume query output, but query data never becomes authorship by itself.

## Workflow

1. Capture and validate `CreatorSeedV1` from `references/creator-seed-v1.schema.json`. Preserve the seed verbatim and classify authorship as `creator_led`, `cuebook_assisted`, or `cuebook_generated`. A source post or Cuebook story is material, not proof that the current creator adopts its trade.
2. Compile the creator's requested subject, direction, horizon, mechanism, evidence needs, output channels, visual preference, and settlement intent.
3. Detect the latest compatible supplied artifact: creator seed, Query bundle, semantics, expression plan, viewpoint-data bundle, visual direction set, selected visual, or release bundle. Resume from that stage and do not reconstruct already validated artifacts.
4. Decide whether a seed query is required for semantics. Material current news, PR, price, valuation, comparator, history, or settlement premise requires a fresh or reusable `CuebookQueryBundleV1`. Freeze its query ID, content hash, result refs, source refs, state, `as_of`, freshness, warnings, and unavailable capabilities. After the expression plan locks the visual intent route, let the orchestrator issue one additional mixed Query only for unresolved routed requirements. Rendering branches never browse or call providers independently.
5. Run `$compose-cuebook-content-recipe`, then `$orchestrate-cuebook-creator-workflow`. The workflow may use query-layer research skills through the explicit `create -> query` module edge.
6. Preserve one meaning fingerprint across text, visual, and settlement branches. Produce exactly three meaning-equivalent candidates with real differences in expression and composition only when creation is `ready` or `conditional`.
7. Compile a settlement claim and formula only when the creator supplied or accepted the required asset, direction or comparator, horizon, observation rule, and threshold semantics.
8. Return `CuebookCreationBundleV1`. Selecting a settlement format only compiles artifacts; it never registers them. Saving, settlement registration, and publishing use the separate approved `write_actions` in the creation menu.

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
- Do not place trades or silently publish. `save_creator_artifact`, settlement registration, and publishing are separate authorized writes with explicit approval, exact hashes, OAuth scope, and idempotency rules.

## Output

Return the contract in `references/cuebook-creation-bundle-v1.schema.json`. Validate it with:

```bash
python scripts/validate_creator_seed.py creator-seed-v1.json
python scripts/validate_creation_bundle.py creation-bundle-v1.json --query-bundle query-bundle-v1.json
```

Use `../../assets/creation-menu-v1.json` for product-facing creation choices and `../../assets/cuebook-modules-v1.json` for the module dependency boundary.
