# Cuebook on Codex and Codex CLI

**Surface:** Cuebook Plugin with two Agent Skills and remote MCP.

**Package status:** Validated locally.

**Live status:** OAuth, Tool discovery, preview, and publication were live-verified on 2026-07-20.

## Install and discovery

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook

codex mcp list --json
```

Skills are discovered from the plugin's generated `public-skills/` directory.
Codex reads exactly two `SKILL.md` files at startup. Internal capabilities are
vendored as non-discoverable `references/modules/*.md` resources behind
`query-cuebook` and `create-cuebook-content`.

The default marketplace follows stable releases from `main`. Add `--ref v0.7.0`
only for an intentionally frozen install.

## Update

```bash
codex plugin marketplace upgrade cuebook
codex plugin add cuebook@cuebook
codex mcp list --json
```

Use `marketplace upgrade` only for a Git-backed marketplace. If
`codex plugin marketplace list` points `cuebook` at a local checkout, update
that checkout yourself, skip the marketplace upgrade command, and run only
`codex plugin add cuebook@cuebook` plus `codex mcp list --json`. Codex rejects
marketplace upgrades for local checkouts because it does not own their Git
state.

Do not uninstall, duplicate `.mcp.json`, or repeat OAuth for a normal update.
The connector owns its existing credential. Open one new task after refresh so
Codex loads the new Skill bundle; reauthenticate only when the connector
explicitly reports `not_logged_in`, requires scope step-up, or the grant was
revoked.

The marketplace policy is `ON_INSTALL`. After `codex plugin add`, inspect the
`cuebook` entry from `codex mcp list --json`. If it reports
`auth_status: "not_logged_in"` and no authentication is already active, run
`codex mcp login cuebook` once and complete that browser flow. Check the JSON
status again; do not start a second login after the first succeeds.

The installing task owns installation and that one necessary host login. It
must not create a background test task, publish a placeholder idea, or use a
public ChatGPT plugin manager to diagnose this local marketplace. The user
opens one new task only after authentication completes so plugin discovery
happens once with an authenticated connector.

## MCP configuration and auth

The plugin ships `.mcp.json` pointing at `https://cuebook.xyz/mcp`. OAuth
credentials live in the Codex connector, never in a Skill file or generated
artifact. Authentication belongs to installation, not to Query or Create.

An enabled connector or completed browser approval is useful diagnostic state,
not end-to-end proof. In the first new task, make a real Cuebook request and
require a normal MCP result. If the Tool is absent, the connector still reports
`not_logged_in`, or token exchange fails, preserve the request and stop. Repair
the install-time connection before opening one later task; do not make the
Skill repeat DCR, run a CLI login, create a custom client, or open another task.

If the plugin was installed during the current task, finish install-time
authentication first and then open one new task. Do not reinstall or debug
plugin discovery inside the creation flow.

## Invocation

- Read or inspect anything: `query-cuebook` (read-only, no writes).
- Turn an idea into a Frame: `create-cuebook-content` (may call Query; each
  candidate visibly contains only one title, one body, and one paired editorial
  image with sourced curves, event/threshold geometry, or future scenarios).

## Runtime dependencies

- Node.js 22+ for every validator script, with Playwright and a local Chromium/Chrome executable for the
  deterministic preview renderer and selected release audits (declared in their `compatibility` frontmatter).
  Codex runs supply these via the bundled runtime under
  `~/.cache/codex-runtimes/`; set `NODE_PATH` to a Playwright-bearing
  `node_modules` when invoking capture or audit scripts manually.

## Write operations

Frame publication follows the capability-advertised upload → manifest → draft
→ prepare → publish sequence. A validated publish receipt ends the creator
flow; Codex does not call `get_frame`, browse a canonical page, or display a
web link after publication. Initial and correction
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

For a new release, run the shared [live verification gate](README.md#live-verification-gate). In a fresh Codex task, ask `What changed around USO recently?` and confirm the answer routes through `query-cuebook` and returns a normal source-linked MCP result with no write-tool calls. Then use a real creator idea for preview; never publish a placeholder idea.
