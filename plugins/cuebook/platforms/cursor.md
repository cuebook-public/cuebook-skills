# Cuebook on Cursor

**Surface:** Two Agent Skills plus remote MCP in the Cursor editor and Cursor CLI.

**Package status:** The portable Skill bundles and host configuration are ready for static inspection.

**Live status:** Skill discovery, OAuth, preview, and publication are pending host verification.

## Install the three Skills

Use the generated bundles from the repository root, not `plugins/cuebook/skills/`:

```text
skills/query-cuebook/
skills/create-cuebook-content/
skills/author-cuebook-skill/
```

Copy those three directories into either the project's `.agents/skills/` directory or the user's Agent Skills directory supported by the installed Cursor version. Start a new Cursor session after installation. Never copy the source modules as separate Skills.

## Configure MCP

Add this project configuration at `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cuebook": {
      "url": "https://cuebook.xyz/mcp"
    }
  }
}
```

Use Cursor's MCP settings or CLI to complete OAuth once. Current CLI builds expose commands in this family:

```bash
cursor-agent mcp login cuebook
cursor-agent mcp list-tools cuebook
```

If the installed build uses different command names, use its MCP settings UI rather than inventing another Cuebook client entry.

## Verification

After the server rollout, run the shared [live verification gate](README.md#live-verification-gate). Confirm that only the three public Skills are discoverable, require a normal `get_frame_capabilities` result, then preview a real idea without publishing. Cursor's host-native image generation is not a substitute for the Skill's exact PNG dimensions, bitmap audit, and manifest hashes.

## Official host references

- [Cursor MCP documentation](https://cursor.com/docs/context/model-context-protocol)
- [Cursor Agent Skills release](https://cursor.com/changelog/2-4)
