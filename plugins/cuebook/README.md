# Cuebook

Cuebook is the distributable Codex plugin for reading Cuebook market
intelligence and turning a user's trading idea into sourced, publishable
content. It exposes two top-level modules with one allowed dependency:

```text
查询 Query  <-  创作 Create
    read only       may call Query
```

Query never calls Create and never writes. Create can reuse or request Query
results before producing content.

## Query

`query-cuebook` is the safe default entrypoint for requests such as search,
read, inspect, compare, explain, and review history. It can return assets,
stories, market state, evidence, fundamentals, OHLCV, metrics, owned feed
records, settlement outcomes, publication receipts, and authorized public
media research as a source-linked `CuebookQueryBundleV1`.

Query does not draft posts, design viewpoint graphics, compile settlement
claims, save artifacts, or publish.

## Create

`create-cuebook-content` owns writing and packaging. It preserves the user's
seed and authorship, calls Query when a current claim needs evidence or market
data, and returns exactly three calibrated candidates through
`CuebookCreationBundleV1`. The underlying workflow can produce text, exact
2488 x 1056 static visuals, and an optional settlement claim and formula.

Saving, settlement registration, and external publication remain explicit,
authorized MCP writes. Create never places trades or silently publishes.

## Package Boundary

- Plugin skills decide routing, research requirements, expression, visuals,
  settlement semantics, release preparation, and validation.
- Cuebook MCP resolves authenticated data and performs authorized writes.
- Query owns all read MCP tools. Create owns write tools and reaches read tools
  only through the declared `create -> query` edge.
- Only `query-cuebook` and `create-cuebook-content` are public entrypoints.
  Internal skills are capability nodes, not alternate product entrances.

Prompt instructions are not a security boundary. The Cuebook MCP server must
enforce `cuebook.query`, `cuebook.create.write`, and `cuebook.publish` OAuth
scopes declared in the capability map. Query-scoped calls must be rejected for
write tools. Every write is exposed as a separate action with explicit user
approval, an exact artifact or formula hash, and an idempotency key.

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
codex plugin marketplace add cuebookapp/cuebook \
  --ref <release-tag> \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook
```

Start a new Codex task after installation so both skills and the Cuebook MCP
server are loaded. OAuth credentials stay in the connector, never in a skill
or generated artifact.

## Validate

Run the package boundary validator:

```bash
node plugins/cuebook/scripts/validate_cuebook_plugin.mjs plugins/cuebook
```

Run all plugin tests without local caches:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest \
  -p no:cacheprovider \
  plugins/cuebook
```

Before release, keep the plugin version, catalog version, module map, menus,
and workflow contracts aligned. Do not commit API keys, OAuth tokens,
credentials, mutable market observations, or generated user output.
