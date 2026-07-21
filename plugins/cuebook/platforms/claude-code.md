# Cuebook on Claude Code

**Surface:** Native Claude Code plugin with two Agent Skills and remote MCP.

**Package status:** Native marketplace packaging explicitly exposes two self-contained Skills plus the canonical remote MCP config.

**Live status:** OAuth, Tool discovery, image upload, and atomic Frame publication were live-verified on 2026-07-21.

## Install and discovery

Install from the repository's native Claude Code marketplace:

```bash
claude plugin marketplace add cuebook-public/cuebook-skills \
  --sparse .claude-plugin skills plugins/cuebook

claude plugin install cuebook@cuebook
```

Start a new Claude Code session, or run `/reload-plugins`. The repository-root marketplace entry explicitly installs only `skills/query-cuebook` and `skills/create-cuebook-content`. Each is a self-contained generated bundle; supporting implementation modules remain non-discoverable references inside those bundles.

Verify the installed inventory before using it:

```bash
claude plugin details cuebook@cuebook
claude mcp list
```

The plugin inventory must report exactly **2 Skills**, and the MCP list must contain `plugin:cuebook:cuebook`. A larger Skill count means an older marketplace snapshot is still installed; update the marketplace and reinstall the plugin once, then reload Claude Code. This refresh does not require a second OAuth grant.

For a reproducible frozen install, use `cuebook-public/cuebook-skills@v0.9.6` in the marketplace command. A tag-pinned marketplace stays on that release until its source is changed.

## Update

An ordinary `main` installation updates in place:

```bash
claude plugin marketplace update cuebook
claude plugin update cuebook@cuebook
claude plugin details cuebook@cuebook
claude mcp list
```

Restart Claude Code, or run `/reload-plugins`, after the update. Do not remove the MCP server or repeat OAuth when the existing connector remains authenticated. For a tag-pinned install, remove the old marketplace and add the new release tag once; the host-owned OAuth credential remains separate from the package snapshot.

## MCP configuration and auth

The plugin ships `.mcp.json` with an HTTP endpoint at `https://cuebook.xyz/mcp`. Do not register the same endpoint a second time. In Claude Code, open `/mcp`, select Cuebook, and complete one browser authentication flow. OAuth credentials stay in the host connector.

If authentication or token exchange fails, stop after that one result. Do not add another server name, reinstall the plugin, or launch parallel logins.

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
authorization. Ordinary initial publication uses one upload reservation, one
signed PUT, and `complete_frame_publish`; correction keeps its prepare/publish
path, withdrawal retains separate first-party consent, and query is
structurally read-only.

## Current verification boundary

- The released two-Skill inventory still needs one post-install count check after each package update; active sessions retain their startup snapshot until reload.
- Render/audit scripts unverified against a locally installed Playwright
  (only the bundled Codex runtime is exercised today).
- Automated two-entrypoint trigger evaluation has not yet run on Claude Code
  (see `evals/`).

## Smoke test

```bash
node plugins/cuebook/scripts/validate_cuebook_plugin.mjs plugins/cuebook
node --test 'plugins/cuebook/**/*.test.mjs'
```

Also run `claude plugin validate . --strict` from a checkout of this repository, confirm `claude plugin details cuebook@cuebook` reports exactly two Skills, and confirm `claude mcp list` contains `plugin:cuebook:cuebook`.

Run the shared [live verification gate](README.md#live-verification-gate). Ask `What changed around USO recently?` and confirm routing to `query-cuebook` with a normal source-linked MCP result and no write-tool calls.
