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

<p align="center"><strong>Turn a market intuition into a sourced, mobile-first Frame.</strong></p>

<p align="center">
  Two public entrypoints. On-demand research. One title, one body, and one editorial image.
</p>

<p align="center">
  <a href="https://github.com/cuebook-public/cuebook-skills/releases/tag/v0.4.1"><img alt="Release v0.4.1" src="https://img.shields.io/badge/release-v0.4.1-F6C500?style=flat-square&labelColor=111111"></a>
  <a href="https://github.com/cuebook-public/cuebook-skills/actions/workflows/quality.yml"><img alt="Quality" src="https://github.com/cuebook-public/cuebook-skills/actions/workflows/quality.yml/badge.svg?branch=main"></a>
  <img alt="Node.js 22 or newer" src="https://img.shields.io/badge/Node.js-%E2%89%A522-3C873A?style=flat-square&labelColor=111111">
  <img alt="Two public skills" src="https://img.shields.io/badge/public_skills-2-4C6FFF?style=flat-square&labelColor=111111">
</p>

<p align="center">
  <a href="#cuebook-surfaces">Surfaces</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#install-time-connection">Connection</a> ·
  <a href="#two-skills-one-boundary">Skills</a> ·
  <a href="#one-frame-four-fields">Frame</a> ·
  <a href="#designed-for-the-feed">Visuals</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#development">Development</a> ·
  <a href="https://github.com/cuebook-public/cuebook-cli">CLI</a>
</p>

---

Cuebook is an expression layer for pre-trade thinking. It helps a creator sharpen an intuition, find the smallest useful body of evidence, and publish the idea in a form that is easy to understand, remember, and revisit.

## Cuebook Surfaces

| Surface | Best for | Current contract |
| --- | --- | --- |
| **[Cuebook Skills](https://github.com/cuebook-public/cuebook-skills)** | Natural-language research and guided Frame creation in Codex | Two public entrypoints; internal research, rendering, and publication modules load on demand |
| **[Cuebook CLI](https://github.com/cuebook-public/cuebook-cli)** | Terminal use, scripts, automation, and direct Tool inspection | Live Tool discovery, structured JSON, OAuth connection management, and fail-closed write confirmation |

Both surfaces connect to Cuebook MCP. The server remains authoritative for available Tools, source-linked data, authorization, idempotency, and publication policy; neither client maintains a second catalog of product truth.

## Quick Start

Install the current release:

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --ref v0.4.1 \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook

codex mcp list --json
```

Cuebook uses install-time authentication. Find the `cuebook` entry in the JSON output. If it reports `auth_status: "not_logged_in"` and no Cuebook authentication is already in progress, run `codex mcp login cuebook` once and complete the browser flow. Then run `codex mcp list --json` again. Do not start a second login after the first command succeeds.

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

## Install-Time Connection

Keep authentication in the installation flow:

1. Install the plugin. Its marketplace policy is `ON_INSTALL`.
2. Check `codex mcp list --json`. If Cuebook is already authenticated or the host has an active authentication flow, do not start another one.
3. Only when Cuebook reports `not_logged_in` and no flow is active, run `codex mcp login cuebook` once. Complete the browser approval and wait for the command to finish.
4. Check the JSON status again. A browser approval page, an enabled connector, or a public plugin-manager result is not connection proof.
5. Open one new task and make a real Cuebook request. A normal MCP result is the final end-to-end proof that Tool discovery and token exchange succeeded.

If authentication or token exchange fails, stop and report that one failure without retrying, reinstalling, or opening more tasks. This flow uses one installation, at most one install-time host login, and one real task. Preview never publishes; publication still requires explicit intent.

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

## From Intuition To Expression

1. **Capture the edge.** Preserve the creator's claim, mechanism, horizon, and next observable. Ask at most one optional, high-leverage question; skipping it never blocks creation.
2. **Find support.** Retrieve the smallest useful evidence set from Cuebook. A bounded Web lookup may fill a material gap and remains clearly labeled.
3. **Lock the meaning.** Separate observed facts from the creator's interpretation. A request for another version changes expression, not the underlying claim or evidence.
4. **Compose one Frame.** Write a sharp title, a concise body, and one visual with a clear reading path.
5. **Preview, then publish.** Publication happens only after explicit intent and is verified by reading the resulting Frame back.

The goal is not to lecture the creator or flatten the idea into generic research. Cuebook improves the expression while keeping authorship visible.

## Designed For The Feed

The renderer chooses a visual relationship before it chooses a style.

| Idea topology | Useful visual forms |
| --- | --- |
| Change through time | Price curve, indexed curve, drawdown, event window, threshold |
| Relationship between assets | Relative strength, spread, rolling correlation, contribution view |
| Mechanism or sequence | Causal path, temporal rail, trigger poster |
| Conditional future | Checkpoints, catalyst map, confirmation and invalidation, scenario branches |
| Competing evidence | Tension field, evidence balance, transparent Creator Lens |

Every preview includes two independently composed PNGs:

- **2488 × 1056** — a detailed publication composition;
- **622 × 264** — a feed composition with one dominant geometry, no more than two essential copy groups, and a visible future check.

The compact image is not a downscaled desktop chart. It is designed to survive a fast phone scroll. Historical data ends at a visible observation boundary; future space contains checkpoints or branches, never a fabricated price path.

## Architecture

```text
Codex
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
npm run validate
npm run test:ci
git diff --exit-code -- skills plugins/cuebook/public-skills
```

Validation checks the two-entrypoint boundary, referenced-resource closure, mobile preview context budget, schema correctness, rendering gates, and generated bundle parity. CI also rejects tracked Python runtime files.

</details>

Public Skill, runner, and reference names describe their purpose rather than a generation number. Frozen wire schemas may retain internal versions for compatibility, but those versions are not part of the creator-facing product.

Never commit API keys, OAuth tokens, credentials, mutable user output, or font files. Authentication stays in the Cuebook connector.
