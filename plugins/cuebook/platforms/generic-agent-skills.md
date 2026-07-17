# Cuebook on generic Agent Skills clients — Planned

## Use the built bundles, not this source tree

This source tree is a plugin: its skills reference shared plugin assets
(`../../assets/...`) and invoke each other with `$skill-name`. A generic
client that copies one skill directory out of here will break those
references, and a client that loads all skill directories will pay startup
metadata cost for internal capabilities it should never trigger directly.

Build the self-contained public bundles instead:

```bash
node plugins/cuebook/scripts/build_release_skills.mjs plugins/cuebook <output-dir>
```

The builder packages each public entrypoint (from
`assets/plugin-index-v1.json`) as one spec-conformant skill directory:
shared assets are copied inside, internal skills land under
`references/skills/`, and every `$skill-name` or `../../assets` reference is
rewritten to a bundle-relative path. Only these bundles belong in
`.agents/skills/`.

## Install and discovery

Copy each built bundle into the client's skill directory (commonly
project-level or user-level `.agents/skills/`). Discovery follows the
[Agent Skills spec](https://agentskills.io/specification): name + description
at startup, body on activation, resources on demand.

## MCP configuration and auth

The bundles assume a connected Cuebook MCP server; configure it through the
client's native MCP mechanism. Without it, query and verification steps
report unavailable capabilities instead of inventing values.

## Runtime dependencies

Declared per skill in `compatibility` frontmatter: Node.js 18+ everywhere,
with Playwright and local Chromium additionally required for visual capture
and audit paths.

## Write operations

Writes happen only through explicit Cuebook MCP write tools. A client without
those tools gets read-only behavior.

## Known limitations

- Untested on any specific generic client; format conformance is validated,
  behavior is not.
- Skill-to-skill orchestration depth inside one bundle depends on the
  client's ability to follow bundled reference files.

## Smoke test

After building, validate each bundle with the official reference tool:

```bash
skills-ref validate <output-dir>/query-cuebook
skills-ref validate <output-dir>/create-cuebook-content
```

Then confirm no `../../` or unresolved `$skill-name` references remain:
the builder's own test suite (`tests/build_release_skills.test.mjs`) checks
both.
