---
name: compose-cuebook-content-recipe
description: Compose or validate an advanced frontend-selected Cuebook Frame recipe after a fast preview, or when the user explicitly chooses ingredients, presets, analysis controls, batches, or three alternatives. The public destination is always Frame. Do not invoke this contract-heavy recipe step for an ordinary raw idea that only needs one quick Frame preview; do not write final copy, bypass evidence gates, place trades, or publish externally.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Compose Cuebook Content Recipe

Turn creator selections into one deterministic recipe that the workflow orchestrator can resolve. Keep the recipe as intent and configuration; facts, research, prose, approvals, and publication receipts stay in their owning artifacts.

The ordinary raw-idea path bypasses this Skill and returns `FramePreviewV1` directly. Enter recipe composition only after preview selection or for explicit advanced controls. The default preset requests one Frame; a count of three is opt-in.

## Workflow

1. Load `CreatorFeedV1` and, when available, `ContentOpportunitySetV1`.
2. Load `references/skill-catalog-v1.json`; pin its `catalog_version` in the recipe.
3. When running inside the Cuebook plugin, resolve frontend choices from `../../assets/creation-menu-v1.json`. The menu is presentation metadata; SkillCatalogV1 remains authoritative for dependencies, versions, visibility, and execution.
4. Choose one selection mode:
   - `ingredient_first`: the user selects feed records and a primary ingredient before opportunity selection.
   - `opportunity_first`: the user starts from one selected opportunity and adjusts its ingredients.
   - `preset_auto`: the user chooses a recipe preset and lets selection resolve later.
5. Record ingredients separately: news, calendar, narratives, trade ideas, and trade history. Give trade history an explicit permitted use.
6. Record preparation, flavor, Frame plating, execution, and optional extension providers. In the public plugin path, resolve exactly one `frame/publish_candidate_set` output; legacy channel values are compatibility inputs, never creation-menu choices. In `flavor`, preserve `authorship_mode` (`creator_led`, `cuebook_assisted`, or `cuebook_generated`) and `assistance_attribution` (`none` or `disclosure_only`). Cuebook collaboration stays out of body copy; use a separate disclosure surface only when policy requires it. When the creator selects `compose-cuebook-trading-thesis`, treat the output as a canonical thesis declaration rather than ordinary market commentary.
7. Resolve automatic and required skills from the catalog. Preserve the user's selectable skills separately.
8. Validate the recipe with `node scripts/validate_content_recipe.mjs <recipe.json>` before sending it to `$orchestrate-cuebook-creator-workflow`.

Read `references/recipe-method.md` when resolving modes, output channels, presets, or skill dependencies.

## Ingredient Rules

- One recipe has one primary subject. Multiple entities are allowed only when the relationship is explicit.
- News supplies attributable facts; duplicate source clusters do not count as independent ingredients.
- Calendar entries supply timing and event state. A scheduled event does not prove an outcome.
- Narratives remain hypotheses or derived frames until research establishes their claims.
- Trade ideas supply a supported asset expression, horizon, catalyst, and internal risk boundary. Body copy defaults to the argument and next observable; it does not need to narrate the risk boundary.
- Trade history requires an explicit `history_use`. Only authorized, cutoff-safe records may reach a valid recipe.
- A recipe may be conditional while ingredients or providers are unresolved. It cannot be marked valid by hiding those gaps.
- `cuebook_assisted` requires an actual creator seed downstream. Assistance provenance stays internal and `assistance_attribution` defaults to `none`.
- The public Cuebook creation recipe always includes both text and visual work. Do not offer a text-only Frame or a social-platform derivative.

## Skill Selection

- `selected_skill_ids` contains choices exposed to the user, such as a settleable thesis, program planning, release preparation, or reconciliation.
- `compose-cuebook-trading-thesis` is an explicit creator choice. When selected, research must produce `TradingThesisV1` before any renderer and every derivative must preserve its versioned reference and canonical hash.
- `resolved_skill_ids` contains the full executable set, including automatic and internal safety skills.
- A user cannot disable projection, routing, evidence, policy, or lineage guards.
- A catalog version change does not silently mutate a saved recipe. Re-resolve it and create a new recipe revision.
- Extensions register through declared extension points. Credentials and provider secrets never enter ContentRecipeV1.
- New installed capabilities use `catalog:<capability>` workflow nodes. Custom destinations use `custom:<channel>` and resolve to a catalog renderer or required `custom_renderer` provider.

## Hard Gates

- Unknown, duplicate, quarantined, retracted, expired, or post-cutoff ingredient: block or remove it.
- `ingredient_first` without a selected primary ingredient: block execution.
- `opportunity_first` without a selected opportunity: block.
- Trade history selected with `history_use: none`, private reuse, or unreconciled public performance: block.
- A public plugin recipe whose output is not exactly `frame/publish_candidate_set`, or whose visual branch is missing: block. Legacy channel/format pairs may validate only for stored compatibility recipes and must not be surfaced in the creation menu.
- `assistance_attribution` outside `none|disclosure_only`: block. Disclosure-only text belongs in the platform disclosure surface, never the argument body.
- A selected strict-thesis path with incomplete resolution criteria, post-cutoff evidence, unknown public disclosures, or no thesis lineage: block release while allowing a conditional draft.
- A selected content-first settlement path with an unconfirmed deadline, threshold, session, benchmark, event definition, or source: keep the claim in `needs_confirmation` and block its release attachment.
- `seeking_alpha_internal` may produce an internal outline only.
- Personalized order quantity, leverage, credentials, or execution instructions remain prohibited downstream.

## Output Contract

Return `ContentRecipeV1` from `references/content-recipe-v1.schema.json`. A valid recipe contains:

```json
{
  "schema_version": "content-recipe-v1",
  "recipe_id": "RECIPE_...",
  "revision": 1,
  "state": "valid",
  "catalog_version": "1.28.0",
  "selection_mode": "opportunity_first",
  "anchor": {},
  "ingredients": {},
  "preparation": {},
  "flavor": {},
  "plating": {},
  "execution": {},
  "extensions": [],
  "validation_report": {}
}
```

## Resources

- `references/content-recipe-v1.schema.json`: authoritative recipe contract.
- `references/skill-catalog-v1.json`: canonical frontend skill and preset registry.
- `references/skill-catalog-v1.schema.json`: registry contract.
- `references/recipe-method.md`: selection modes, ingredient roles, and resolution rules.
- `../../assets/creation-menu-v1.json`: product-facing ingredient, reasoning, voice, visual, settlement, and output choices.
- `scripts/validate_content_recipe.mjs`: recipe, feed, opportunity, and catalog checks.
- `scripts/validate_skill_catalog.mjs`: catalog dependency, visibility, version, and path checks.
- `tests/validate_content_recipe.test.mjs`: recipe regressions using `node:test`.
- `tests/validate_skill_catalog.test.mjs`: catalog regressions using `node:test`.
- `evals/trigger_cases.json`, `evals/rubric.md`, and `evals/failure_cases.md`: routing and quality evaluation.
