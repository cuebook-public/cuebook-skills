# Cuebook on Hermes Agent

**Surface:** Three Agent Skills plus an OAuth-authenticated HTTP MCP server.

**Package status:** The generated repository-root bundles match Hermes' direct GitHub Skill installation model and its MCP configuration shape. Cuebook does not require a Python runtime plugin.

**Live status:** Current-version security scan, Skill discovery, OAuth, update, preview, and publication are pending host verification.

## Install the three Skills

Inspect each community Skill before installation, then install only the public bundles:

```bash
hermes skills inspect cuebook-public/cuebook-skills/skills/query-cuebook
hermes skills inspect cuebook-public/cuebook-skills/skills/create-cuebook-content
hermes skills inspect cuebook-public/cuebook-skills/skills/author-cuebook-skill

hermes skills install cuebook-public/cuebook-skills/skills/query-cuebook
hermes skills install cuebook-public/cuebook-skills/skills/create-cuebook-content
hermes skills install cuebook-public/cuebook-skills/skills/author-cuebook-skill
```

These direct GitHub installs retain source provenance for `hermes skills
check` and `hermes skills update`. Confirm the resulting inventory:

```bash
hermes skills list --source hub
```

Do not install `plugins/cuebook/skills/`; those directories are on-demand
implementation modules, not public entrypoints. A Hermes Python plugin would
duplicate the remote MCP transport and OAuth lifecycle without adding a
Cuebook capability.

## Configure MCP

Add Cuebook to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  cuebook:
    url: "https://cuebook.app/mcp"
    auth: oauth
    timeout: 20
    connect_timeout: 5
    supports_parallel_tool_calls: false
```

After saving the entry, complete one login from a fresh terminal rather than
from the session that edited `~/.hermes/config.yaml`:

```bash
hermes mcp login cuebook
```

Hermes auto-reloads MCP configuration, but an in-session reload has a shorter
timeout than the interactive OAuth flow. The fresh-terminal login keeps one
authorization attempt alive long enough for browser approval. Reuse its cached
credential afterward; repeat login only for an explicit authorization
challenge, scope step-up, or revoked grant.

Do not mark Cuebook as safe for parallel MCP calls. Its read operations can be
batched where the host permits, but upload, manifest, draft, prepare, and
publish mutations remain ordered and independently idempotent. A successful
typed publish result ends the creator flow; do not parse a receipt, reconcile
history, add an automatic `get_frame` readback, or present a canonical web
link.

## Update

Use Hermes' stored GitHub provenance instead of reinstalling the Skill
directories:

```bash
hermes skills check
hermes skills update query-cuebook
hermes skills update create-cuebook-content
hermes skills update author-cuebook-skill
hermes skills audit
hermes skills list --source hub
```

A compatible Skill update does not replace `~/.hermes/config.yaml` or its
cached OAuth token. Do not repeat MCP setup or login. Stop for explicit review
if an update declares a major, permission, or capability-tier change.

## Verification

After the server rollout, run the shared [live verification gate](../INSTALL.md#live-verification-gate). Confirm the three Skills with `hermes skills list --source hub`, retain one normal `get_frame_capabilities` result, exercise one no-op `skills check`, and preview a real idea before any explicit test publication.

## Official host references

- [Hermes MCP support](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)
- [Hermes Skills system](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
