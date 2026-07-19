# Cuebook

Cuebook is the distributable Codex plugin for reading Cuebook market
intelligence and turning a user's trading idea into a sourced, publishable
Frame. It exposes two top-level modules with one allowed dependency:

```text
查询 Query  <-  创作 Create
    read only       may call Query
```

Query never calls Create and never writes. Create can reuse or request Query
results before producing content.

## Query

`query-cuebook` is the safe default entrypoint for requests such as search,
read, inspect, compare, explain, and review history. It can return assets,
stories, published Frames, market state, evidence, fundamentals, OHLCV,
locally derived metrics, settlement outcomes, and authorized public-media
research as a source-linked `CuebookQueryBundleV1`.

Query does not draft Frames, design viewpoint graphics, compile settlement
claims, save artifacts, or publish.

## Create

`create-cuebook-content` owns Frame writing and packaging. It preserves and
improves the user's seed, reflects its distinctive kernel, and asks one optional
heuristic question about only the highest-leverage missing link before calling
Query for material current claims. It does not dump a news/signal/intuition
checklist. The question always precedes any price target and a skip moves
directly into creation. One `FramePreviewV1` is returned by default; three are
generated only when explicitly requested. Every Frame exposes one title, one
concise body, and one paired 2488 x 1056 image; release contracts and extra
derivatives wait until selection.

Fast creation keeps the observed history window separate from unresolved
future time and chooses the analytical relationship before the chart or
layout. The V2 expression compiler supports price and indexed curves, relative
spread, drawdown and recovery, rolling correlation, event windows, threshold
regimes, causal spines, evidence balance, and conditional scenario lanes.
Title, body, and image do different jobs: the title holds the judgment, the
body carries the creator's mechanism and horizon, and the image adds evidence,
time structure, and the next observable. A chart shows only frozen history;
future regions contain clocks, events, conditions, milestones, or invalidation,
never an invented price path or uncalibrated fan. One deterministic runner
compiles local transforms, renders, hashes, and validates every visible source
binding without expanding the full release workflow.

Fast creation uses one small Cuebook-first query phase. If Cuebook leaves a
material evidence gap, the Skill may run one bounded authorized Web batch with
at most three targeted searches and three primary or authoritative sources.
Every source records whether it came from Cuebook, Web, the creator, or a local
derivation; Web supplementation never masquerades as Cuebook evidence.

Media upload, manifest registration, draft creation, prepare, and Frame
publication remain explicit, authorized MCP steps. Initial and correction
publishing go directly from prepare to publish under the active grant and
first-party publish action; only withdrawal retains a separate consent step.
Create never places trades or silently publishes.

## Package Boundary

- Plugin skills decide routing, research requirements, expression, visuals,
  settlement semantics, release preparation, and validation.
- Cuebook MCP resolves authenticated data and performs authorized writes.
- Query owns all read MCP tools. Create owns write tools and reaches read tools
  only through the declared `create -> query` edge.
- Only `query-cuebook` and `create-cuebook-content` are public entrypoints.
  Internal skills are capability nodes, not alternate product entrances.

Prompt instructions are not a security boundary. The Cuebook MCP server must
enforce `read:public`, `cuebook.paper.read`, `cuebook.paper.trade`,
`cuebook.frame.read`, `cuebook.frame.write`, and `cuebook.frame.publish` as
declared in the capability map. Read-only grants cannot call write tools.
Every mutation has explicit authorization, an exact payload or prepared hash,
and its own lowercase UUIDv7 idempotency key.

The canonical inventory is
[`assets/plugin-index-v1.json`](assets/plugin-index-v1.json). Module ownership
is frozen in [`assets/cuebook-modules-v1.json`](assets/cuebook-modules-v1.json),
and MCP coverage lives in
[`assets/mcp-capability-map-v1.json`](assets/mcp-capability-map-v1.json).

## Platform Support

| Platform | Status | Notes |
| --- | --- | --- |
| Codex (plugin) | Tested | Primary distribution; see [platforms/codex.md](platforms/codex.md) |
| Claude Code (plugin) | Planned | Same plugin layout loads; MCP + heavy-runtime skills unverified; see [platforms/claude-code.md](platforms/claude-code.md) |
| Generic `.agents/skills` clients | Planned | Use the self-contained release bundles built by `scripts/build_release_skills.mjs`, not this source tree; see [platforms/generic-agent-skills.md](platforms/generic-agent-skills.md) |
| Other Agent Skills clients | Unverified | Format follows the [Agent Skills spec](https://agentskills.io); behavior untested |

Only the public entrypoints in `assets/plugin-index-v1.json` are meant for
client discovery. The remaining skills are internal capabilities invoked
through those entrypoints; generic clients should install the built release
bundles, which package each public skill as a self-contained unit.

## Install

After the plugin and marketplace manifest are committed and tagged:

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --ref <release-tag> \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook
```

Start a new Codex task after installation so both skills and the Cuebook MCP
server are loaded. OAuth credentials stay in the connector, never in a skill
or generated artifact.

## Validate

Install the repository's pinned JavaScript dependencies, then run the package
boundary and resource-closure validators:

```bash
npm ci
npm run validate
```

Run all plugin tests:

```bash
npm test
```

Regenerate the Codex and generic Agent Skills bundles with
`npm run build:release`; a clean
`git diff --exit-code -- skills plugins/cuebook/public-skills` proves both
two-entrypoint release surfaces are current. Never mirror the 38 source
modules into `~/.codex/skills`.

Before release, keep the plugin version, catalog version, module map, menus,
and workflow contracts aligned. Do not commit API keys, OAuth tokens,
credentials, mutable market observations, or generated user output.
