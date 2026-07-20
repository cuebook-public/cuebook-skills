<p align="center">
  <img src="assets/icon.png" width="112" height="112" alt="Cuebook logo">
</p>

<h1 align="center">Cuebook Plugin</h1>

<p align="center"><strong>Research a market idea. Express it as a mobile-first Frame.</strong></p>

<p align="center">
  <img alt="Two public skills" src="https://img.shields.io/badge/public_skills-2-4C6FFF?style=flat-square&labelColor=111111">
  <img alt="Node.js 22 or newer" src="https://img.shields.io/badge/Node.js-%E2%89%A522-3C873A?style=flat-square&labelColor=111111">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#public-skills">Public Skills</a> ·
  <a href="#creation-model">Creation Model</a> ·
  <a href="#mobile-first-visuals">Visuals</a> ·
  <a href="#mcp-boundary">MCP</a> ·
  <a href="#validate">Validate</a>
</p>

---

The Cuebook plugin reads source-linked market intelligence and turns a creator's trading idea into one title, one concise body, and one editorial image.

## Install

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --ref v0.4.0 \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook
```

Start a new Codex task after installation. OAuth credentials stay in the connector, never in a Skill or generated artifact.

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

## Creation Model

The Skill keeps four layers separate:

1. **Creator meaning** — the claim, mechanism, time horizon, and next observable remain creator-owned.
2. **Frozen evidence** — Cuebook supports observations with typed, time-bound results. One bounded, authorized Web batch may fill a material gap and is labeled separately.
3. **Expression** — a deterministic renderer chooses a curve, comparison, drawdown, event, threshold, scenario, causal path, evidence tension, transparent Creator Lens, or long/short contribution structure.
4. **Publication** — upload, manifest registration, draft, prepare, publish, and readback happen only after explicit intent.

Facts and interpretation never blur. A source reference is not enough: the factual sentence must pass a numerical or typed observation test. Causal language remains the creator's hypothesis unless a source establishes it.

If an upstream system supplies a frozen commitment and evidence set, Create changes only expression and design. A “render another version” request reuses the same meaning and data; it does not rerun asset, direction, time, or factual decisions.

## Mobile-First Visuals

Each preview renders two compositions from one meaning lock:

- **2488 × 1056** for the detailed publication view;
- **622 × 264** for the phone and feed view.

The compact view is independently composed, with one dominant geometry, no more than two essential copy groups, a 22 px essential-type floor, minimal provenance, and one visible future check. It appears first.

Design diversity comes from the reading path, not palette roulette. Curve stages, editorial splits, tension fields, temporal rails, trigger posters, branch maps, mechanism paths, evidence balance, Lens anatomy, and spread arenas remain distinguishable in grayscale. Surface, typography, material, and density follow the idea topology.

Observed history ends at a visible declaration boundary. Future space may contain a clock, catalyst, checkpoint, confirmation, invalidation, or scenario branch; it never contains a fabricated price path or an uncalibrated probability fan.

## MCP Boundary

The Skill is a thin orchestrator. Cuebook MCP provides authenticated typed reads and authorized Frame mutations; local deterministic code adapts frozen results and renders pixels. Broad internal graphs and algorithm stages are not public creator Tools.

Client allowlists optimize tool choice but do not authorize requests. The server enforces grants, users, clients, scopes, policy, idempotency, prepared hashes, and publish tokens. Initial and correction publication go directly from prepare to publish under the active grant and first-party action. Withdrawal alone requires separate consent.

MCP never returns image bytes to the Skill after upload. The first-party app may transport renditions for display, while the Skill sees only semantic Frame data and owner-only media status.

## Validate

```bash
npm ci
npm run build:release
npm run validate
npm run test:ci
git diff --exit-code -- skills plugins/cuebook/public-skills
```

Only the two public entrypoints are discoverable. Internal modules are packaged as on-demand references, and generated bundles remain byte-aligned with their canonical sources.
