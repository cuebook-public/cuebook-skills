# Cuebook on generic MCP clients

**Surface:** OAuth-authenticated Streamable HTTP MCP.

**Skill layer:** None unless the host separately supports and installs the three Agent Skills bundles.

**Live status:** Protocol compatibility is documented; each client remains unverified until it passes the shared gate.

## Connection contract

Use one server definition:

```text
name: Cuebook
transport: Streamable HTTP
url: https://cuebook.xyz/mcp
authentication: OAuth using MCP discovery
```

The client must support the MCP authorization discovery flow, PKCE, token refresh, and a public HTTPS callback strategy appropriate to that host. Never commit tokens or replace OAuth with a copied bearer header.

## Tool boundary

Tool discovery is a capability surface, not an authorization boundary. The server enforces the user, client, grant, scopes, policy, idempotency, prepared hash, and publish token on every protected operation.

Clients that do not load the two Cuebook Agent Skills should qualify reads first. They may expose Frame Tools, but full creator behavior is not claimed until the host can produce exact PNG roles, upload them over the signed URLs, register honest hashes and alt text, preserve the meaning lock, and complete the ordered publication flow.

## Verification

After the server rollout, run the MCP-direct portion of the shared [live verification gate](README.md#live-verification-gate). Stop after the first failed OAuth exchange; do not create multiple registrations or concurrent login attempts.

## Protocol references

- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
