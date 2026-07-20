# Cuebook on Grok

**Surface:** Custom remote MCP connector.

**Skill layer:** Not installed. This route does not claim parity with the Cuebook creator workflow.

**Live status:** Admin provisioning, OAuth, and Tool discovery are pending host verification.

## Connect

1. Open the Grok Business connector management page with team-management permission.
2. Select **Add Connector**.
3. Choose **Other** and enter `https://cuebook.xyz/mcp`.
4. Complete the required authentication.
5. Connect the individual account at `grok.com/connectors` if the team flow requires it.

Cuebook is already a public HTTPS endpoint. Do not add a tunnel, localhost URL, static bearer header, or a second OAuth client.

## Capability boundary

This connection exposes MCP Tools only. Qualify `get_frame_capabilities`, source-linked reads, and existing Frame reads first. Do not describe the connector as the full Cuebook creator product until Grok can reproduce the Skill's creator interview, evidence lock, exact mobile visual render, signed upload, and verified publish sequence.

## Verification

After the server rollout, run the MCP-direct portion of the shared [live verification gate](README.md#live-verification-gate). Do not use publication as the first connectivity test.

## Official host reference

- [Grok connector management](https://docs.x.ai/grok/connector-management)
