# Cuebook Skills

Official Cuebook skill and plugin distribution for Codex.

Cuebook exposes two public entrypoints:

- `query-cuebook` reads source-linked market intelligence without writing.
- `create-cuebook-content` turns a creator's trading idea into one fast Frame
  preview by default. It reflects the distinctive idea and asks one optional,
  adaptive heuristic question before any price question, then continues
  immediately when skipped. It generates three alternatives only when
  explicitly requested. Every Frame exposes one title, one concise body, and
  one image. Price, trend, relative-strength, volume, and dated-horizon views
  use a sourced Cuebook market chart; qualitative mechanisms use a logic card.
  The observed history window stays separate from the creator's future horizon.
  Current evidence is Cuebook-first, with one bounded authorized Web fallback
  only when Cuebook leaves a material gap.

The repository keeps 38 source modules behind those two entrypoints
(including the `intake-cuebook-viewpoint` conversational front door that
completes and verifies a fresh viewpoint before creation). Create may call
Query; Query never calls Create. Codex discovers exactly the two public
entrypoints. Internal modules are ordinary `references/modules/*.md` files
loaded on demand, not recursively discoverable Skills.

## Platform Support

| Platform | Status |
| --- | --- |
| Codex (plugin) | Tested |
| Claude Code (plugin) | Planned |
| Generic `.agents/skills` clients | Planned — use the self-contained bundles in `skills/` |
| Other Agent Skills clients | Unverified |

Per-platform install, MCP configuration, dependency, and smoke-test notes
live in `plugins/cuebook/platforms/`.

## Install

Install the current release:

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --ref v0.2.5 \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook
```

Start a new Codex task after installation so the plugin skills and Cuebook MCP
server are loaded.

## Repository Layout

```text
.agents/plugins/marketplace.json  Marketplace entry
plugins/cuebook/                  Cuebook plugin package (source of truth: cuebook-mcp)
plugins/cuebook/skills/           Canonical source modules (development only)
plugins/cuebook/public-skills/    Two generated Codex public Skills
plugins/cuebook/assets/           Module, menu, and capability contracts
plugins/cuebook/scripts/          Package validators and release bundler
skills/                           Self-contained public bundles for generic
                                  Agent Skills clients (built artifacts;
                                  regenerate with build_release_skills.mjs,
                                  do not edit by hand)
```

This repository is a build artifact. Source lives in the internal
`cuebook-mcp` repository; edit there and re-run
`npm run build:release`
before tagging a release.

## Validate

```bash
npm ci
npm run validate
npm test
npm run build:release
git diff --exit-code -- skills plugins/cuebook/public-skills
```

`validate` checks both the Query/Create package boundary and every local file
or `$skill-name` reference. CI also rejects tracked Python runtime files and
requires the generated public bundles to match their plugin source.
Do not mirror the Cuebook source modules into `~/.codex/skills`; install the
plugin or only the two built public bundles.

Do not commit API keys, OAuth tokens, credentials, generated user output, or
font files. Authentication remains in the Cuebook MCP connector.
