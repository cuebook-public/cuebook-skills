# Cuebook Platform Support

Cuebook uses one authenticated remote MCP endpoint:

```text
https://cuebook.xyz/mcp
```

The repository also publishes exactly two self-contained Agent Skills:

- `query-cuebook`
- `create-cuebook-content`

Those layers are related but not interchangeable. MCP provides typed Cuebook data and authorized Frame operations. The Skills provide natural creator conversation, a reconciled evidence plan, confirmation before rendering, mobile visual composition, and safe publication behavior.

## Support matrix

| Host | Agent Skills | Remote MCP | Distribution | Current evidence |
| --- | --- | --- | --- | --- |
| [Codex app and Codex CLI](codex.md) | Yes | Yes | Cuebook Plugin | Package validated; live OAuth recheck pending |
| [Claude Code](claude-code.md) | Yes | Yes | Native Claude Code marketplace | OAuth, upload, and atomic publication live-verified on 2026-07-21 |
| [Cursor editor and CLI](cursor.md) | Yes | Yes | Built Skill bundles + Cursor MCP config | Static setup ready; live check pending |
| [Hermes Agent](hermes.md) | Yes | Yes | Built Skill bundles + Hermes MCP config | Static setup ready; live check pending |
| [OpenClaw](openclaw.md) | Yes | Yes | Built Skill bundles + OpenClaw MCP registry | Static setup ready; live check pending |
| [Claude and Claude Desktop](claude-desktop.md) | No bundled Skill path | Yes | Custom connector | Documented; live check pending |
| [ChatGPT](chatgpt.md) | No | Yes | Custom MCP app | Eligible plans only; live check pending |
| [Grok](grok.md) | No | Yes | Custom MCP connector | Team-admin setup; live check pending |
| [Generic Agent Skills clients](generic-agent-skills.md) | Yes | Host-dependent | Built Skill bundles | Format validated; behavior host-dependent |
| [Generic MCP clients](generic-mcp.md) | No | Yes | Streamable HTTP | Protocol-compatible; behavior host-dependent |

“Package validated” means local manifests, public Skill count, resource closure, and release bundles passed deterministic checks. It does not mean OAuth or a live Tool call succeeded on that host.

## Capability boundary

### Skills plus MCP

These hosts are the complete Cuebook creator targets. They can preserve the user's view, ask at most one optional high-leverage question, retrieve a bounded evidence set, confirm exact copy and settlement before pixels, render one publication image locally, upload it over signed HTTPS, and publish only after explicit intent.

### MCP direct

These hosts can authenticate and call Cuebook Tools. They do not automatically inherit the two Skills or their local JavaScript renderers. Until a host-specific creator adapter is verified, document successful reads and Frame Tool discovery without claiming full creator parity.

## Live verification gate

Run this gate only after the target Cuebook server release is confirmed healthy:

1. Install or configure the host once.
2. Start one OAuth flow. If token exchange fails, stop; do not retry in parallel or consume another connection slot.
3. Require a normal `get_frame_capabilities` result. Browser approval or an “enabled” badge is not enough.
4. Run one smallest useful read and retain source-linked output.
5. On a Skill host, create one preview from a real user idea and inspect the sole publication master at its 622 × 264 mobile display size. Preview must not publish.
6. With explicit user intent, publish one clearly identified test Frame. Treat the successful `complete_frame_publish` result as terminal; do not parse a receipt or add a web-page, reconciliation, or `get_frame` readback to the creator path.
7. Record the host version and which gates passed before changing “pending” to “verified.”

The Frame publication contract remains the same on every host. Initial and correction publication use prepare then publish; withdrawal alone has separate action consent. Image bytes travel to signed upload URLs and are never downloaded back through an MCP media Tool.

## References

- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Agent Skills specification](https://agentskills.io/specification)
