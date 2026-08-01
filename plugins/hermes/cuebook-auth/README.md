# Cuebook OAuth bridge for Hermes

This thin Hermes plugin adds one explicit `/cuebook-auth` command. It does not
implement MCP, copy Cuebook credentials, intercept natural-language messages,
or replace Hermes OAuth. The command calls the native Hermes Dashboard OAuth
API on `http://127.0.0.1:9119`, returns the server-generated Cuebook approval
URL to a private Telegram chat, and refreshes MCP Tool discovery after the
Dashboard reports approval.

The bridge deliberately fails closed:

- only Telegram direct messages may invoke the command;
- only the distribution channel's official Cuebook MCP origin is accepted;
- the authorization origin, path, PKCE fields, resource, and exact callback
  URI are validated before a URL is returned;
- Dashboard redirects and non-JSON responses are rejected;
- concurrent commands reuse one in-process OAuth flow;
- the Dashboard session secret and authorization URL are never logged.

The operator must inject the same URL-safe 256-bit
`HERMES_DASHBOARD_SESSION_TOKEN` into the Gateway and loopback Dashboard
processes. `HERMES_DASHBOARD_PUBLIC_URL` must be the HTTPS reverse-proxy base
that exposes only `/api/mcp/oauth/callback/cuebook`. Never expose port 9119.

See the canonical [Hermes installation guide](../../cuebook/platforms/hermes.md)
for setup, installation, and verification.
