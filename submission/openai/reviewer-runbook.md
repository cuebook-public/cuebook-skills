# Cuebook Reviewer Runbook

## Connection

- Production MCP URL: `https://cuebook.xyz/mcp`
- Authentication: OAuth 2.1, PKCE, and dynamic client registration
- Domain challenge: `https://cuebook.xyz/.well-known/openai-apps-challenge`
- Demo username and password: supplied only through the OpenAI submission portal
- MFA, email confirmation, SMS confirmation, VPN, and private-network access: not required

On the Cuebook authorization page, use **Official reviewer access** with the portal credentials. The credential lane is enabled only for the review window, is rate-limited, accepts same-origin form posts only, stores a password digest rather than a plaintext password, and mints the same first-party session used by normal Cuebook accounts.

The demo account contains sample market context and may create public Frames and private simulated Paper Trades. It cannot place a real-money order, transfer funds, or access an exchange account.

## Review Order

1. Connect and approve the six clearly described Cuebook scopes once.
2. Run the five positive cases in `test-cases.json` in order.
3. Run the three negative cases and confirm that no prohibited action occurs.
4. Disconnect Cuebook and confirm that later private calls require authorization again.

Publishing a review Frame is allowed from the demo account. Use an obvious test title and withdraw it after the review if desired. Withdrawal requires separate first-party confirmation; initial publication and correction use the active publish grant and the user's explicit action.

## Product Boundaries

- Cuebook is pre-trade research, expression, and simulation infrastructure.
- Market values are persisted snapshots, not a live execution feed.
- Paper Trades are virtual and never reach a broker, exchange, wallet, or real-money venue.
- A creator sees and confirms the exact title, body, direction, deadline, settlement rule, and visual intent before rendering or publication.
- One Frame contains one title, one reasoned body, one 2488 by 1056 publication image, and alt text.
- Cuebook MCP never returns image bytes or OAuth credentials through Tool responses.

## Support

Email `info@cuebook.app` and include the visible error, client name, and approximate timestamp. Do not send tokens, authorization codes, passwords, wallet recovery material, or private keys.
