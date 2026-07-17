# Cuebook on Claude Code — Planned

## Install and discovery

Claude Code loads the same plugin layout (`plugins/cuebook` with `skills/`,
`.mcp.json`, and assets) through its plugin system, or individual skills from
`.claude/skills/`. Skill names and descriptions load at startup; bodies load
on activation.

## MCP configuration and auth

Register the Cuebook MCP server from the plugin `.mcp.json` (or
`claude mcp add`). OAuth stays in the MCP connector. Verify the connected
tool set matches `assets/mcp-capability-map-v1.json`; skills degrade to
partial, honest results when a tool is missing.

## Invocation

Same two public entrypoints as Codex: `query-cuebook` (read-only) and
`create-cuebook-content` (creation; may call query). The `$skill-name`
cross-invocation convention maps to Claude Code's Skill tool.

## Runtime dependencies

- Node.js 18+ for validators, with Playwright and local Chromium for render/audit skills.
  Claude Code has no bundled Codex runtime: install Playwright locally and
  pass `NODE_PATH` explicitly when running capture or audit scripts.

## Write operations

Identical policy to Codex: writes are explicit MCP tools behind user
authorization; query is structurally read-only.

## Known limitations (why Planned, not Tested)

- End-to-end MCP OAuth flow unverified on Claude Code.
- Render/audit scripts unverified against a locally installed Playwright
  (only the bundled Codex runtime is exercised today).
- Trigger behavior of the two entrypoints has not been evaluated on Claude
  Code (see `evals/`).

## Smoke test

```bash
node plugins/cuebook/scripts/validate_cuebook_plugin.mjs plugins/cuebook
node --test 'plugins/cuebook/**/*.test.mjs'
```

Then ask `看看 USO 最近有什么叙事` in a session with the plugin loaded and
confirm routing to `query-cuebook` with no write-tool calls.
