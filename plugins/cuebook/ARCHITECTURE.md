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
| L2b — Entry-embedded capability modules | Prose + schema files under the two public skills' `references/` | Consent-gated or optional-connector capabilities bound to one entry's flow (TradingView, decision memory) |
| L3 — Plugin assets | Module registry, menus, intent contract, capability map, index | Machine-readable routing and gating data shared by all skills |
| L4 — Generated bundles | `public-skills/`, repo-root `skills/`, submission packet | Never edited by hand; `build_release_skills.mjs` output, parity-checked in CI |

## One discovery surface, three entries

Host discovery sees exactly three skills. Growing the public surface requires
evidence that routing quality measurably improves and a validator update in the
same change; the default answer is no (adversarial review AR-09). Internal
capability never justifies discovery growth: it lands as L2a or L2b.

The third entry is the community skill marketplace front door:
`author-cuebook-skill` (L1) exists solely for community submission — package a
creator-authored skill, pre-check its structure, confirm one manifest card, and
walk the signed begin/PUT/complete upload that ends at "submitted for review".
It earned discovery because submission intent never routes through Query or
Create. Its four community tools (`list_community_skills`,
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
   direction, deliverable taxonomy.
2. `assets/creation-menu-v1.json` / `assets/query-menu-v1.json` — the closed
   option catalogs per entry (deploy gating vocabulary:
   `available` / `backend_required` / `optional_connector`).
3. `assets/mcp-capability-map-v1.json` — tool inventory, per-tool scopes, and
   the LATENCY tiers (`creator_fast_allowlist` / `focused_on_demand` /
   `deep_only`). Tier and deploy-gate are different axes on purpose: a tool can
   be fast once its backend exists.
4. The two SKILL.md files + `cuebook-intent-v1.schema.json` — behavioral prose
   and runtime normalization. They cite the data above; they never fork it.

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
| Capability map vs the DEPLOYED server | not yet automated — reconcile against the server's `tools/list` during integration passes until a checked-in server-registry snapshot comparison exists (adversarial review AR-04) |
| English-only public text | `validate:english` (multilingual test inputs use `\uXXXX` escapes) |
| Version surfaces | `release:prepare` single-source bump + `release:check` |

## Release discipline

Source edits → `npm run validate && npm test` → `npm run build:release` →
release prep (`release:prepare -- <version>`) → `release:verify` → feature
commit + `release: publish …` commit + tag + GitHub Release. Generated trees
are never patched directly; installed plugins follow tagged releases.
