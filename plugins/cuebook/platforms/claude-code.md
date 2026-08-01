# Cuebook on Claude Code

**Surface:** Native Claude Code plugin with three Agent Skills and remote MCP.

**Package status:** Native marketplace packaging explicitly exposes three self-contained Skills plus the canonical remote MCP config.

**Live status:** OAuth, Tool discovery, image upload, and atomic Frame publication were live-verified on 2026-07-21.

## Install and discovery

Install from the repository's native Claude Code marketplace:

```bash
claude plugin marketplace add cuebook-public/cuebook-skills && claude plugin install cuebook@cuebook
```

The whole repository is about 7 MB, so this clones in full and needs no sparse
checkout. The root marketplace manifest already points at
`./plugins/runtime/cuebook`, and the installed plugin is that root either way.

`claude plugin marketplace add` clones over the network. It attempts SSH first
and falls back to HTTPS, so a logged SSH failure is part of the normal path. If
the HTTPS attempt also fails with a TLS, DNS, proxy, socket, or timeout error,
the package source was never reached and nothing is wrong with the package.
Report that transport failure and let the user decide how their network reaches
GitHub. Do not change their Git or proxy configuration and do not substitute
another install source.

Start a new Claude Code session, or run `/reload-plugins`. The marketplace
installs the sanitized `plugins/runtime/cuebook` root. Its conventional
`skills/` directory contains only `query-cuebook`, `create-cuebook-content`,
and `author-cuebook-skill`; the 39 internal source modules live outside the
install root and cannot be auto-discovered.

Verify the installed inventory before using it:

```bash
claude plugin details cuebook@cuebook
claude mcp list
```

The plugin inventory must report exactly **3 Skills**, and the MCP list must
contain `plugin:cuebook:cuebook`. Compare the installed version with the
marketplace version before repairing it. If the installed version is older,
update it once and reload. If the current version still reports anything other
than three Skills, stop with `package_inventory_defect`; repeated reinstall,
cache deletion, or OAuth login will not repair a malformed package inventory.
An ordinary package refresh does not require a second OAuth grant.

For a reproducible frozen install, use `cuebook-public/cuebook-skills@v0.9.23` in the marketplace command. A tag-pinned marketplace stays on that release until its source is changed.

## Update

An ordinary `main` installation updates in place:

```bash
claude plugin marketplace update cuebook
claude plugin update cuebook@cuebook
claude plugin details cuebook@cuebook
claude mcp list
```

Restart Claude Code, or run `/reload-plugins`, after the update. Do not remove
the MCP server or repeat OAuth when the existing connector remains
authenticated. For a tag-pinned install, change to the intended release source
once; the host-owned OAuth credential remains separate from the package
snapshot. The branch or tag in this marketplace URL never authorizes changing
the user's current project checkout.

## MCP configuration and auth

Stable `main` releases ship `.mcp.json` with `https://cuebook.app/mcp`;
development builds from `dev` use `https://cuebook.xyz/mcp`, under their own
server name. Do not register the selected endpoint a second time. In Claude
Code, open `/mcp`, select Cuebook, and complete one browser authentication
flow. OAuth credentials stay in the host connector.

Read the connection state from `claude mcp list`, which reports the Cuebook
server as either connected or `Needs authentication`. Do not infer it from a
stored credential. The health check that `claude mcp list` performs itself
completes discovery and dynamic client registration, leaving behind a
credential record that holds no access token, so a record is not proof of
authentication and a missing record is not proof that login is required.

`/mcp` requires an interactive Claude Code session. `claude mcp login
plugin:cuebook:cuebook` is the equivalent CLI path and needs a TTY; without one
it exits with `stdin isn't a terminal`. An agent running non-interactively must
hand authentication back to the user instead of working around the missing
terminal. Reporting that the user has to finish login is the correct outcome
there, not a failure, and the browser prompt is never approved on their behalf.

If authentication or token exchange fails, stop after that one result. Do not add another server name, reinstall the plugin, or launch parallel logins.

## Invocation

Same three public entrypoints as Codex: `query-cuebook` (read-only),
`create-cuebook-content` (creation; may call query), and
`author-cuebook-skill` (community skill submission). The `$skill-name`
cross-invocation convention maps to Claude Code's Skill tool.

TradingView remains an optional, separately configured workbench rather than
another public Skill. Use distinct `tradingview_desktop` and
`tradingview_research` MCP server names and follow
[Optional TradingView Connectors](../references/tradingview-optional-connectors.md) for the
consent, Tool-scope, source-rights, rollback, and Frame rerender boundaries.

## Runtime dependencies

- Node.js 18+ for validators, with Playwright and local Chromium for render/audit skills.
  Claude Code has no bundled Codex runtime: install Playwright locally and
  pass `NODE_PATH` explicitly when running capture or audit scripts.

## Write operations

Identical policy to Codex: writes are explicit MCP tools behind user
authorization. Ordinary initial publication uses one upload reservation, one
signed PUT, and `complete_frame_publish`; correction keeps its prepare/publish
path, Frame releases are immutable, author hide/delete controls remain App-only,
and query is structurally read-only.

### Claude Code permission modes

Cuebook OAuth and Claude Code's local Tool permission mode are independent.
In Auto mode, Claude Code may stop an external mutation before the request
reaches Cuebook. A classifier denial is therefore not an OAuth, scope, market
calendar, or Cuebook server error.

For an ordinary initial publication, the only Cuebook mutation calls the host
should see are `begin_frame_media_upload` and `complete_frame_publish`, with the
signed image PUT between them. If Auto mode denies the correct completion call,
open `/permissions`, review the recently denied action, and retry it with manual
approval. A creator who wants a persistent rule should allow only the exact
Tool names Claude Code displays for those two actions. Never allow a whole
`mcp__<cuebook-server>__*` wildcard: it also covers Paper Trade, correction, and
other Frame actions.

Do not approve or retry `create_frame_draft`, `prepare_frame_publish`, or
`publish_frame` for an ordinary new Frame. Seeing one of those actions means the
session retained an older Plugin or Tool snapshot; update Cuebook, run
`/reload-plugins` or restart Claude Code, and begin one fresh session. Do not
backfill a market calendar, duplicate the MCP server, or repeat OAuth to work
around a host permission denial.

## Current verification boundary

- The released three-Skill inventory still needs one post-install count check after each package update; active sessions retain their startup snapshot until reload.
- Render/audit scripts unverified against a locally installed Playwright
  (only the bundled Codex runtime is exercised today).
- Automated public-entrypoint trigger evaluation has not yet run on Claude Code
  (see `evals/`).

## Maintainer smoke test

```bash
node plugins/cuebook/scripts/validate_cuebook_plugin.mjs plugins/cuebook
node --test 'plugins/cuebook/**/*.test.mjs'
```

Also run `claude plugin validate . --strict` from a checkout of this repository, confirm `claude plugin details cuebook@cuebook` reports exactly three Skills, and confirm `claude mcp list` contains `plugin:cuebook:cuebook`.

Release maintainers run the shared [live verification gate](../INSTALL.md#live-verification-gate). An ordinary install ends after `What changed around USO recently?` routes to `query-cuebook` with a normal source-linked MCP result and no write-tool calls.
