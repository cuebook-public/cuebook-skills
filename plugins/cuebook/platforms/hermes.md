# Cuebook on Hermes Agent

**Surface:** Three Agent Skills, one OAuth-authenticated HTTP MCP server, and
one thin Hermes OAuth bridge.

**Package status:** The public Skills are complete well-known bundles. The
Hermes plugin adds only the explicit `/cuebook-auth` command; it delegates the
entire MCP OAuth lifecycle to the native Hermes Dashboard and never implements
another MCP transport.

**Live status:** Hermes 0.19.1 source-pinned installation, Telegram DM command
registration, callback isolation, and the generated authorization link are
verified on the development channel. Cuebook App cold-start and background
HTTPS handoff are verified without approving the grant. Real-device Telegram
approval, token exchange, preview, and publication remain maintainer-only live
verification.

## Install the three Skills from one pinned source

Hermes 0.19.1 does not expose its internal source selector on `skills install`.
Even a `well-known:` identifier is tried against unrelated adapters first, so
the public CLI can wait on GitHub and emit a misleading 429 before reaching
Cuebook. `skills inspect` also downloads the complete bundle and makes the
subsequent install download it again. Do not use either path for this package.

Prepare this guide's distribution checkout. A repeated run accepts only the
same official remote, branch, and a clean worktree before fast-forwarding it;
any other existing path fails for explicit review. The same checkout supplies
the OAuth plugin later, so this is not a second package source:

```bash
set -eu
cuebook_skills_checkout="${HOME}/.hermes/plugin-sources/cuebook-skills-dev"
cuebook_skills_remote="https://github.com/cuebook-public/cuebook-skills.git"
cuebook_skills_branch="dev"
mkdir -p "${HOME}/.hermes/plugin-sources"
if [ -e "${cuebook_skills_checkout}" ]; then
  if [ -L "${cuebook_skills_checkout}" ] \
    || [ ! -d "${cuebook_skills_checkout}/.git" ] \
    || [ "$(git -C "${cuebook_skills_checkout}" remote get-url origin)" != "${cuebook_skills_remote}" ] \
    || [ "$(git -C "${cuebook_skills_checkout}" branch --show-current)" != "${cuebook_skills_branch}" ] \
    || [ -n "$(git -C "${cuebook_skills_checkout}" status --porcelain)" ]; then
    printf '%s\n' 'Existing Cuebook checkout does not match the clean official distribution branch.' >&2
    exit 1
  fi
  git -C "${cuebook_skills_checkout}" pull --ff-only origin "${cuebook_skills_branch}"
else
  git clone --depth 1 --branch "${cuebook_skills_branch}" \
    "${cuebook_skills_remote}" "${cuebook_skills_checkout}"
fi
if [ "$(git -C "${cuebook_skills_checkout}" rev-parse HEAD)" \
  != "$(git -C "${cuebook_skills_checkout}" rev-parse "origin/${cuebook_skills_branch}")" ]; then
  printf '%s\n' 'Cuebook checkout does not exactly match the official distribution branch.' >&2
  exit 1
fi
```

Run the Cuebook installer with the standard Hermes virtual-environment Python:

```bash
"${HOME}/.hermes/hermes-agent/venv/bin/python" \
  "${HOME}/.hermes/plugin-sources/cuebook-skills-dev/plugins/hermes/install_cuebook_skills.py"
```

The installer calls Hermes' existing native install pipeline with
`source_id="well-known"`, `force=False`, and the endpoint declared by this
checkout (`https://cuebook.xyz/.well-known/skills`). Quarantine, security scan,
lock provenance, complete file inventory, and release digest verification all
remain mandatory. If the Hermes interpreter or source-pinned API is absent,
the installer fails immediately; do not switch to the generic CLI, add a
GitHub token, retry, or use `--force`.

Confirm the resulting inventory after the installer reports all three names:

```bash
hermes skills list --source hub
```

Install exactly those three public bundles. Do not install
`plugins/cuebook/skills/`; those directories are on-demand implementation
modules, not public entrypoints. Do not replace a complete well-known bundle
with a direct `SKILL.md` URL because that single-file path omits its declared
resources.

## Configure MCP

Add Cuebook to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  cuebook:
    url: "https://cuebook.xyz/mcp"
    auth: oauth
    timeout: 20
    connect_timeout: 5
    supports_parallel_tool_calls: false
```

Keep exactly one enabled server named `cuebook`. OAuth credentials remain in
Hermes. Do not mark Cuebook safe for parallel MCP calls: reads may be batched
where the host permits, but upload, manifest, draft, prepare, and publish
mutations remain ordered and independently idempotent.

## Prepare the loopback Dashboard bridge

Run the Hermes Dashboard only on `127.0.0.1:9119`. Inject these exact variables
into both the Dashboard and Gateway processes from one protected environment
file or secret store:

```text
HERMES_DASHBOARD_SESSION_TOKEN=<one URL-safe 256-bit secret shared by both processes>
HERMES_DASHBOARD_PUBLIC_URL=https://hermes.example.com
```

Generate the shared secret with `python3 -c 'import secrets;
print(secrets.token_urlsafe(32))'`. Do not print it in service logs, put it in
Git, or send it to Cuebook.

The public HTTPS origin must reverse-proxy exactly this callback:

```text
/api/mcp/oauth/callback/cuebook -> http://127.0.0.1:9119
```

Keep every other Dashboard API route private, disable access logging for the
callback query string, and never expose port 9119. The callback is the only
public Dashboard route needed by this bridge. `HERMES_DASHBOARD_PUBLIC_URL`
must match the public origin exactly; the plugin rejects any authorization URL
whose `redirect_uri` differs.

## Install the Hermes OAuth plugin

Install the plugin from the exact checkout already used by the Skill
installer. This keeps the plugin and MCP endpoint on the same distribution
channel without another GitHub request:

```bash
hermes plugins install \
  "file://${HOME}/.hermes/plugin-sources/cuebook-skills-dev#plugins/hermes/cuebook-auth" \
  --enable
```

## Start the managed processes

The Dashboard is a foreground, long-lived process and its command does not
return. An AI installer must never invoke it inline and wait for completion.
After plugin installation, run the Dashboard under the same service supervisor
and environment as the Gateway. For a manual setup, the operator—not the
installer—runs `hermes dashboard --host 127.0.0.1 --port 9119 --skip-build
--no-open` in a separate terminal and keeps it running.

From the install terminal, verify the authenticated loopback management API
without printing the shared token:

```bash
curl --fail --silent --show-error \
  --header "X-Hermes-Session-Token: ${HERMES_DASHBOARD_SESSION_TOKEN:?not set}" \
  http://127.0.0.1:9119/api/mcp/servers \
  >/dev/null
```

Restart the Gateway after the Dashboard is ready, then verify registration:

```bash
hermes plugins list
```

## Authorize from Telegram

Send this explicit command in a private Telegram chat with the Hermes bot:

```text
/cuebook-auth
```

The command is handled directly by the plugin without an LLM turn. It is
rejected outside a Telegram direct message. Concurrent invocations reuse the
same active flow, and the plugin validates the official Cuebook origin, exact
`/mcp/authorize` path, PKCE parameters, resource, and callback before returning
the link.

On a phone with Cuebook installed, the HTTPS authorization link opens the
Cuebook app for confirmation. On desktop Telegram, the same link opens the
normal browser flow. After approval, the plugin asks the running Gateway to
rediscover MCP Tools. Return to Telegram and continue the conversation; do not
start a second login.

For a local CLI-only Hermes profile without Telegram, the native manual
fallback remains:

```bash
hermes mcp login cuebook
```

Do not run it while a `/cuebook-auth` flow is pending.

## Update

Use the stored well-known and Git provenance:

First rerun the distribution-checkout preparation block above. It verifies the
official remote, clean target branch, and exact remote commit before any file
is reused. Then run:

```bash
hermes skills check
hermes skills update query-cuebook
hermes skills update create-cuebook-content
hermes skills update author-cuebook-skill
hermes skills audit
hermes plugins install \
  "file://${HOME}/.hermes/plugin-sources/cuebook-skills-dev#plugins/hermes/cuebook-auth" \
  --force --enable
hermes skills list --source hub
```

Hermes 0.19.1 copies a repository subdirectory without its parent `.git`
directory, so `hermes plugins update cuebook-auth` cannot update this plugin.
The exact checkout is therefore pulled first and its subdirectory is
force-reinstalled. A compatible update does not replace
`~/.hermes/config.yaml` or its cached OAuth token. Restart the Gateway only
when the plugin changes. Stop for explicit review if an update declares a
major, permission, or capability-tier change.

## Verification

After the server rollout, run the shared [live verification gate](../INSTALL.md#live-verification-gate).
Retain one normal
`get_frame_capabilities` result, exercise one no-op Skills update check, and
preview a real idea before any explicit test publication.

## Official host references

- [Hermes MCP support](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)
- [Hermes Skills system](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
