# Cuebook on OpenClaw

**Surface:** One compatible bundle with three Agent Skills and an OAuth-authenticated Streamable HTTP MCP server.

**Package status:** `plugins/runtime/cuebook/` is a sanitized Codex-compatible bundle. It contains both host manifests, exactly three generated public Skills, and one remote MCP descriptor. OpenClaw 2026.7.1-2 local-directory installation and the host-owned MCP configuration below were statically verified on 2026-07-30.

**Live status:** Marketplace installation, OAuth, Tool probe, preview, update, and publication are pending host verification.

## Install the compatible bundle

Inspect the repository marketplace, then install Cuebook through OpenClaw's
Claude-marketplace compatibility lane:

```bash
openclaw plugins marketplace list cuebook-public/cuebook-skills
openclaw plugins install cuebook \
  --marketplace cuebook-public/cuebook-skills
openclaw plugins inspect cuebook --json
openclaw skills list --json
```

The marketplace entry must resolve to `./plugins/runtime/cuebook`, not the repository
root. Inspection must report `Format: bundle`, the Codex bundle subtype, the
`skills` and `mcpServers` bundle capabilities, and one MCP descriptor named
`cuebook`. The Skill inventory must contain the three eligible Cuebook Skills:
`query-cuebook`, `create-cuebook-content`, and `author-cuebook-skill`.

For a local source review, clone the repository and point the installer at the
same canonical directory:

```bash
git clone https://github.com/cuebook-public/cuebook-skills.git
openclaw plugins install ./cuebook-skills/plugins/runtime/cuebook
openclaw plugins inspect cuebook --json
openclaw skills list --json
```

Do not install the repository root and do not copy the three Skills manually.
The root is a marketplace container, while `plugins/runtime/cuebook/` is the portable
bundle. Never point discovery at `plugins/cuebook/skills/`; those are internal
on-demand modules.

## Configure MCP and OAuth

Bundle discovery proves that the MCP descriptor shipped; it is not runtime
readiness. Current OpenClaw releases may report the Codex `type: "http"`
descriptor as an unsupported or incomplete bundle transport. Save one
host-owned definition under the same stable `cuebook` key so OpenClaw uses
Streamable HTTP and retains credentials independently of package updates:

```bash
openclaw mcp set cuebook \
  '{"url":"https://cuebook.xyz/mcp","transport":"streamable-http","auth":"oauth","requestTimeoutMs":20000,"connectionTimeoutMs":5000,"supportsParallelToolCalls":false}'

openclaw mcp status --verbose
openclaw mcp login cuebook
```

OpenClaw prints an authorization URL. When the callback cannot reach the
terminal directly, finish the same pending attempt with:

```bash
openclaw mcp login cuebook --code <returned-code>
```

Do not create a second server alias, add a static Authorization header, or
enable parallel Tool calls for the ordered Frame mutation path. Do not restart
login while a browser approval or code exchange is pending.

## Reload and update

After initial installation or a version-changing update, restart the gateway
and begin one new session:

```bash
openclaw gateway restart
```

For an ordinary compatible update:

```bash
openclaw plugins update cuebook --dry-run
openclaw plugins update cuebook
openclaw plugins inspect cuebook --json
openclaw gateway restart
```

That path applies to the tracked marketplace installation. OpenClaw deliberately
skips `plugins update` for a local-path source. For the local review install,
update the checkout explicitly, then refresh the reviewed directory:

```bash
openclaw plugins install ./cuebook-skills/plugins/runtime/cuebook --force
openclaw plugins inspect cuebook --json
openclaw gateway restart
```

The tracked marketplace source and the host-owned OAuth credential survive the
update. Do not repeat login unless `openclaw mcp status --verbose` reports
`authorization-required`, a scope step-up is required, or the grant was
revoked. `openclaw mcp reload` refreshes only the current CLI process; it does
not replace `openclaw gateway restart` for an already-running gateway.

## Verification

After the server rollout, require a live probe:

```bash
openclaw mcp doctor cuebook --probe
```

Then run the rest of the shared [live verification gate](../INSTALL.md#live-verification-gate). A static `status` result, bundle inspection, or visible Tool list is useful diagnostics but does not replace the probe and a normal `get_frame_capabilities` result.

## Official host references

- [OpenClaw compatible plugin bundles](https://docs.openclaw.ai/plugins/bundles)
- [OpenClaw Plugin commands](https://docs.openclaw.ai/cli/plugins)
- [OpenClaw MCP commands](https://docs.openclaw.ai/cli/mcp)
