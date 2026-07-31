# Cuebook Platform Support

For installation, begin with the canonical
[AI-agent installation entrypoint](../INSTALL.md). It selects the distribution
channel, routes to the most specific host guide, and owns the shared live
verification gate.

Cuebook uses one authenticated remote MCP endpoint per distribution channel:

```text
stable main / production: https://cuebook.app/mcp
dev / development:        https://cuebook.xyz/mcp
```

The Skill behavior and Tool contract are identical. OAuth credentials are
resource-bound, so do not register both endpoints under the same host profile
or expect a token issued for one endpoint to work on the other.

The repository also publishes exactly three self-contained Agent Skills:

- `query-cuebook`
- `create-cuebook-content`
- `author-cuebook-skill`

Those layers are related but not interchangeable. MCP provides typed Cuebook data and authorized Frame operations. The Skills provide natural creator conversation, a reconciled evidence plan, confirmation before rendering, mobile visual composition, and safe publication behavior.

## Support matrix

| Host | Agent Skills | Remote MCP | Distribution | Current evidence |
| --- | --- | --- | --- | --- |
| [Codex app and Codex CLI](codex.md) | Yes | Yes | Cuebook Plugin | OAuth, read, preview, and publication live-verified on 2026-07-20 |
| [Claude Code](claude-code.md) | Yes | Yes | Native Claude Code marketplace | OAuth, upload, and atomic publication live-verified on 2026-07-21 |
| [Cursor editor and CLI](cursor.md) | Yes | Yes | Built Skill bundles + Cursor MCP config | Static setup ready; live check pending |
| [Hermes Agent](hermes.md) | Yes | Yes | GitHub Skill paths + Hermes MCP config | Static install/update contract ready; live check pending |
| [OpenClaw](openclaw.md) | Yes | Yes | Codex-compatible Cuebook bundle | Current CLI local bundle and MCP config verified; marketplace OAuth/live check pending |
| [Claude and Claude Desktop](claude-desktop.md) | No bundled Skill path | Yes | Custom connector | Documented; live check pending |
| [ChatGPT](chatgpt.md) | No | Yes | Custom MCP app | Eligible plans only; live check pending |
| [Grok](grok.md) | No | Yes | Custom MCP connector | Team-admin setup; live check pending |
| [Generic Agent Skills clients](generic-agent-skills.md) | Yes | Host-dependent | Built Skill bundles | Format validated; behavior host-dependent |
| [Generic MCP clients](generic-mcp.md) | No | Yes | Streamable HTTP | Protocol-compatible; behavior host-dependent |

“Package validated” means local manifests, public Skill count, resource closure, and release bundles passed deterministic checks. It does not mean OAuth or a live Tool call succeeded on that host.

## Host adapter contract

`plugins/runtime/cuebook/` is the canonical portable Plugin root. It owns the
generated `skills/` directory, the single `.mcp.json` definition, and the
native Codex and Claude manifests. Codex and Claude install that root directly.
OpenClaw consumes the same sanitized directory as a Codex-compatible bundle. Hermes
installs the three generated repository-root `skills/` bundles and configures
the same remote MCP endpoint through its native registry.

An adapter must never copy or fork the canonical Skill source. It must expose
exactly the three public entrypoints, keep internal `plugins/cuebook/skills/`
modules undiscoverable, register at most one `cuebook` production MCP server,
and leave OAuth credentials in the host. A compatible same-major update uses
the host's normal update and reload path without reinstalling the connector or
asking for another grant. A declared major, permission, or capability-tier
change requires explicit review before activation.

## Capability boundary

### Skills plus MCP

These hosts are the complete Cuebook creator targets. They can preserve the user's view, ask at most one optional high-leverage question, retrieve a bounded evidence set, confirm exact copy and settlement before pixels, render one publication image locally, upload it over signed HTTPS, and publish only after explicit intent.

### MCP direct

These hosts can authenticate and call Cuebook Tools. They do not automatically inherit the three Skills or their local JavaScript renderers. Until a host-specific creator adapter is verified, document successful reads and Frame Tool discovery without claiming full creator parity.

## Live verification gate

The canonical [live verification gate](../INSTALL.md#live-verification-gate)
applies to maintainers qualifying a named or generic host adapter. Ordinary
user installation ends at the quick path in `INSTALL.md`.

## References

- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Agent Skills specification](https://agentskills.io/specification)
