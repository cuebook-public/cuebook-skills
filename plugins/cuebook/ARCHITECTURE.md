# Cuebook Plugin Architecture

This document is the governance contract for how the Cuebook skill surface is
layered, extended, routed, and released. The README describes what the plugin
does; this file fixes how it is allowed to grow. Changes that break one of
these rules need a deliberate edit HERE in the same commit.

## Layers

| Layer | Contents | Authority |
|---|---|---|
| L0 — MCP server | Tools, scopes, OAuth, schemas | The deployed server registry is the runtime truth; `assets/mcp-capability-map-v1.json` is this repo's audited snapshot of it |
| L1 — Public entrypoints | `query-cuebook`, `create-cuebook-content`, `author-cuebook-skill` | The ONLY discoverable skills. Everything a host can select routes through these three |
| L2a — Internal pipeline skills | 36 directories under `skills/` | Routable stages invoked via `$skill-name` or a menu `skill_refs`; each owns its schemas, validators, and tests |
| L2b — Entry-embedded capability modules | Prose + schema files under a public entry's `references/` | Consent-gated or optional-connector capabilities bound to one entry's flow (TradingView, decision memory) |
| L3 — Plugin assets | Module registry, menus, intent contract, capability map, index | Machine-readable routing and gating data shared by all skills |
| L4 — Generated bundles | `plugins/runtime/cuebook/`, repo-root `skills/`, submission packet | Never edited by hand; one sanitized three-Skill host runtime plus generic bundles, parity-checked in CI |

Host adapters live outside this Skill layering. The Hermes adapter at
`plugins/hermes/cuebook-auth/` may register one explicit slash-command menu
entry, call the host's native loopback Dashboard OAuth API, and return its
validated approval link. It must not add a fourth Skill, copy a Cuebook token,
implement an MCP transport, or intercept ordinary natural-language turns.

## One discovery surface, three entries

Host discovery sees exactly three skills. Growing the public surface requires
evidence that routing quality measurably improves and a validator update in the
same change; the default answer is no (adversarial review AR-09). Internal
capability never justifies discovery growth: it lands as L2a or L2b.

Public entrypoints are an implementation boundary, not a conversational menu. The creator states
an intent; the host selects the relevant entry and its internal branches silently. User-facing
language must never announce that Cuebook is entering a Skill, workflow, stage, lane, route, or
subflow. Each branch should feel like Cuebook naturally understanding the next useful action.

The third entry is the community skill marketplace front door:
`author-cuebook-skill` (L1) exists solely for community submission — package a
creator-authored skill, pre-check its structure, confirm one manifest card, and
walk the signed begin/PUT/complete upload that ends at "submitted for review".
It earned discovery because submission intent never routes through Query or
Create. It is recorded in `standalone_entrypoints`, must never appear in either
module's `skill_refs`, and is never an implicit Create dependency. Frame, canvas,
post, Artifact, or other ordinary content publication cannot activate its
package-submission or marketplace rules. Its four community tools (`list_community_skills`,
`get_community_skill`, `begin_skill_publish`, `complete_skill_publish`) live in
the capability map like every other tool, with the submission pair behind the
one-time `cuebook.community.publish` consent. The distribution surface for
approved packages is the separate community repo
(`github.com/cuebook-public/cuebook-community-skills`), populated only by the
platform's review-then-bot pipeline — never by this repo's release process.

## Extension pattern criteria

Choose the pattern by answering one question: **is this a routable pipeline
stage, or a policy surface of one entry?**

Use **L2a (internal skill)** when the capability:
- produces or validates a typed artifact other stages consume (`…V1` schema),
- is invoked by name (`$skill-name`) or appears in a menu's `skill_refs`,
- owns executable validators/tests that CI runs.

Use **L2b (entry-embedded module)** when the capability:
- is an optional connector or consent-gated feature woven into ONE entry's
  conversation flow (activation rules, ceilings, wording discipline),
- has no independent routability — no other skill would ever `$`-invoke it,
- ships prose + bounded schemas/policies, with at most thin validators.

Current L2b residents: TradingView (workbench + focused capture on Query;
attributed snapshot + canvas transfer on Create) and decision memory (coach +
recent-interests readback on Query; proposal discipline on Create). Cross-entry references between the two
public skills use `$query-cuebook/references/...` and are legal because Create
already vendors Query's full closure by design (`create_may_invoke_query`).

## Routing truth hierarchy

Routing facts exist at four layers. Lower layers may only refine, never
contradict, the layer above; the validator is the referee.

1. `assets/cuebook-modules-v1.json` — canonical module split, `may_invoke`
   direction, standalone entrypoints, and deliverable taxonomy.
2. `assets/creation-menu-v1.json` / `assets/query-menu-v1.json` — the closed
   option catalogs per entry (deploy gating vocabulary:
   `available` / `backend_required` / `optional_connector`).
3. `assets/mcp-capability-map-v1.json` — tool inventory, per-tool scopes, and
   the LATENCY tiers (`creator_fast_allowlist` / `focused_on_demand` /
   `deep_only`). Tier and deploy-gate are different axes on purpose: a tool can
   be fast once its backend exists.
4. The two SKILL.md files + `cuebook-intent-v1.schema.json` — behavioral prose
   and runtime normalization. They cite the data above; they never fork it.

## Frame publication metadata boundary

Frame MCP Phase B v3 keeps four concerns independent:

- the Artifact URL and immutable poster describe expression;
- `settlement` is a closed non-settling or market-economic branch;
- `subject_asset_refs` support discovery without implying settlement;
- `reasoning_tags` are release-bound auxiliary metadata inferred by the agent
  from the confirmed interaction and evidence.

The parent reasoning registry is closed to `fundamental`, `technical`,
`macro_event`, `flow_positioning`, `sentiment_narrative`, and
`risk_management`. An envelope contains at most one primary and two distinct
secondary tags; honest empty is valid. The creator never selects or confirms
these tags, and frontend forms, rendering, badges, and feed projection do not
consume them. They may change on an append-only Correction without changing
content or economic hashes. Author-only child Frames use their own envelope and
may additionally carry child-only `retrospective`; that tag is frozen into the
child content hash and never changes the parent release.

Release immutability and Frame visibility are also separate. MCP publishes
immutable initial/Correction releases and exposes no author-management action.
Cuebook App owns hide/show and may offer server-governed deletion during the
first hour. Skill text must not invent an MCP management path.

## Dormant capability registry

A capability that is built but not routable MUST be declared in
`assets/plugin-index-v1.json` `release_profile` instead of drifting silently.
Current dormant entries:

- `motion` — internal, disabled in menus (`direct-` / `render-cuebook-viewpoint-motion`).
- `advanced_workflow` — the resumable orchestration cluster
  (`orchestrate-cuebook-creator-workflow`, `compose-cuebook-content-recipe`,
  `normalize-cuebook-creator-feed`) was removed from runtime bundles in 0.9.8;
  source and tests remain for a future re-entry decision.
- `viewpoint_intake_triage` — `intake-cuebook-viewpoint` and
  `select-cuebook-content-opportunities` currently have no inbound route: the
  0.9.9 in-conversation interview superseded the standalone intake front door.
  Parked pending an owner decision to either delete them or re-route them.

Everything else in the module registry must be reachable from a public entry
or a menu; the graph, not intentions, is the test.

## Fast-preview input budget

`create-cuebook-content`'s fast path may read at most the 10 files listed in
the release manifest's `frame_fast_preview_budget`, and their built total must
stay under the builder's `FAST_PREVIEW_BYTE_LIMIT` (112 000 bytes since
0.9.12; raised from 110 000 for the decision-memory routing lines). Rules:

- New capabilities put ONE routing pointer in SKILL.md and everything else in
  on-demand references — SKILL.md prose is the most expensive real estate.
- Raising the limit is a deliberate, commented, changelog-visible decision,
  never a build-fix.
- The dominant budget items (the two Frame preview-job schemas, ~39 KB
  combined) are the first candidates if the ceiling ever truly binds.

## Drift gates

| Drift risk | Gate |
|---|---|
| Bundles vs source | `verify:release-bundles` + isolated-rebuild test |
| Capability map vs validator expectations | scope maps inside `validate_cuebook_plugin.mjs` |
| Capability map vs backend MCP contract | the exact Phase B v3 contract version plus generated tool-manifest and schema-catalog SHA-256 values are pinned in the map, schema, validator, and tests; refresh them together from the backend generator |
| Capability map vs the DEPLOYED server | reconcile the pinned backend contract against the server's `tools/list` during integration passes; deployment state remains runtime truth (adversarial review AR-04) |
| Distribution endpoint vs branch | `distribution:check` in CI: `dev` is development (`cuebook.xyz`), `main` and releases are production (`cuebook.app`) |
| English-only public text | `validate:english` (multilingual test inputs use `\uXXXX` escapes) |
| Version surfaces | `release:prepare` single-source bump + `release:check` |

## Release discipline

Source edits → `npm run validate && npm test` → `npm run build:release` →
release prep (`release:prepare -- <version>`) → `release:verify` → feature
commit + `release: publish …` commit + tag + GitHub Release. Generated trees
are never patched directly; installed plugins follow tagged releases.
`release:prepare` also forces the production distribution channel before it
regenerates stable bundles.

## Branch distribution invariant

Treat the branch-to-origin mapping as release-critical state, not documentation:

- `dev` and every feature branch targeting `dev` use the development channel:
  connector URL, OAuth resource, capability server, and generated schema origins
  are `cuebook.xyz`.
- `main` and release preparation use the production channel: those same
  branch-bound surfaces are `cuebook.app`.
- Production submission files and platform comparison prose may name the
  production origin while developed on `dev`; they are documentation, not the
  active branch connector.

Change channels only through `distribution:development`,
`distribution:production`, or release preparation. The branch-aware CI
`distribution:check` gate is authoritative; never hand-edit one endpoint in
isolation.
