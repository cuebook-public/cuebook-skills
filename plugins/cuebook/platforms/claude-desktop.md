# Cuebook on Claude and Claude Desktop

**Surface:** Remote MCP custom connector.

**Skill layer:** Not installed. This path does not claim parity with the Cuebook creator workflow.

**Live status:** OAuth and Tool discovery are pending host verification.

## Connect

For an individual Claude plan:

1. Open **Customize → Connectors**.
2. Select **Add custom connector**.
3. Name it `Cuebook` and enter `https://cuebook.xyz/mcp`.
4. Select **Connect** and complete one OAuth flow.
5. Enable Cuebook for the conversation from the connector picker.

Team and Enterprise owners add the custom web connector in organization settings first; members then connect their own accounts. Remote connectors are brokered by Anthropic's cloud, so the public Cuebook endpoint is used instead of a local `claude_desktop_config.json` process.

## Capability boundary

Claude can call the MCP Tools it discovers. It does not load the two JavaScript-backed Cuebook Agent Skills through this connector. Verify queries and existing Frame reads first. Do not claim the complete creator interview, deterministic dual-composition rendering, or publication workflow until a Claude-hosted creator adapter passes those tests.

## Verification

After the server rollout, run the MCP-direct portion of the shared [live verification gate](README.md#live-verification-gate): one OAuth flow, a normal `get_frame_capabilities` result, one source-linked read, and one existing `get_frame` read. Do not publish during connector qualification.

## Official host reference

- [Claude custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
