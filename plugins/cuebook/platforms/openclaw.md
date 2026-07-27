# Cuebook on OpenClaw

**Surface:** Two Agent Skills plus an OAuth-authenticated Streamable HTTP MCP server.

**Package status:** The portable bundles match OpenClaw's Agent Skills roots and its MCP registry format.

**Live status:** Skill discovery, OAuth, Tool probe, preview, and publication are pending host verification.

## Install the three Skills

Copy the generated `skills/query-cuebook`, `skills/create-cuebook-content`, and `skills/author-cuebook-skill` directories into one OpenClaw Skill root, preferably the project-level `<workspace>/.agents/skills/` directory. Use `~/.agents/skills/` only when the same Cuebook Skills should be visible to every local agent.

Do not point OpenClaw at `plugins/cuebook/skills/`; its recursive discovery would expose internal modules and recreate the context-budget problem the public bundles solve.

Confirm discovery:

```bash
openclaw skills list
```

## Configure MCP

```bash
openclaw mcp add cuebook \
  --url https://cuebook.xyz/mcp \
  --transport streamable-http \
  --auth oauth \
  --timeout 20 \
  --connect-timeout 5

openclaw mcp login cuebook
```

Do not add a static Authorization header and do not enable parallel Tool calls for the ordered Frame mutation path.

## Verification

After the server rollout, require a live probe:

```bash
openclaw mcp doctor cuebook --probe
```

Then run the rest of the shared [live verification gate](README.md#live-verification-gate). A static `status` result is useful diagnostics but does not replace the probe or a normal `get_frame_capabilities` result.

## Official host references

- [OpenClaw MCP commands](https://docs.openclaw.ai/cli/mcp)
- [OpenClaw Skills](https://docs.openclaw.ai/tools/skills)
