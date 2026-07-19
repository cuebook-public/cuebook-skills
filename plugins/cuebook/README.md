# Cuebook

Cuebook is a Codex plugin for reading market intelligence and turning a trading idea into a sourced, mobile-first Frame.

It exposes two public skills:

```text
Query  ←  Create
read only   may request evidence from Query
```

`query-cuebook` searches, reads, compares, and explains Cuebook assets, stories, published Frames, market series, evidence, and history. It never drafts or publishes.

`create-cuebook-content` preserves the creator's idea, optionally interviews for one missing edge, retrieves the smallest useful evidence set, and returns one recommended Frame. It creates three alternatives only when explicitly requested.

## The Public Contract

A user-facing Frame contains exactly four fields:

- `title`
- `body`
- `image_ref`
- `alt_text`

There is no public workflow state on the Frame. Preview blockers are explained in plain language. After a successful action, Cuebook confirms only the meaningful outcome, such as “已发布” or “已撤回.” Schema versions, selection ids, source bundles, hashes, scores, scopes, upload state, receipts, consent, and credentials stay backstage.

## How Creation Works

The Skill separates four layers:

1. **Creator meaning** — the claim, mechanism, time horizon, and next observable remain creator-owned.
2. **Frozen evidence** — Cuebook supports observations with typed, time-bound results. One bounded authorized Web batch may fill a material gap and is labeled separately.
3. **Expression** — a deterministic renderer chooses a curve, comparison, drawdown, event, threshold, scenario, causal path, evidence tension, transparent Creator Lens, or long/short contribution structure.
4. **Publication** — upload, manifest registration, draft, prepare, publish, and readback happen only after explicit intent.

Facts and interpretation never blur. A source reference is not enough: the exact factual sentence must pass a numerical or typed observation test. Causal language remains the creator's hypothesis unless a source establishes it.

If an upstream system supplies a frozen commitment and evidence set, Create changes only expression and design. A “再来一版” request reuses the same meaning and data; it does not rerun asset, direction, time, or factual decisions.

## Mobile-First Visuals

Each preview renders two compositions from one meaning lock:

- 2488 × 1056 for the detailed publication view;
- 622 × 264 for the phone/feed view.

The compact view is independently composed, with one dominant geometry, at most two essential copy groups, a 22 px essential-type floor, minimal provenance, and one visible future check. It is presented first.

Design diversity comes from the reading path, not palette roulette. Curve stages, editorial splits, tension fields, temporal rails, trigger posters, branch maps, mechanism paths, evidence balance, Lens anatomy, and spread arenas remain distinguishable in grayscale. Surface, typography, material, and density follow the idea topology.

Observed history ends at a visible declaration boundary. Future space may contain a clock, catalyst, checkpoint, confirmation, invalidation, or scenario branch; it never contains a fabricated price path or an uncalibrated probability fan.

## MCP Boundary

The Skill is a thin orchestrator. Cuebook MCP provides authenticated typed reads and authorized Frame mutations; local deterministic code adapts frozen results and renders pixels. Broad internal graphs and algorithm stages are not public creator Tools.

Client allowlists optimize tool choice but do not authorize requests. The server enforces grants, users, clients, scopes, policy, idempotency, prepared hashes, and publish tokens. Initial and correction publication go directly from prepare to publish under the active grant and first-party action. Withdrawal alone requires separate consent.

MCP never returns image bytes to the Skill after upload. The first-party app may transport renditions for display, while the Skill sees only semantic Frame data and owner-only media status.

## Install

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --ref v0.4.0 \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook
```

Start a new Codex task after installation. OAuth credentials stay in the connector, never in a Skill or generated artifact.

## Validate

```bash
npm ci
npm run build:release
npm run validate
npm run test:ci
git diff --exit-code -- skills plugins/cuebook/public-skills
```

Only the two public entrypoints are discoverable. Internal modules are packaged as on-demand references, and generated bundles must remain byte-aligned with their canonical sources.
