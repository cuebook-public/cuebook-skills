# Changelog

## Unreleased

## 0.9.11 — 2026-07-22

- Added two optional, separately installed TradingView connectors behind the same two public Skills, without a third entrypoint: a local Desktop/CDP bridge for the creator's own charts and a network research server, each restricted to an audited read subset that excludes persistent-state, security-sensitive, and opaque buy/sell-stance tools.
- Query can now, on explicit request, inspect the currently open TradingView Desktop chart with exact identity binding, run one bounded research pass, and produce one high-density focused capture of the latest structure — recent bars fill the surface, the price axis stays legible, and raw captures remain local analysis material rather than publishable evidence.
- Create can turn a rights-cleared official TradingView snapshot into one plain finished bitmap through the existing image audit: visible TradingView attribution, confirmed overlay rights, applicable price lock, and undistorted geometry are required, focus and audit records stay local quality gates, and every failed condition falls back to Cuebook-native rerendering.
- Create can also place a separately confirmed, enumerated set of levels, zones, checkpoints, notes, or historical segments on the creator's local TradingView chart as a verified drawing transaction that preserves existing drawings and rolls back atomically on failure; Frame and canvas remain separate confirmed outputs.
- Normalized mixed requests through one intent contract that routes by effect, orders dependent steps, and defaults ambiguity to a single read-only answer; asset search results are now treated as ranked candidates, and only an exact identity match binds an asset.

## 0.9.10 — 2026-07-22

- Softened public uncertainty language across Frame copy and visuals: counter-signals now read as optional reasons to reassess rather than hard invalidation, falsification, or self-correction statements, while structured settlement semantics stay unchanged.
- Made Frame body shape adaptive to the idea, with varied paragraph count, weight, opening rhythm, and closing move instead of a repeated observation-to-risk template.
- Expanded copy-capacity and regression gates so layered viewpoints can breathe without forcing simple ideas to fill the same length or exposing Markdown and memo-style headings.

## 0.9.9 — 2026-07-22

- Added creator-owned compound Frames for ideas such as “TSLA rises while NVDA stays within ±5%”: Cuebook freezes two independent same-session conditions at one creator-owned deadline, makes the AND rule visible in copy and graphics, and publishes both legs through the same atomic path.
- Added creator-owned relative Frames: natural language such as “NVDA should outperform TSLA” now freezes a two-asset equal-notional return-spread settlement, keeps both legs visible in normalized comparison graphics, and uses the same atomic publication path without implying an executed trade.
- Made creator-owned Frame bodies first-person by default while keeping facts, reported evidence, and other Cues correctly attributed; public copy now rejects bracketed evidence-taxonomy headings and memo-style verification blocks without inventing positions or personal experience.
- Added creator-confirmed terminal range Frames for ideas such as “this asset will not move much”: the creator chooses the exact horizon and symmetric ± band, Cuebook settles inclusively on the absolute endpoint return, and whole-window barrier claims remain explicitly unsupported rather than being silently reinterpreted.
- Deepened the creator interview without turning it into a form: Cuebook now normally opens one compact Cue-backed thought-anchor exchange and may ask one final consequential follow-up, while preserving an immediate skip and reusing the same bounded research read.
- Added a locale-aware Creator Voice Polish inside the existing drafting pass: it removes clustered AI writing habits while preserving creator meaning, attribution, evidence typing, numbers, timing, and settlement without an external dependency or extra model round.

## 0.9.8 — 2026-07-21

- Removed the advanced workflow closure, draft-assembly validator, and lower-level initial-publication compatibility actions from generated runtime Skill bundles; ordinary creation now exposes only the atomic Frame publication route while source compatibility tests remain intact.
- Documented Claude Code Auto-mode recovery without weakening host safety: approve only the exact atomic publication actions, never the entire Cuebook MCP server, and treat legacy draft calls as a stale-session signal rather than a reason to repair market-calendar data.

## 0.9.7 — 2026-07-21

- Removed every implicit creator-horizon default: explicit user timing now has absolute priority, while Cuebook may offer at most two Cue- or catalyst-informed proposals only when requested and only after creator acceptance.
- Excluded the legacy cross-repository assembly golden from runtime Skill bundles and clarified that ordinary initial Frame publication uses the atomic completion Tool rather than the draft-and-prepare compatibility path.

## 0.9.6 — 2026-07-21

- Made every tracked repository text surface English-only, including public documentation, Skill instructions, internal modules, fixtures, evaluation cases, tests, renderer copy, and generated bundles.
- Added a repository-wide English validation gate while preserving multilingual request recognition through explicit Unicode code-point escapes.
- Refined English mobile visual copy and layout budgets so translated labels remain legible without weakening Cuebook's diverse chart and editorial grammars.
- Documented the required host restart after a version-changing Codex Plugin refresh so new tasks cannot retain a stale in-memory Plugin or Tool snapshot.

## 0.9.5 — 2026-07-21

- Made a successful `complete_frame_publish` result the absolute end of the ordinary creator flow: no second confirmation, receipt parsing, ID extraction, reconciliation, sharing setup, Paper Trade call, or post-publication readback.

## 0.9.4 — 2026-07-21

- Curated the Claude Code marketplace to exactly two self-contained public Skills, preventing its conventional `skills/` scan from also loading the 38 internal source modules.
- Added Claude marketplace version pinning, release automation, inventory regression checks, and released-tag installation guidance.

## 0.9.3 — 2026-07-21

- Separated explicit authentication, missing-plugin discovery, and network or proxy failures so an authenticated creator is never sent through duplicate OAuth after a transport error.
- Removed the legacy draft-and-prepare actions from the creator menu; ordinary initial publication now exposes only the uploaded-master `complete_frame_publish` action, while correction and withdrawal keep their dedicated paths.

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
