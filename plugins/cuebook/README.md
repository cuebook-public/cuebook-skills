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

The Cuebook Plugin gives AI agents a memory and expression layer for pre-trade thinking. Cuebook Agent recognizes the creator's edge, adds the smallest useful Cue or market relationship, locks the exact meaning once, and turns it into one title, one reasoned body, and one editorial image.

## Install

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook

codex mcp list --json
```

Cuebook's marketplace policy is `ON_INSTALL`. If the `cuebook` entry reports `auth_status: "not_logged_in"` and no authentication is already in progress, run `codex mcp login cuebook` once, complete the browser flow, and check `codex mcp list --json` again. Do not start another login after the first succeeds.

The installing task owns installation and that one necessary host login. It must not create a background test task, publish a placeholder, or diagnose this local marketplace through a public ChatGPT plugin manager. Open one new Codex task only after Cuebook is enabled and no longer reports `not_logged_in`, then enter the real query or market idea. The final readiness proof is a normal MCP result in that task, not a browser approval screen or connector status alone. If authentication fails, stop instead of retrying, reinstalling, or opening more tasks. OAuth credentials stay in the connector, never in a Skill or generated artifact.

Use `--ref v0.7.0` only when you intentionally want a tag-pinned install. The default `main` marketplace follows stable releases.

## Update

```bash
codex plugin marketplace upgrade cuebook
codex plugin add cuebook@cuebook
codex mcp list --json
```

A normal update needs no uninstall, duplicate MCP configuration, or repeated OAuth. Open one new Codex task after the refresh so it loads the updated Skills. Authenticate again only when the connector explicitly reports `not_logged_in`, requires scope step-up, or its grant has been revoked.

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
| `create-cuebook-content` | Preserve the creator's idea, optionally interview for one missing edge, retrieve the smallest useful evidence set, and return one recommended Frame. Alternatives appear only when requested. |

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

Eligible single-asset long and short Frames share one deadline rule across crypto, equities, ETFs, and indexes: Cuebook fixes the exact creator-owned deadline and compares the latest completed provider-official price observation at or before it with the publication baseline. Creators never choose sessions, trading days, or next close. Before rendering, one text-only Meaning Lock confirms the exact copy, direction, deadline, and human zero-threshold rule. “Publish this” later authorizes only the external write; only a creator-requested price target or pair needs additional terms.

## Creation Model

The Skill makes five beats feel like one continuous lift: recognize the creator's non-obvious kernel, expand it with one useful Cuebook connection, lock the exact thought once, reveal one relationship visually, and preserve it with a future checkpoint. The implementation keeps four layers separate:

1. **Creator meaning** — the claim, mechanism, time horizon, and next observable remain creator-owned. After asset resolution, at most one aligned and one contrasting or adjacent Cue may be offered as optional thought anchors; only adopted additions enter the viewpoint.
2. **Frozen evidence** — one shared plan starts the smallest typed Cuebook batch and, when material current claims require it, one bounded authoritative Web batch. Cues remain published viewpoints rather than proof; factual sentences use evidence, while clearly framed creator inference may remain inference. The Skill reconciles the plan once and keeps source routing and coverage gaps backstage.
3. **Expression** — a deterministic renderer chooses a curve, comparison, drawdown, event, threshold, scenario, causal path, evidence tension, transparent Creator Lens, or long/short contribution structure.
4. **Publication** — upload, manifest registration, draft, prepare, and publish happen only after explicit intent. A validated publish receipt ends the network flow; the creator receives a specific acknowledgment of the idea that was preserved and returns to the Cuebook App without a generated web page or canonical link. One optional continuation may invite the creator to share that exact release from the App with another AI, share another signal, or explicitly opt into a simulated Paper Trade for later review.

Facts and interpretation never blur. A source reference is not enough: the factual sentence must pass a numerical or typed observation test. Causal language remains the creator's hypothesis unless a source establishes it.

If an upstream system supplies a frozen commitment and evidence set, Create changes only expression and design. A “render another version” request reuses the same meaning and data; it does not rerun asset, direction, time, or factual decisions.

## Mobile-First Visuals

Each preview renders one **2488 × 1056** publication PNG from the meaning lock. Cuebook uploads and binds it once. Phone and Feed surfaces show that same master in the equivalent **622 × 264** aspect-ratio box; the Skill does not create separate compact, web, thumbnail, or OG assets.

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
