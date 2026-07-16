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
- Turn an idea into content: `create-cuebook-content` (may call query; writes
  only through explicit, authorized MCP write tools).

## Runtime dependencies

- Python 3.11+ for every validator script.
- Node.js 18+ with Playwright and a local Chromium/Chrome executable for the
  seven render/audit skills (declared in their `compatibility` frontmatter).
  Codex runs supply these via the bundled runtime under
  `~/.cache/codex-runtimes/`; set `NODE_PATH` to a Playwright-bearing
  `node_modules` when invoking capture or audit scripts manually.

## Write operations

`save_creator_artifact`, `register_settlement_claim`, and `publish_release`
are explicit MCP writes that require user authorization. Query never calls
them; Create never publishes silently.

## Known limitations

- Heavy render skills fail cleanly when Chromium or Playwright is missing;
  they do not fall back to approximate output.
- Trial fonts are evaluation-only and never enter a release artifact.

## Smoke test

```bash
python3 plugins/cuebook/scripts/validate_cuebook_plugin.py plugins/cuebook
```

Then, in a fresh Codex task: ask `看看 USO 最近有什么叙事` and confirm the
answer routes through `query-cuebook` and returns a source-linked
`CuebookQueryBundleV1` with no write-tool calls.
