# Install Cuebook with an AI agent

This is Cuebook's canonical, host-neutral installation entrypoint. Read it
before changing MCP configuration, installing Skills, or starting
authentication. The Git branch containing this file selects the Cuebook
distribution channel; stay on that branch throughout installation.

## Installation contract

1. Read the [distribution manifest](distribution-channel-v1.json) from this
   same branch. Its `mcp_url` is the only Cuebook endpoint for this install.
   Never substitute an endpoint from another branch, and never reuse OAuth
   credentials across endpoints.
2. Identify the current host and open the most specific guide in the table
   below. Use a generic guide only when no named host matches.
3. Read that host guide completely before acting. Use its host-native Plugin,
   Skill, MCP, authentication, reload, and update paths; do not invent a
   parallel installer or connector.
4. Complete the shared [live verification gate](#live-verification-gate).
   Repository access, package installation, browser approval, an enabled
   badge, or Tool discovery alone is not proof that Cuebook is ready.

If this file, the distribution manifest, or the selected host guide cannot be
read, stop and tell the user which document is unavailable. Do not guess
commands or fall back to remembered instructions.

## Choose the current platform

| Host | Installation route | Guide |
| --- | --- | --- |
| Codex app or Codex CLI | Cuebook Plugin: three Agent Skills plus MCP | [Codex](platforms/codex.md) |
| Claude Code | Native Claude Code marketplace Plugin: three Agent Skills plus MCP | [Claude Code](platforms/claude-code.md) |
| Cursor editor or Cursor CLI | Three Agent Skill bundles plus native MCP configuration | [Cursor](platforms/cursor.md) |
| Hermes Agent | Three Agent Skill bundles plus native MCP configuration | [Hermes](platforms/hermes.md) |
| OpenClaw | Compatible Cuebook bundle plus native MCP configuration | [OpenClaw](platforms/openclaw.md) |
| Claude or Claude Desktop | MCP custom connector only | [Claude and Claude Desktop](platforms/claude-desktop.md) |
| ChatGPT | MCP custom app only | [ChatGPT](platforms/chatgpt.md) |
| Grok | MCP custom connector only | [Grok](platforms/grok.md) |
| Another Agent Skills host | Three built Agent Skill bundles plus a host-native MCP connection when supported | [Generic Agent Skills](platforms/generic-agent-skills.md) |
| Another MCP host | OAuth-authenticated Streamable HTTP MCP only | [Generic MCP](platforms/generic-mcp.md) |

The [platform matrix](platforms/README.md) records capability boundaries,
verification evidence, and the adapter contract for every supported host.

## Layer and connection rules

- When the selected Plugin already supplies `cuebook`, do not add another MCP
  server and do not install a second copy of its Skills.
- On a non-Plugin Agent Skills host, install exactly the three public bundles
  named by the selected guide. Do not expose the plugin's internal Skill
  modules as standalone Skills.
- On an MCP-only host, configure the connector but do not claim the creator
  interview, local rendering, or publication orchestration supplied by the
  Agent Skills.
- Keep exactly one MCP server named `cuebook` for this distribution channel.
  OAuth credentials belong to the host connector, never to a Skill,
  repository file, generated artifact, or copied bearer header.

## Live verification gate

Run this gate only after the target Cuebook server release is confirmed
healthy:

1. Install or configure the host once. When a Plugin already provides
   `cuebook`, do not register a duplicate MCP server.
2. Inspect the host connection state. If Cuebook is authenticated or login is pending,
   do not start another login. Otherwise start exactly one
   host-native login only for an explicit authentication requirement.
3. If login opens a browser, the approval belongs to the user. Wait for them
   to finish, never approve it yourself, and never restart login while the
   attempt is pending.
4. After login exits, list Cuebook's Tools, require a normal
   `get_frame_capabilities` result, and run one smallest useful read with
   source-linked output. Browser approval, an enabled badge, or Tool discovery
   alone is not enough.
5. Retry login only after an explicit `not_logged_in`, authorization
   challenge, or revoked grant. Discovery, HTTP, DNS, TLS, proxy, socket, and
   timeout failures are not authentication failures.
6. On a Skill host, create one preview from a real user idea and inspect the
   sole publication master at its 622 × 400 mobile display size. Preview must
   not publish.
7. Publish a clearly identified test Frame only with explicit user intent.
   Treat a successful `complete_frame_publish` result as terminal; do not add
   receipt parsing, a web-page check, reconciliation, or `get_frame` readback
   to the creator path.
8. Exercise the host-native update path once. After reload, require the same
   three public Skills where supported, one `cuebook` MCP server, and a normal
   read without a second OAuth grant. Stop for explicit review if the update
   declares a major, permission, or capability-tier change.
9. Record the host and package versions and which gates passed before changing
   a platform's status from pending to verified.

The Frame publication contract remains the same on every host. Initial
publication and append-only Correction use their declared publish paths.
Frame releases are immutable; MCP has no author-management action, while
Cuebook App can hide or show a Frame and may allow deletion during the first
hour. Changed thesis or economics require a new Frame. Image bytes travel to
signed upload URLs and are never downloaded back through an MCP media Tool.

## Extend to another host

Add a host adapter only when it can follow the
[platform adapter contract](platforms/README.md#host-adapter-contract). Add one
English `platforms/<host>.md` guide, register it in the platform matrix and
this routing table, declare whether it supports Plugin, Agent Skills, MCP, or
a combination, and link it back to this live verification gate. Generic
routes remain the fallback until a named adapter passes its evidence gates.
