# Cuebook Skills

Official Cuebook skill and plugin distribution for Codex.

Cuebook exposes two public entrypoints:

- `query-cuebook` reads source-linked market intelligence without writing.
- `create-cuebook-content` turns a creator's trading idea into sourced text,
  static visuals, and optional settlement artifacts.

The repository currently packages 39 modular skills behind those two
entrypoints. Create may call Query; Query never calls Create.

## Install

After a release tag is available:

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --ref <release-tag> \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook
```

Start a new Codex task after installation so the plugin skills and Cuebook MCP
server are loaded.

## Repository Layout

```text
.agents/plugins/marketplace.json  Marketplace entry
plugins/cuebook/                  Cuebook plugin package
plugins/cuebook/skills/           Query and creation skills
plugins/cuebook/assets/           Module, menu, and capability contracts
plugins/cuebook/scripts/          Package validators
```

## Validate

```bash
python3 plugins/cuebook/scripts/validate_cuebook_plugin.py plugins/cuebook

PYTHONDONTWRITEBYTECODE=1 python3 -m pytest \
  -p no:cacheprovider \
  plugins/cuebook
```

Do not commit API keys, OAuth tokens, credentials, generated user output, or
font files. Authentication remains in the Cuebook MCP connector.
