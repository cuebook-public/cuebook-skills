# Cuebook on Hermes Agent

**Surface:** Two Agent Skills plus an OAuth-authenticated HTTP MCP server.

**Package status:** The portable bundles match Hermes' GitHub Skill installation model and its MCP configuration shape.

**Live status:** Security scan, Skill discovery, OAuth, preview, and publication are pending host verification.

## Install the two Skills

Inspect each community Skill before installation, then install only the public bundles:

```bash
hermes skills inspect cuebook-public/cuebook-skills/skills/query-cuebook
hermes skills inspect cuebook-public/cuebook-skills/skills/create-cuebook-content

hermes skills install cuebook-public/cuebook-skills/skills/query-cuebook
hermes skills install cuebook-public/cuebook-skills/skills/create-cuebook-content
```

Do not install `plugins/cuebook/skills/`; those directories are on-demand implementation modules, not public entrypoints.

## Configure MCP

Add Cuebook to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  cuebook:
    url: "https://cuebook.xyz/mcp"
    auth: oauth
```

Then complete one login:

```bash
hermes mcp login cuebook
```

Do not mark Cuebook as safe for parallel MCP calls. Its read operations can be batched where the host permits, but upload, manifest, draft, prepare, and publish mutations remain ordered and independently idempotent. A successful typed publish result ends the creator flow; do not parse a receipt, reconcile history, add an automatic `get_frame` readback, or present a canonical web link.

## Verification

After the server rollout, run the shared [live verification gate](README.md#live-verification-gate). Confirm the two Skills with `hermes skills list`, retain one normal `get_frame_capabilities` result, and preview a real idea before any explicit test publication.

## Official host references

- [Hermes MCP support](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)
- [Hermes Skills system](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
