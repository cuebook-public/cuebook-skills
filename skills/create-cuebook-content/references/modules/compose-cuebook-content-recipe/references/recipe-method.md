# Content Recipe Method

## Placement

The recipe can enter the workflow in two places:

```text
ingredient_first: CreatorFeedV1 -> ContentRecipeV1 -> constrained opportunity selection
opportunity_first: CreatorFeedV1 -> ContentOpportunitySetV1 -> ContentRecipeV1
preset_auto: CreatorFeedV1 -> conditional ContentRecipeV1 -> automatic selection -> resolved recipe revision
```

The orchestrator receives only a validated or explicitly conditional recipe. A conditional recipe may plan nodes but cannot reach release readiness until its blockers resolve.

## Frontend Sections

| Section | User-facing job | Stored field |
| --- | --- | --- |
| Main dish | Choose one subject or selected opportunity | `anchor` |
| Ingredients | Pick records from five Cuebook domains | `ingredients` |
| Preparation | Choose research depth and reasoning lenses | `preparation` |
| Protocol | Choose ordinary commentary or a versioned, settleable thesis | `execution.selected_skill_ids` |
| Flavor | Choose profile, stance, density, language, and authorship mode | `flavor` |
| Plating | Choose channels, formats, counts, and bundle topology | `plating` |
| Kitchen | Choose optional skills, approvals, and extensions | `execution`, `extensions` |

## Resolution Rules

The resolver always includes intake, selection, recipe composition, projection validation, narrative routing, research, orchestration, and at least one renderer. It adds:

- `plan-market-content-program` for multiple outputs, series, lifecycle, or batch work;
- `compose-cuebook-trading-thesis` when the user selects `可结算观点` or applies `preset-settleable-thesis`; it runs after research and before planning or rendering;
- `render-cuebook-market-post` for X, Telegram, and buy-side notes;
- `render-cuebook-market-media` for Reddit, Xiaohongshu, Douyin, short video, long-form, and owned-web packages;
- `render-cuebook-market-figure` when the creator selects a data-led Feed figure; route to event reaction, relative strength, expectation revision, fundamental driver, positioning pressure, or sensitivity according to available sourced data;
- `render-cuebook-thesis-chart` when the creator selects a chart block or the output format is `viewpoint_card`; chart mode follows the claim and benchmark, while horizon selects the preferred interval;
- `compute-cuebook-market-indicators` when the creator selects indicator evidence; each result keeps its formula, lookback, interval, as-of time, and forming/sealed state;
- `assemble-cuebook-viewpoint-card` when the output format is `viewpoint_card`; it runs after text, settlement, chart, and indicator artifacts are available and preserves the creator's free text;
- `prepare-market-content-release` for release candidates;
- `assemble-cuebook-publish-candidates` for one-pass frontend choice sets containing three short posts, three passed static visuals, and one optional shared settlement projection;
- `reconcile-market-content-history` for postmortem or correction modes.

The catalog distinguishes `selectable`, `automatic`, and `internal` skills. Frontends expose only `selectable` entries on creator surfaces; automatic and internal entries remain visible in the execution trace.

## Frontend Catalog Rules

- Render category tabs from `categories` ordered by `order`; do not hardcode skill IDs into components.
- Use `visibility`, `user_selectable`, `status`, and `ui.control_type` to decide whether a skill is editable, trace-only, hidden, or unavailable.
- Treat presets as editable starting recipes. Show each ingredient `min/max`, default outputs, and optional skills before resolving it.
- Present `可结算观点` as a protocol toggle. Explain its required fields inline: instrument, direction, horizon, cutoff, evidence, countercase, invalidation, resolution window, source, and disclosure. Keep it off for ordinary commentary and keep these protocol fields outside body copy.
- Serialize the first authoring step as `CreatorViewIntentV1`; asset, deadline, outcome, evidence choices, and creator text are product fields rather than separate skills. Show chart and indicator skills as optional evidence plugins in the second step.
- Present authorship as a segmented control: `创作者主导`, `Cuebook 协作`, `Cuebook 生成`. Store it as `flavor.authorship_mode`. Assistance provenance is internal; expose only `不公开提及` and policy-driven `仅披露` through `flavor.assistance_attribution`.
- A policy disclosure stays separate from the content body. The renderer never says what Cuebook added or how the idea changed.
- Pin `catalog_version` and every resolved skill version when saving. Re-resolve a copied recipe against a newer catalog instead of silently changing the original.
- Build the maintenance view from `maintenance.owner`, `stability`, `last_verified_at`, `schema_refs`, `validator_refs`, and `test_refs`. Use `replaced_by` to guide migrations for deprecated entries.
- Render extensions from `extension_points`; provider setup and credentials live outside ContentRecipeV1.
- Disable public freeze until a thesis-registry provider is configured. Settlement, reputation, and feed-ranking providers are runtime services and cannot be simulated by selecting more writing skills.

## Adding Or Updating A Skill

1. Create or update one skill folder with a stable output contract, validator, and regression test.
2. Add one SkillCatalogV1 entry with semantic version, visibility, UI metadata, inputs, output, dependencies, supported modes/channels, owner, and local relative locators.
3. Use `selectable` only when a creator may safely toggle the capability. Safety and routing skills remain `automatic` or `internal`.
4. For a new destination, register `custom:<channel>` on a renderer skill. The orchestrator resolves it through a `catalog:<capability>` node. A provider-only integration uses the `custom_renderer` extension point.
5. Run both catalog and recipe validators, then all downstream workflow tests.
6. Breaking contract changes increment the catalog major version. Saved recipes retain their previous catalog pin; migrate by creating a new recipe revision.

## Revision Rules

- Save user edits as a new recipe revision, keeping `recipe_id` stable.
- Pin the catalog version and explicit skill versions used for resolution.
- Re-resolve after a catalog, preset, selected ingredient, output, or extension change.
- Preserve old recipes for reproducibility; archive them instead of mutating historical runs.
- Do not store provider credentials or source bodies in the recipe.
