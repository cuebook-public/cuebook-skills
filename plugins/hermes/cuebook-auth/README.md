# Cuebook OAuth bridge for Hermes

This thin Hermes plugin adds one **Connect Cuebook** command-menu entry, exposed
by Telegram as `/cuebook_auth`. It does not implement MCP, copy Cuebook
credentials, intercept natural-language messages, or replace Hermes OAuth. The
command calls the native Hermes Dashboard OAuth API on
`http://127.0.0.1:9119`, returns the validated server-generated approval URL as
a labeled link to a private Telegram chat, and refreshes MCP Tool discovery
after the Dashboard reports approval.

Hermes Agent 0.19.1 waits for browser approval inside MCP initialization. After
Hermes confirms that a new OAuth flow is required, the bridge uses the
source-pinned build's native configuration API to verify the same official
local `cuebook` entry and idempotently raise only a missing or shorter
`connect_timeout` to 315 seconds. This prevents Hermes from cancelling the wait
and replacing the PKCE state behind a link already sent to Telegram. The value
also bounds ordinary initial connection and discovery failures, so an
unavailable endpoint can take up to 315 seconds to fail; the Tool-call timeout
is unchanged.

The bridge deliberately fails closed:

- only Telegram direct messages may invoke the command;
- only the distribution channel's official Cuebook MCP origin is accepted;
- the authorization origin, path, PKCE fields, resource, and exact callback
  URI are validated before a URL is returned;
- Dashboard redirects and non-JSON responses are rejected;
- the OAuth wait timeout must be saved and read back before a link is returned;
- concurrent commands reuse one in-process OAuth flow;
- the Dashboard session secret and authorization URL are never logged.

The operator must inject the same URL-safe 256-bit
`HERMES_DASHBOARD_SESSION_TOKEN` into the Gateway and loopback Dashboard
processes. `HERMES_DASHBOARD_PUBLIC_URL` must be the HTTPS reverse-proxy base
that exposes only `/api/mcp/oauth/callback/cuebook`. Never expose port 9119.

See the canonical [Hermes installation guide](../../cuebook/platforms/hermes.md)
for setup, installation, and verification.
