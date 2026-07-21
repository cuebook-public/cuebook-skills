# Changelog

## Unreleased

## 0.9.2 — 2026-07-21

- Unified Frame publication with Cuebook's displayed price snapshot: a fresh realtime observation when available, otherwise the latest completed close or sole stored observation.
- Removed the duplicate freshness and provider-period publication gate, and kept a missing price creator-facing only when Cuebook has no stored display price for the asset.

## 0.9.1 — 2026-07-21

- Made Frame publication explicitly independent of market hours: creators can publish equities, ETFs, and indexes before open, after close, on weekends, and on exchange holidays using the latest eligible persisted observation.
- Prevented Agents from presenting `missing_eligible_observation` as a reason to wait for the next trading session; it is a temporary data-availability condition only.

## 0.9.0 — 2026-07-21

- Reduced ordinary Frame publication after approval to one upload reservation, one signed image PUT, and one high-level publish call; media processing, manifest registration, draft assembly, preparation, and baseline capture now stay server-side.
- Reused the preview runner's frozen PNG hash and byte size so publication no longer rereads design references, reruns image audits, rebuilds release contracts, polls media, or performs post-publish readback.
- Added the fast initial-publish MCP contract and the deadline observation policy that can seal a persisted realtime price or provider-official completed close already shown by Cuebook.

## 0.8.0 — 2026-07-21

- Clarified the in-place Codex update path for local-checkout marketplaces, which refresh with `codex plugin add` and do not support `marketplace upgrade`.
- Added OpenAI Plugins Directory submission metadata, deterministic reviewer fixtures, and a two-entrypoint upload bundle gate.
- Replaced non-English catalog prompts with concise English starters and added public privacy, terms, and support metadata.
- Documented one transparent creator authorization covering research, simulated Paper Trade, and Frame scopes while preserving explicit action confirmation.

## 0.7.0 — 2026-07-21

- Reframed creation as one Cuebook experience: recognize the creator's edge, expand it with the smallest useful Cue or market relationship, lock the meaning once, reveal one relationship visually, and preserve it with a future checkpoint.
- Added a specific post-preview reveal and warmer post-publication recognition so Cuebook's contribution is visible without provider narration, generic praise, or workflow theater.
- Split context regression gates into a sub-110k fast-preview input and a sub-40k on-demand publication input, keeping the Frame capability contract out of the preview lane until it is needed.
- Added safe `release:prepare`, `release:check`, and `release:verify` automation that synchronizes package manifests, pinned install refs, changelog notes, and generated bundles without committing, tagging, pushing, deploying, or touching OAuth.
- Replaced the dirty-tree-sensitive generated-bundle gate with an isolated byte-for-byte rebuild comparison, so a release can be verified before its commit exists.
- Documented Cuebook's creator experience, release workflow, and separation between public package versions and frozen internal catalog or wire versions.

## 0.6.0 — 2026-07-20

- Rebuilt Frame creation around one 2488 × 1056 publication master authored for a 622 × 264 mobile display; no compact, web, thumbnail, or OG authoring variants.
- Added phone-scale expression gates and validated eleven distinct visual families across curves, relative strength, drawdowns, correlation, events, thresholds, scenarios, mechanisms, evidence tension, Creator Lenses, and long-short contributions.
- Made relative-view visuals select the evidence transform that actually supports the tested observation.
- Expanded the reasoned Frame body while keeping the first paragraph useful as a feed lead and the image intentionally sparse.
- Simplified ordinary publication to the direct preview-to-Frame lane and removed generated HTML, canonical links, browser readback, and post-publish `get_frame` from the creator flow.
- Standardized eligible single-asset settlement on the creator's exact deadline, with session selection remaining backstage.
- Documented in-place Plugin updates that preserve the existing MCP configuration and OAuth grant.

## 0.5.0 — 2026-07-19

- Reduced Codex discovery to two public Skills with internal modules packaged as on-demand references.
- Added the Cuebook Plugin distribution, remote MCP configuration, platform guides, and deterministic Frame expression system.
