# Cuebook on ChatGPT

**Surface:** Custom remote MCP app in ChatGPT developer mode.

**Skill layer:** Not installed. ChatGPT does not consume this repository's Agent Skills bundles.

**Live status:** OAuth and Tool discovery are pending an eligible-plan host verification.

## Availability

At the time this guide was written, custom apps with full MCP read and write support are a beta feature for ChatGPT Business, Enterprise, and Edu on the web. Workspace administrators control developer mode and app availability. Check the current OpenAI documentation before testing because plan and UI requirements can change.

## Connect

1. Enable developer mode in the applicable workspace or user settings.
2. Open **Settings → Apps** and create a custom app.
3. Name it `Cuebook` and enter `https://cuebook.xyz/mcp`.
4. Complete one OAuth flow.
5. Let ChatGPT scan the Tools, then enable the app in a new conversation.

Do not paste API keys, access tokens, refresh tokens, or OAuth codes into app instructions.

## Capability boundary

This is a direct MCP connection. Verify `get_frame_capabilities`, source-linked reads, and existing Frame reads. Full Cuebook creator parity is not claimed because the custom app does not install the local interview, evidence-routing, JavaScript rendering, bitmap audit, and upload orchestration in the two Agent Skills.

Write verification must also wait until the ChatGPT workspace exposes modify actions and the user explicitly authorizes a clearly identified test Frame.

## Verification

After the server rollout, run the MCP-direct portion of the shared [live verification gate](README.md#live-verification-gate). A successful app scan or browser approval is not sufficient; retain one normal MCP result as the connection proof.

## Official host reference

- [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta)
