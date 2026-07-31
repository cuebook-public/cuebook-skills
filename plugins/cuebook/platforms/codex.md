# Cuebook on Codex and Codex CLI

**Surface:** Cuebook Plugin with three Agent Skills and remote MCP.

**Package status:** Validated locally.

**Live status:** OAuth, Tool discovery, preview, and publication were live-verified on 2026-07-20.

## Install and discovery

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --sparse .agents/plugins \
  --sparse plugins/runtime/cuebook

codex plugin add cuebook@cuebook

codex mcp list --json

# Only when the status is not_logged_in and no login is pending:
codex mcp login cuebook
codex mcp list --json
```

Skills are discovered from the plugin runtime's generated `skills/` directory.
Codex reads exactly three `SKILL.md` files at startup. Internal capabilities are
vendored as non-discoverable `references/modules/*.md` resources behind
`query-cuebook`, `create-cuebook-content`, and `author-cuebook-skill`.

The default marketplace follows stable releases from `main`. Add `--ref v0.9.22`
only for an intentionally frozen install.

## Update

```bash
codex plugin marketplace upgrade cuebook
codex plugin add cuebook@cuebook
codex mcp list --json
```

`codex plugin marketplace upgrade` applies only to a Git-backed marketplace
created by `codex plugin marketplace add`. If `codex plugin marketplace list`
points `cuebook` at a local checkout, it intentionally rejects the upgrade
because that checkout is not a Git marketplace managed by Codex. Update the
checkout yourself and run only:

```bash
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
The connector owns its existing credential. After a version-changing refresh,
fully quit and reopen the Codex app, or restart the Codex CLI process, before
opening one new task. A new task alone can retain an older in-memory Plugin and
Tool snapshot. Reauthenticate only when the connector
explicitly reports `not_logged_in`, requires scope step-up, or the grant was
revoked.

Treat an HTTP, DNS, TLS, proxy, socket, or timeout failure as connectivity, not
as proof that OAuth was lost. If the `cuebook` entry remains authenticated,
restore that network path and retry the same request without reinstalling or
starting another login.

The marketplace policy is `ON_INSTALL`, but `codex plugin add` does not
guarantee that the CLI will open a browser. On a first-time installation,
inspect the `cuebook` entry from `codex mcp list --json`, then run
`codex mcp login cuebook` once only when it reports `not_logged_in`. Skip login
when Cuebook is already authenticated or a login is pending. If login opens a
browser, the approval belongs to the user: wait for them to finish, never
approve it yourself, and never restart login while that attempt is pending.

The installing task owns installation and that one necessary host login. It
must not create a background test task, publish a placeholder idea, or use a
public ChatGPT plugin manager to diagnose this local marketplace. After
authentication completes, fully quit and reopen the Codex app (`Cmd+Q` on
macOS), or restart the Codex CLI process. Only then open one new task so Plugin
and Tool discovery happen from the installed version with an authenticated
connector. List Cuebook's Tools and make one smallest normal read-only call;
Tool discovery alone is not proof of readiness. Retry login only after an
explicit authentication failure, never for discovery, network, TLS, proxy, or
timeout failures.

## MCP configuration and auth

Stable `main` releases ship `.mcp.json` pointing at `https://cuebook.app/mcp`;
development builds from `dev` point at `https://cuebook.xyz/mcp`. OAuth
credentials live in the Codex connector, never in a Skill file or generated
artifact. Authentication belongs to installation, not to Query or Create.

An enabled connector or completed browser approval is useful diagnostic state,
not end-to-end proof. In the first new task, make a real Cuebook request and
require a normal MCP result. If the Tool is absent, the connector still reports
`not_logged_in`, or token exchange fails, preserve the request and stop. Repair
the install-time connection before opening one later task; do not make the
Skill repeat DCR, run a CLI login, create a custom client, or open another task.

If the plugin was installed during the current task, finish install-time
authentication, fully restart the host, and then open one new task. Do not
reinstall or debug plugin discovery inside the creation flow.

## Invocation

- Read or inspect anything: `query-cuebook` (read-only, no writes).
- Turn an idea into a Frame: `create-cuebook-content` (may call Query; each
  candidate visibly contains only one title, one body, and one paired editorial
  image with sourced curves, event/threshold geometry, or future scenarios).
- Submit a creator-authored skill to the community marketplace:
  `author-cuebook-skill` (structural pre-check, one confirmed manifest card,
  signed upload; every receipt reads submitted for review).

TradingView is an optional, separately configured workbench behind the Query
and Create entrypoints; it does not add another Skill or a hidden Cuebook dependency.
When a creator wants local-chart inspection, bounded outside research, or a
confirmed chart annotation transfer, follow
[Optional TradingView Connectors](../references/tradingview-optional-connectors.md). Keep the
Desktop and research servers under distinct host names.

## Runtime dependencies

- Node.js 22+ for every validator script, with Playwright and a local Chromium/Chrome executable for the
  deterministic preview renderer and selected release audits (declared in their `compatibility` frontmatter).
  Codex runs supply these via the bundled runtime under
  `~/.cache/codex-runtimes/`; set `NODE_PATH` to a Playwright-bearing
  `node_modules` when invoking capture or audit scripts manually.

## Write operations

Ordinary initial Frame publication stages one signed image upload, then sends one
`complete_frame_publish` v3 request with a closed `settlement` branch and
agent-inferred `reasoning_tags`. A successful typed result ends the creator flow;
Codex does not parse a receipt, reconcile history, call `get_frame`, browse a
canonical page, or display a web link after publication. Initial and correction
publishing use the active OAuth MCP grant; a first-party Publish action is a
separate UI authorization path, not an additional MCP gate. Frame releases are
immutable. MCP has no author-management action; Cuebook App can hide/show a Frame
and may allow deletion during the first hour. Unchanged economics may use an
append-only Correction, while a changed thesis or economic contract requires a
new Frame. An author may explicitly append one immutable text-only child after
reviewing the parent and existing children; it carries its own reasoning envelope,
including child-only `retrospective` when the text actually compares the original
thesis with later evidence or outcome. Every mutation uses a separate lowercase
UUIDv7. Query never calls writes; Create never publishes silently, and no
standalone media retrieval tool is exposed.

## Known limitations

- Heavy render skills fail cleanly when Chromium or Playwright is missing;
  they do not fall back to approximate output.
- Trial fonts are evaluation-only and never enter a release artifact.

## Maintainer smoke test

```bash
node plugins/cuebook/scripts/validate_cuebook_plugin.mjs plugins/cuebook
```

Release maintainers run the shared [live verification gate](../INSTALL.md#live-verification-gate). An ordinary install ends after a fresh Codex task answers `What changed around USO recently?` through `query-cuebook` with a normal source-linked MCP result and no write-tool calls. Preview and publication checks belong to release verification; never publish a placeholder idea.
