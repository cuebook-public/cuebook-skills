<p align="center">
  <img src="assets/icon.png" width="112" height="112" alt="Cuebook logo">
</p>

<h1 align="center">Cuebook Plugin</h1>

<p align="center"><strong>Make a market intuition clearer, more visible, and easier to revisit.</strong></p>

<p align="center">
  <img alt="Two public skills" src="https://img.shields.io/badge/public_skills-2-4C6FFF?style=flat-square&labelColor=111111">
  <img alt="Node.js 22 or newer" src="https://img.shields.io/badge/Node.js-%E2%89%A522-3C873A?style=flat-square&labelColor=111111">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#update">Update</a> ·
  <a href="#platforms">Platforms</a> ·
  <a href="#public-skills">Public Skills</a> ·
  <a href="#creation-model">Creation Model</a> ·
  <a href="#mobile-first-visuals">Visuals</a> ·
  <a href="#mcp-boundary">MCP</a> ·
  <a href="#validate">Validate</a>
</p>

---

The Cuebook Plugin gives AI agents a memory and expression layer for pre-trade thinking. Cuebook Agent recognizes the creator's edge, adds the smallest useful Cue or market relationship, confirms the intended expression naturally, and turns it into one title, one reasoned body, and one editorial image.

## Install

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook

codex mcp login cuebook

codex mcp list --json
```

Cuebook's marketplace policy is `ON_INSTALL`, but `codex plugin add` does not guarantee that the CLI will open a browser. On a first-time installation, run `codex mcp login cuebook` once, complete the browser flow, and check `codex mcp list --json`. Skip login when Cuebook is already authenticated, and never start a second login after the first succeeds.

The creator consent presents all six Cuebook scopes once: public research, private simulated-account reads, simulated Paper Trade actions, and private Frame read, draft, and publication actions. These remain independent server-enforced permissions. Granting them never publishes or trades automatically; every Paper Trade is simulated and still requires a preview plus explicit placement intent.

The installing task owns installation and that one necessary host login. It must not create a background test task, publish a placeholder, or diagnose this local marketplace through a public ChatGPT plugin manager. After Cuebook is enabled and no longer reports `not_logged_in`, fully quit the Codex app with `Cmd+Q` on macOS (or exit it completely on another platform), reopen it, and then enter the real query or market idea in one new task. Codex CLI users should end the current process and start a new one. A new task inside an app process that never restarted can retain the previous Plugin and Tool snapshot. The final readiness proof is a normal MCP result in the restarted host, not a browser approval screen or connector status alone. If authentication fails, stop instead of retrying, reinstalling, or opening more tasks. OAuth credentials stay in the connector, never in a Skill or generated artifact.

Use `--ref v0.9.9` only when you intentionally want a tag-pinned install. The default `main` marketplace follows stable releases.

## Update

```bash
codex plugin marketplace upgrade cuebook
codex plugin add cuebook@cuebook
codex mcp list --json
```

The marketplace upgrade command is for a Git-backed marketplace. When `codex plugin marketplace list` points `cuebook` at a local checkout, update that checkout yourself, skip `marketplace upgrade`, and run only `codex plugin add cuebook@cuebook` plus `codex mcp list --json`. Codex intentionally rejects `marketplace upgrade` for a local checkout because Codex does not own that repository's Git state.

A normal update needs no uninstall, duplicate MCP configuration, or repeated OAuth. After a version-changing refresh, fully quit and reopen the Codex app (or restart the Codex CLI process), then open one new task so it loads the updated Skills and Tool snapshot. Authenticate again only when the connector explicitly reports `not_logged_in`, requires scope step-up, or its grant has been revoked.

An HTTP, DNS, TLS, proxy, socket, or timeout failure is a connectivity problem, not evidence that authentication was lost. When Cuebook still reports an authenticated connection, restore the network path and retry the same request without reinstalling or starting another OAuth flow.

Older connections retain their original immutable scopes. If one lacks Paper or Frame permissions, approve the single step-up challenge once; do not uninstall or create a duplicate connector.

## Platforms

Cuebook ships two layers:

- the self-contained `query-cuebook` and `create-cuebook-content` Agent Skills;
- the authenticated remote MCP endpoint at `https://cuebook.xyz/mcp`.

Codex, Claude Code, Cursor, Hermes, and OpenClaw can use both layers and are the full creator targets. Claude, Claude Desktop, ChatGPT, and Grok connect directly to MCP; they are useful connector targets, but do not receive the local Cuebook interview and visual-rendering workflow merely by adding the endpoint.

The [platform support matrix](platforms/README.md) links to host-specific installation and verification guides. Status is evidence-based: static package validation, successful OAuth, Tool discovery, read, preview, and publication are recorded separately rather than collapsed into one ambiguous “supported” label.

## Public Skills

| Skill | Responsibility |
| --- | --- |
| `query-cuebook` | Search, compare, and explain Cuebook assets, stories, published Frames, market series, evidence, and history. Never drafts or publishes. |
| `create-cuebook-content` | Preserve the creator's idea, open one compact Cue-backed thought-anchor exchange with at most one consequential follow-up, retrieve the smallest useful evidence set, and return one recommended Frame. Alternatives appear only when requested. |

```text
Query  ◀── evidence request ──  Create
read only                       explicit write intent only
```

## Public Contract

A creator-facing Frame contains exactly four fields:

- `title`
- `body`
- `image_ref`
- `alt_text`

There is no public workflow state on the Frame. Preview blockers use plain language. After an action succeeds, Cuebook confirms only the meaningful result, such as “Published” or “Withdrawn.” Schema versions, selection IDs, source bundles, hashes, scores, scopes, upload state, receipts, consent, and credentials stay backstage.

Eligible single-asset Frames share one deadline rule across crypto, equities, ETFs, and indexes: Cuebook freezes the same persisted price snapshot it can already display at publication, fixes the exact creator-owned deadline, and compares that starting point with the latest completed provider-official observation at or before the deadline. Long and short use the direction of the endpoint return. A terminal range view succeeds when the absolute endpoint return is inside the creator-confirmed symmetric ± band, including the boundary. An interim breach does not change an endpoint result, and a whole-window barrier claim is never silently reinterpreted as terminal range.

A relative Frame turns “A should outperform B” into one two-asset viewpoint rather than two orders. Both publication baselines are frozen, and the deadline result compares normalized returns through an equal-notional long-A/short-B formula. Zero excess return is the ordinary threshold; a nonzero margin appears only when the creator states it. Both legs must be distinct and share a supported session family.

A compound Frame turns “A rises while B stays within ±X%” into two independent conditions at one deadline. Both conditions must hit; direction legs use zero bps, range legs use the creator-confirmed terminal band, and directional equality is flat. Copy and the synchronized visual state the AND rule explicitly. Both assets must be distinct and share a supported session family.

No duration or range band is the default. Explicit creator terms always win; if either is missing, Cuebook asks whether the creator wants to state it or receive one or two Cue-, catalyst-, history-, or volatility-informed proposals, and nothing proceeds until the creator accepts or edits a proposal. Creators never choose sessions, trading days, or next close. Before rendering, Cuebook naturally recaps the exact copy, direction or range, deadline, human settlement rule, and visual idea for confirmation. “Publish this” later authorizes only the external write; only a creator-requested price target or pair needs other terms.

## Creation Model

The Skill behaves like an attentive editor rather than exposing a sequence: it recognizes the creator's non-obvious kernel, adds one useful Cuebook connection when helpful, confirms the intended expression in ordinary conversation, reveals one relationship visually, and preserves it with a future checkpoint. The implementation keeps four layers separate:

1. **Creator meaning** — the claim, mechanism, time horizon, any exact ± range band, and next observable remain creator-owned. Cuebook never fills a missing horizon or band from a preset. When the creator asks for help choosing, relevant Cues, catalysts, history, or volatility may inform at most two proposals, but the creator must accept or edit one. After asset resolution, Cuebook normally opens one compact exchange around at most one aligned and one contrasting or adjacent thought anchor; one final follow-up is allowed only when the first answer reveals a consequential thin link. Only adopted additions enter the viewpoint, and both prompts reuse the same read.
2. **Frozen evidence** — one shared plan starts the smallest typed Cuebook batch and, when material current claims require it, one bounded authoritative Web batch. Cues remain published viewpoints rather than proof; factual sentences use evidence, while clearly framed creator inference may remain inference. The Skill reconciles the plan once and keeps source routing and coverage gaps backstage.
3. **Expression** — one silent Creator Voice Polish defaults a creator-owned viewpoint to natural first person, keeps facts correctly attributed, and removes both visible evidence-taxonomy headings and clustered AI tells without changing meaning or adding another generation pass. It never invents a position or personal experience. A deterministic renderer then chooses a curve, comparison, drawdown, event, threshold, scenario, causal path, evidence tension, transparent Creator Lens, or long/short contribution structure.
4. **Publication** — after explicit intent, the client reserves one upload, PUTs the frozen PNG, and makes one atomic publish call. Its successful typed result ends the network flow; there is no second confirmation, receipt parsing, reconciliation, generated web page, canonical link, or readback. The creator receives a specific acknowledgment of the idea that was preserved and returns to Cuebook App. One optional continuation may invite the creator to share it from the App with another AI, share another signal, or explicitly opt into a later simulated Paper Trade.

Facts and interpretation never blur. A source reference is not enough: the factual sentence must pass a numerical or typed observation test. Causal language remains the creator's hypothesis unless a source establishes it.

If an upstream system supplies a frozen commitment and evidence set, Create changes only expression and design. A “render another version” request reuses the same meaning and data; it does not rerun asset, direction, time, or factual decisions.

## Mobile-First Visuals

Each preview renders one **2488 × 1056** publication PNG from the creator-confirmed draft. Cuebook uploads and binds it once. Phone and Feed surfaces show that same master in the equivalent **622 × 264** aspect-ratio box; the Skill does not create separate compact, web, thumbnail, or OG assets.

The master is authored against its 622 × 264 phone display box and rasterized at 4x: one dominant geometry, at most three reader-essential groups, a 20 px primary and 16 px secondary essential type floor, minimal provenance, one material dated value when price matters, and one visible future check. Delivery-layer resizing may be introduced later without changing the authoring or MCP contract.

Design diversity comes from the reading path, not palette roulette. Curve stages, editorial splits, tension fields, temporal rails, trigger posters, branch maps, mechanism paths, evidence balance, Lens anatomy, and spread arenas remain distinguishable in grayscale. Surface, typography, material, and density follow the idea topology.

Observed history ends at a visible declaration boundary. Future space may contain a clock, catalyst, checkpoint, confirmation, invalidation, or scenario branch; it never contains a fabricated price path or an uncalibrated probability fan.

## MCP Boundary

The Skill is a thin orchestrator. Cuebook MCP provides authenticated typed reads and authorized Frame mutations; local deterministic code adapts frozen results and renders pixels. Broad internal graphs and algorithm stages are not public creator Tools.

Client allowlists optimize tool choice but do not authorize requests. The server enforces grants, users, clients, scopes, policy, idempotency, prepared hashes, and publish tokens. Initial and correction publication go directly from prepare to publish under the active grant and first-party action. Withdrawal alone requires separate consent.

These authorization checks stay inside MCP and are not additional creator steps. The ordinary one-preview publish lane also reuses the frozen preview directly instead of reconstructing a release DAG, candidate family, or HTML page. Removing those redundant artifacts, a second settlement prompt, or post-publish browser readback does not weaken OAuth, prepared-hash, publish-token, idempotency, or transaction validation.

MCP never returns image bytes to the Skill after upload. The first-party app may transport renditions for display, while the Skill sees only semantic Frame data and owner-only media status.

## Validate

```bash
npm ci
npm run build:release
npm run check
```

Only the two public entrypoints are discoverable. Internal modules are packaged as on-demand references, and `npm run verify:release-bundles` compares generated bundles byte-for-byte with an isolated rebuild instead of relying on Git state.
