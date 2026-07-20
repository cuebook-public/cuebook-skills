# Cuebook on Claude Code

**Surface:** Native Claude Code plugin with two Agent Skills and remote MCP.

**Package status:** Native marketplace and plugin manifests are present and statically validated.

**Live status:** OAuth, Tool discovery, preview, and publication are pending host verification.

## Install and discovery

Install from the repository's native Claude Code marketplace:

```bash
claude plugin marketplace add cuebook-public/cuebook-skills@<release-tag> \
  --sparse .claude-plugin plugins/cuebook

claude plugin install cuebook@cuebook
```

Start a new Claude Code session, or run `/reload-plugins`. The plugin manifest points Claude Code at `public-skills/`, so it discovers exactly `query-cuebook` and `create-cuebook-content`; supporting implementation modules remain on-demand references.

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
authorization; initial and correction publication go from prepare directly to
publish, withdrawal retains separate first-party consent, and query is
structurally read-only.

## Current verification boundary

- Native marketplace loading is not yet verified with a released tag.
- End-to-end MCP OAuth flow is not yet verified on Claude Code.
- Render/audit scripts unverified against a locally installed Playwright
  (only the bundled Codex runtime is exercised today).
- Trigger behavior of the two entrypoints has not been evaluated on Claude
  Code (see `evals/`).

## Smoke test

```bash
node plugins/cuebook/scripts/validate_cuebook_plugin.mjs plugins/cuebook
node --test 'plugins/cuebook/**/*.test.mjs'
```

Also run `claude plugin validate .` from a checkout of this repository.

After the server rollout, run the shared [live verification gate](README.md#live-verification-gate). Ask `What changed around USO recently?` and confirm routing to `query-cuebook` with a normal source-linked MCP result and no write-tool calls.
