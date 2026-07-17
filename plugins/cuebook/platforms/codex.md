# Cuebook on Codex — Tested

## Install and discovery

```bash
codex plugin marketplace add cuebookapp/cuebook \
  --ref <release-tag> \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook
```

Skills are discovered from the plugin's `skills/` directory. Codex reads each
`SKILL.md` name and description at startup; internal skills are invoked through
the two public entrypoints (`query-cuebook`, `create-cuebook-content`), which
call sibling skills with the `$skill-name` convention supported by this plugin.

## MCP configuration and auth

The plugin ships `.mcp.json` pointing at the Cuebook MCP server. OAuth
credentials live in the Codex connector, never in a skill file or generated
artifact. Start a new Codex task after installation so both skills and the MCP
server are loaded.

## Invocation

- Read or inspect anything: `query-cuebook` (read-only, no writes).
- Turn an idea into a Frame: `create-cuebook-content` (may call Query; each
  candidate visibly contains only one title, one body, and one paired image).

## Runtime dependencies

- Node.js 18+ for every validator script, with Playwright and a local Chromium/Chrome executable for the
  seven render/audit skills (declared in their `compatibility` frontmatter).
  Codex runs supply these via the bundled runtime under
  `~/.cache/codex-runtimes/`; set `NODE_PATH` to a Playwright-bearing
  `node_modules` when invoking capture or audit scripts manually.

## Write operations

Frame publication follows the capability-advertised upload → manifest → draft
→ prepare → first-party consent → publish → `get_frame` readback sequence.
Every mutation uses a separate lowercase UUIDv7. Query never calls writes;
Create never publishes silently, and no standalone media retrieval tool is
exposed.

## Known limitations

- Heavy render skills fail cleanly when Chromium or Playwright is missing;
  they do not fall back to approximate output.
- Trial fonts are evaluation-only and never enter a release artifact.

## Smoke test

```bash
node plugins/cuebook/scripts/validate_cuebook_plugin.mjs plugins/cuebook
```

Then, in a fresh Codex task: ask `看看 USO 最近有什么叙事` and confirm the
answer routes through `query-cuebook` and returns a source-linked
`CuebookQueryBundleV1` with no write-tool calls.
