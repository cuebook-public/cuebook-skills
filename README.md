<p align="center">
  <a href="https://cuebook.xyz">
    <img
      src="https://raw.githubusercontent.com/cuebook-public/cuebook-cli/main/assets/cuebook-cli-logo.png"
      width="200"
      alt="Cuebook"
    />
  </a>
</p>

<h1 align="center">Cuebook Skills — market expression for AI agents</h1>

<p align="center"><strong>Give a market intuition structure, evidence, and a future checkpoint—without taking authorship away.</strong></p>

<p align="center">
  Cuebook Agent finds the smallest useful data and Cues, then expresses the creator's edge as one mobile-first Frame.
</p>

<p align="center">
  <a href="https://github.com/cuebook-public/cuebook-skills/releases/tag/v0.9.5"><img alt="Release v0.9.5" src="https://img.shields.io/badge/release-v0.9.5-F6C500?style=flat-square&labelColor=111111"></a>
  <a href="https://github.com/cuebook-public/cuebook-skills/actions/workflows/quality.yml"><img alt="Quality" src="https://github.com/cuebook-public/cuebook-skills/actions/workflows/quality.yml/badge.svg?branch=main"></a>
  <img alt="Node.js 22 or newer" src="https://img.shields.io/badge/Node.js-%E2%89%A522-3C873A?style=flat-square&labelColor=111111">
  <img alt="Two public skills" src="https://img.shields.io/badge/public_skills-2-4C6FFF?style=flat-square&labelColor=111111">
</p>

<p align="center">
  <strong>Works with</strong><br>
  <a href="plugins/cuebook/platforms/codex.md"><img alt="Codex" src="https://img.shields.io/badge/Codex-111111?style=flat-square"></a>
  <a href="plugins/cuebook/platforms/claude-code.md"><img alt="Claude Code" src="https://img.shields.io/badge/Claude_Code-D97757?style=flat-square"></a>
  <a href="plugins/cuebook/platforms/cursor.md"><img alt="Cursor" src="https://img.shields.io/badge/Cursor-111111?style=flat-square"></a>
  <a href="plugins/cuebook/platforms/hermes.md"><img alt="Hermes" src="https://img.shields.io/badge/Hermes-6D5CE7?style=flat-square"></a>
  <a href="plugins/cuebook/platforms/openclaw.md"><img alt="OpenClaw" src="https://img.shields.io/badge/OpenClaw-E85D3F?style=flat-square"></a>
  <a href="plugins/cuebook/platforms/claude-desktop.md"><img alt="Claude" src="https://img.shields.io/badge/Claude-D97757?style=flat-square"></a>
  <a href="plugins/cuebook/platforms/chatgpt.md"><img alt="ChatGPT" src="https://img.shields.io/badge/ChatGPT-10A37F?style=flat-square"></a>
  <a href="plugins/cuebook/platforms/grok.md"><img alt="Grok" src="https://img.shields.io/badge/Grok-111111?style=flat-square"></a>
</p>

<p align="center">
  <a href="#cuebook-surfaces">Surfaces</a> ·
  <a href="#one-query-surface-many-intents">Data</a> ·
  <a href="#the-cuebook-experience">Experience</a> ·
  <a href="#platform-support">Platforms</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#updating">Updating</a> ·
  <a href="#install-time-connection">Connection</a> ·
  <a href="#two-skills-one-boundary">Skills</a> ·
  <a href="#one-frame-four-fields">Frame</a> ·
  <a href="#designed-for-the-feed">Visuals</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#development">Development</a> ·
  <a href="https://github.com/cuebook-public/cuebook-cli">CLI</a>
</p>

---

Cuebook is memory and expression infrastructure for pre-trade thinking. It helps a creator sharpen an intuition, connect it to the smallest useful body of market data and prior viewpoints, and publish it in a form that is easy to understand, remember, and revisit.

## The Cuebook Experience

Cuebook Agent is not a research wrapper that replaces the creator's judgment. It makes the creator's judgment more legible and more useful.

| Experience | What the creator should feel | What Cuebook does |
| --- | --- | --- |
| **Recognized** | “That is the part I was actually noticing.” | Reflects the non-obvious kernel without claiming it as the agent's idea |
| **Expanded** | “That connection gives me a better way to think.” | Adds one relevant Cue, dated relationship, comparator, mechanism, or next footprint |
| **In control** | “This is exactly the idea I want to put my name on.” | Confirms the title, reasoning, horizon, settlement meaning, and visual intent in ordinary conversation before drawing |
| **Revealed** | “Now I can see the relationship.” | Uses one truthful curve, comparison, mechanism, scenario, or Creator Lens instead of decorating the prose |
| **Remembered** | “I can come back and judge this later.” | Preserves the unchanged Frame with a future checkpoint, then returns the creator to Cuebook App |

Internal Tool calls, providers, retries, hashes, and publication mechanics remain backstage. The visible value is the sharper thought, the useful connection, and the image that makes it memorable.

## Cuebook Surfaces

| Surface | Best for | Current contract |
| --- | --- | --- |
| **[Cuebook Skills](https://github.com/cuebook-public/cuebook-skills)** | Natural-language research and guided Frame creation in Agent Skills hosts | Two public entrypoints; internal research, rendering, and publication modules load on demand |
| **[Cuebook CLI](https://github.com/cuebook-public/cuebook-cli)** | Terminal use, scripts, automation, and direct Tool inspection | Live Tool discovery, structured JSON, OAuth connection management, and fail-closed write confirmation |

Both surfaces connect to Cuebook MCP. The server remains authoritative for available Tools, source-linked data, authorization, idempotency, and publication policy; neither client maintains a second catalog of product truth.

## One Query Surface, Many Intents

`query-cuebook` recognizes twelve top-level request families without making an agent load twelve separate Skills: latest Cues, Cue detail, asset narratives, market state, market evidence, fundamentals, market series, derived metrics, settlement history, published Frames, commentator profiles, and media formats. Mixed questions can compose several families in one plan.

Behind that one natural-language surface, Cuebook can combine published Cues and their timelines with persisted market snapshots, sealed OHLCV, news clusters, filings, disclosures, positioning, asset events, market calendars, prediction markets, market briefings, themes, reasoning graphs, settlements, and published Frames. Seven output modes cover concise answers, comparisons, source bundles, data tables, factual charts, history views, and handoff into Frame creation.

The two public Skills are a context-efficiency boundary, not a capability limit. Specialized routing, research, metrics, visual design, and publication modules remain available on demand without competing in the host's first-turn Skill discovery budget.

## Platform Support

Cuebook has one remote MCP endpoint and two optional Agent Skills. Hosts that load both layers can run the complete creator workflow; MCP-only hosts can connect to Cuebook Tools, but do not automatically inherit the interview, evidence-selection, rendering, and publication orchestration encoded in the Skills.

| Host | Distribution | Intended surface | Live status |
| --- | --- | --- | --- |
| **Codex app and Codex CLI** | Cuebook Plugin | Skills + MCP | OAuth, preview, and publication live-verified on 2026-07-20 |
| **Claude Code** | Native Claude Code marketplace | Skills + MCP | OAuth, upload, and atomic publication live-verified on 2026-07-21 |
| **Cursor editor and CLI** | Two Agent Skills bundles + remote MCP | Skills + MCP | Static setup ready; live check pending |
| **Hermes Agent** | Two Agent Skills bundles + remote MCP | Skills + MCP | Static setup ready; live check pending |
| **OpenClaw** | Two Agent Skills bundles + remote MCP | Skills + MCP | Static setup ready; live check pending |
| **Claude and Claude Desktop** | Custom remote connector | MCP direct | Connector check pending; no Skill parity claim |
| **ChatGPT** | Custom MCP app | MCP direct | Eligible plans only; connector check pending |
| **Grok** | Custom MCP connector | MCP direct | Team-admin setup; connector check pending |

See the [platform matrix and installation guides](plugins/cuebook/platforms/README.md). Every guide points to the same endpoint: `https://cuebook.xyz/mcp`. A completed browser approval is not proof of readiness; each host must return a normal MCP result before it is marked live-verified.

## Quick Start

Install the current stable release from `main`:

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook

codex mcp login cuebook

codex mcp list --json
```

For a first-time installation, `codex plugin add` installs Cuebook but does not guarantee that the CLI will open a browser. Run `codex mcp login cuebook` once, complete the browser flow, and then inspect the `cuebook` entry in `codex mcp list --json`. If it is already authenticated, skip the login; after the first command succeeds, do not start a second one.

One creator consent covers Cuebook's six explicit authorization domains: public research, private simulated-account reads, simulated Paper Trade actions, and private Frame read, draft, and publication actions. They remain separate server-enforced scopes, and authorization never creates a Frame or simulated order by itself. A Paper Trade still requires terms, a preview, and explicit placement intent; Cuebook never places a real-money order.

The installing task may complete that one host-owned login, but it must not create a background test task, invent a placeholder idea, or publish anything. Installation is ready for use only after Cuebook is enabled and no longer reports `not_logged_in`.

Open one new Codex task only after installation and authentication are complete. That task loads the two Skills and the authenticated Cuebook connector; it should receive your real request immediately instead of repeating setup.

Then try either path:

```text
What changed in BTC relative to US equities this week?
```

```text
I think BTC's resilience could lead to another move higher over the next 30 days.
Turn that idea into a Frame.
```

> [!NOTE]
> Do not copy the Cuebook source tree into `~/.codex/skills`. Codex should discover exactly two public entrypoints; internal modules load only when needed.

For a reproducible, intentionally frozen install, add `--ref v0.9.5` to the marketplace command. A tag-pinned marketplace stays on that tag until you change the ref; the default `main` install receives stable releases.

## Updating

Update the configured marketplace snapshot and refresh the installed Plugin in place:

```bash
codex plugin marketplace upgrade cuebook
codex plugin add cuebook@cuebook
codex mcp list --json
```

That first command applies only to a Git-backed marketplace created by `codex plugin marketplace add`. If `codex plugin marketplace list` points `cuebook` at a local checkout, skip the marketplace upgrade command, update that checkout yourself, and run only:

```bash
codex plugin add cuebook@cuebook
codex mcp list --json
```

`codex plugin marketplace upgrade cuebook` intentionally rejects a local checkout because it is not a Git marketplace managed by Codex.

Do not uninstall the Plugin, duplicate its MCP entry, or repeat OAuth during a normal update. Existing connector credentials remain host-owned. Log in again only when the connector explicitly reports `not_logged_in`, returns an authorization challenge that requires step-up, or the stored grant has been revoked. Open one new Codex task after the refresh so it loads the new Skill bundle; the current task keeps the version it started with.

Connections created before the complete creator consent was introduced keep their original immutable scope snapshot. The first Paper Trade or Frame write may therefore request one transparent OAuth step-up; after approval, the same connection covers the complete Cuebook workflow. This is a one-time permission update, not a reinstall.

## Install-Time Connection

Keep authentication in the installation flow:

1. Install the plugin. Its marketplace policy is `ON_INSTALL`, but the CLI install command does not promise a browser popup.
2. Check `codex mcp list --json`. If Cuebook is already authenticated or the host has an active authentication flow, do not start another one.
3. On a fresh installation that reports `not_logged_in`, run `codex mcp login cuebook` once. Complete the browser approval and wait for the command to finish.
4. Check the JSON status again. A browser approval page, an enabled connector, or a public plugin-manager result is not connection proof.
5. Open one new task and make a real Cuebook request. A normal MCP result is the final end-to-end proof that Tool discovery and token exchange succeeded.

If authentication or token exchange fails, stop and report that one failure without retrying, reinstalling, or opening more tasks. This flow uses one installation, at most one install-time host login, and one real task. Preview never publishes; publication still requires explicit intent.

Keep authentication failures separate from connectivity failures. Run login only for an explicit `not_logged_in`, authorization challenge, revoked credential, or scope step-up. If Cuebook remains authenticated but a request reports an HTTP, DNS, TLS, proxy, socket, or timeout failure, restore that network path and retry the same request; do not reinstall the Plugin or start another OAuth flow.

## Two Skills, One Boundary

| Skill | Purpose | Write access |
| --- | --- | --- |
| `query-cuebook` | Search and explain source-linked Cuebook intelligence | Never writes |
| `create-cuebook-content` | Turn a creator's market idea into one publishable Frame | Drafts or publishes only with explicit intent |

Create may call Query for evidence. Query never calls Create.

```text
market question  ──▶  query-cuebook  ──▶  sourced answer
creator idea     ──▶  create-cuebook-content  ──▶  Frame
                              ▲
                              └── minimal evidence from Query
```

## One Frame, Four Fields

The complete public artifact is deliberately small:

```json
{
  "title": "BTC is holding while risk assets fade",
  "body": "Relative resilience is the signal. Over the next 30 days, I am watching whether it survives the next equity sell-off and expands into a broader crypto bid.",
  "image_ref": "<opaque Cuebook media reference>",
  "alt_text": "An indexed BTC-versus-equities chart with an observation boundary and two future checkpoints."
}
```

Workflow state, schema versions, candidate IDs, evidence bundles, hashes, scopes, upload progress, receipts, consent fields, and backend enums stay backstage.

Eligible single-asset long and short Frames use one creator-facing settlement model across crypto, equities, ETFs, and indexes: Cuebook freezes the same persisted price snapshot it can already display at publication, fixes the exact chosen deadline, then compares that starting point with the latest completed provider-official observation at or before the deadline. The creator never chooses regular hours, after hours, trading days, or next close. Before any image is rendered, Cuebook naturally recaps the exact copy, direction, deadline, settlement meaning, and visual idea for confirmation. A later “publish this” authorizes only the external write; target-price and pair overrides are the only cases that need more terms.

## From Intuition To Expression

1. **Recognize the edge.** Preserve the creator's claim, mechanism, horizon, and next observable. Once the asset is known, at most one aligned and one contrasting or adjacent Cue may become optional thinking anchors for one high-leverage question; skipping them never blocks creation.
2. **Expand the thought.** Start the smallest Cuebook read batch and, when material current claims require it, one bounded authoritative Web batch from the same evidence plan. Prefer the one relationship, prior viewpoint, comparator, or next footprint that materially improves the thought or its visual expression. Cues remain published viewpoints rather than proof; factual sentences use evidence, while clearly framed creator inference may remain inference.
3. **Lock the meaning.** Show the exact title, body, asset, direction, deadline, human settlement rule, and visual intent as text. Do not render until the creator confirms them.
4. **Reveal one relationship.** Render one publication image from the confirmed idea and copy. A request for another version changes only expression, not the claim, evidence, or settlement.
5. **Remember the idea.** Publication happens only after explicit intent and writes the already confirmed Frame. The successful atomic publish result ends the network flow—no second confirmation, receipt parsing, reconciliation, web link, or browser readback. Cuebook Agent recognizes the specific idea that was preserved and returns the creator to Cuebook App. One optional continuation may invite the creator to share it with another AI, share another signal, or explicitly opt into a later simulated Paper Trade.

The goal is not to lecture the creator or flatten the idea into generic research. Cuebook improves the expression while keeping authorship visible.

Before the creator confirms the copy, Cuebook may naturally surface one or two genuinely new reasoning points from the already retrieved Cues—a missing actor, mechanism, comparator, next footprint, regime condition, or countercase. They are optional additions, never a separate checkpoint or a test the creator must pass. Only what the creator adopts enters the final viewpoint.

## Designed For The Feed

The renderer chooses a visual relationship before it chooses a style.

| Idea topology | Useful visual forms |
| --- | --- |
| Change through time | Price curve, indexed curve, drawdown, event window, threshold |
| Relationship between assets | Relative strength, spread, rolling correlation, contribution view |
| Mechanism or sequence | Causal path, temporal rail, trigger poster |
| Conditional future | Checkpoints, catalyst map, confirmation and invalidation, scenario branches |
| Competing evidence | Tension field, evidence balance, transparent Creator Lens |

Every preview has one **2488 × 1056** publication PNG. Cuebook uploads and binds that image once; Feed and detail surfaces display the same master, with the Feed scaling it to the equivalent **622 × 264** aspect-ratio box. The Skill does not create separate compact, web, thumbnail, or OG assets.

The master is authored against its 622 × 264 phone display box and rasterized at 4x: one dominant geometry and at most three reader-essential groups for orientation, evidence/mechanism, and future/settlement. Primary copy is at least 20 px and secondary essential labels at least 16 px at display size. When price matters, the image keeps one dated historical value, return, spread, drawdown, or threshold. Historical data ends at a visible observation boundary; future space contains checkpoints or branches, never a fabricated price path. Delivery-layer resizing may be added later without changing the authoring or MCP contract.

## Architecture

```text
Agent Skills host
├── query-cuebook                 public, read-only
└── create-cuebook-content        public, creator workflow
    ├── on-demand reference modules
    ├── deterministic JavaScript renderers
    └── Cuebook MCP
        ├── typed, source-linked reads
        └── authorized Frame mutations
```

The Skill remains a thin orchestrator. Cuebook MCP supplies authenticated data and enforces authorization; local deterministic code adapts frozen results and renders pixels. Internal graphs, algorithm stages, credentials, and publication mechanics are not part of the creator-facing object.

Client tool filters improve selection but are not a security boundary. The server enforces grants, users, clients, scopes, policy, idempotency, prepared hashes, and publish tokens. Image bytes are never pulled back through MCP after upload.

## Development

<details>
<summary><strong>Repository layout</strong></summary>

```text
.agents/plugins/marketplace.json  Marketplace entry
.claude-plugin/marketplace.json   Claude Code marketplace entry
plugins/cuebook/                  Plugin package and canonical Skill sources
plugins/cuebook/skills/           Development modules
plugins/cuebook/public-skills/    Generated Codex public bundles
plugins/cuebook/assets/           Catalog and capability contracts
plugins/cuebook/scripts/          Validators and release builder
skills/                           Generated self-contained Agent Skills bundles
```

</details>

<details>
<summary><strong>Build and validate</strong></summary>

Generated bundles come from the canonical plugin sources. Do not edit `skills/` or `plugins/cuebook/public-skills/` by hand.

```bash
npm ci
npm run build:release
npm run check
```

Validation checks the two-entrypoint boundary, referenced-resource closure, mobile preview and publication context budgets, schema correctness, rendering gates, and byte-for-byte generated bundle parity against an isolated rebuild. CI also rejects tracked Python runtime files.

</details>

<details>
<summary><strong>Prepare a release</strong></summary>

Release preparation has one version source and updates every pinned install ref, Plugin manifest, changelog section, and generated Skill bundle together:

```bash
npm run release:prepare -- 0.9.5 \
  --date 2026-07-21 \
  --codex-build 20260721103045

npm run release:verify
```

`release:prepare` is intentionally reviewable: it never commits, tags, pushes, publishes a GitHub Release, deploys, or touches MCP/OAuth state. Review the diff and pass CI before creating a tag. `release:check` is the lightweight consistency gate used by CI.

The public package version and internal Skill catalog version are separate. A behavioral release does not silently rewrite frozen catalog or wire schema versions.

</details>

Public Skill, runner, and reference names describe their purpose rather than a generation number. Frozen wire schemas may retain internal versions for compatibility, but those versions are not part of the creator-facing product.

Never commit API keys, OAuth tokens, credentials, mutable user output, or font files. Authentication stays in the Cuebook connector.
