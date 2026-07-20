# Cuebook on Codex — Tested

## Install and discovery

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --ref <release-tag> \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook
```

Skills are discovered from the plugin's generated `public-skills/` directory.
Codex reads exactly two `SKILL.md` files at startup. Internal capabilities are
vendored as non-discoverable `references/modules/*.md` resources behind
`query-cuebook` and `create-cuebook-content`.

The installing task stops after `codex plugin add` succeeds. It must not create
a background test task, initiate OAuth, or publish a placeholder idea. The user
opens exactly one new task so plugin discovery happens once.

## MCP configuration and auth

The plugin ships `.mcp.json` pointing at the Cuebook MCP server. OAuth
credentials live in the Codex connector, never in a skill file or generated
artifact. Start a new Codex task after installation so both skills and the MCP
server are loaded.

On the first real Cuebook request, the Skill makes one normal connector call.
Codex may pause and open the browser for OAuth. After approval, the user returns
to the same task and resumes the frozen request through the normal connector
continuation. Browser approval alone is not a successful connection; an MCP
result must return normally. On a token
exchange, reconnect, or transport error, the Skill preserves the request and
stops after one host OAuth initiation for that user action. It does not start a
second task, repeat DCR, run `codex mcp login`, or implement its own OAuth client.

If the plugin was installed during the current task and the connector or Skills
are absent, open one new task instead of reinstalling or debugging discovery in
the creation flow.

## Invocation

- Read or inspect anything: `query-cuebook` (read-only, no writes).
- Turn an idea into a Frame: `create-cuebook-content` (may call Query; each
  candidate visibly contains only one title, one body, and one paired editorial
  image with sourced curves, event/threshold geometry, or future scenarios).

## Runtime dependencies

- Node.js 18+ for every validator script, with Playwright and a local Chromium/Chrome executable for the
  deterministic preview renderer and selected release audits (declared in their `compatibility` frontmatter).
  Codex runs supply these via the bundled runtime under
  `~/.cache/codex-runtimes/`; set `NODE_PATH` to a Playwright-bearing
  `node_modules` when invoking capture or audit scripts manually.

## Write operations

Frame publication follows the capability-advertised upload → manifest → draft
→ prepare → publish → `get_frame` readback sequence. Initial and correction
publishing use the active grant and first-party publish action without a
separate consent request; only withdrawal uses `get_frame_action_consent`.
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

Then, in a fresh Codex task: ask `What changed around USO recently?` and confirm the
answer routes through `query-cuebook` and returns a source-linked
`CuebookQueryBundleV1` with no write-tool calls.
