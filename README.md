# Cuebook Skills

Cuebook turns market information and trading intuition into something people can understand, remember, and revisit.

This repository distributes two public skills for Codex:

- `query-cuebook` searches and explains source-linked Cuebook intelligence without writing anything.
- `create-cuebook-content` turns a creator's market idea into one Frame: a sharp title, concise body, and one mobile-first editorial image.

Create may use Query for evidence. Query never calls Create and never writes.

## What A Frame Looks Like

The complete public artifact is deliberately small:

```json
{
  "title": "BTC 的抗跌，正在变成下一次上冲的起点",
  "body": "同期 BTC 相对美股代理更强……未来 30 天先看韧性是否延续。",
  "image_ref": ".../viewpoint-622.png",
  "alt_text": "一张展示历史相对强弱、观点日边界和未来检查点的图。"
}
```

Users do not receive workflow state, schema versions, candidate ids, evidence bundles, hashes, scopes, upload progress, receipts, consent fields, or backend enums. Those remain available internally for verification and publication safety.

## Creation Experience

The Skill preserves the creator's viewpoint and may ask one optional, high-leverage interview question before it retrieves data. Skipping the question moves directly into creation.

Cuebook evidence supports the observed part of the argument. The creator still owns the interpretation and mechanism. Future time is expressed through checkpoints, catalysts, branches, confirmation, and invalidation—never a fabricated future price path.

The image system selects the idea relationship before the layout. It can express:

- price and indexed curves;
- relative strength and spread;
- drawdown and recovery;
- rolling correlation;
- event windows and thresholds;
- causal paths, evidence tension, and conditional scenarios;
- transparent Creator Lenses and long/short contribution views.

Every preview includes a detailed 2488 × 1056 publication image and an independently composed 622 × 264 mobile image. The mobile image is not a downscale: it uses one dominant geometry, at most two essential copy groups, and a phone-readable hierarchy. Re-renders keep the facts fixed while changing a truthful reading path, silhouette, typography, material, or emphasis.

## Install

Install the current release:

```bash
codex plugin marketplace add cuebook-public/cuebook-skills \
  --ref v0.4.0 \
  --sparse .agents/plugins \
  --sparse plugins/cuebook

codex plugin add cuebook@cuebook
```

Start a new Codex task after installation so the plugin skills and Cuebook MCP connector are loaded.

Do not copy the Cuebook source tree into `~/.codex/skills`. Codex should discover exactly the two public entrypoints; internal modules are bundled as on-demand references.

## Repository Layout

```text
.agents/plugins/marketplace.json  Marketplace entry
plugins/cuebook/                  Plugin package and canonical Skill sources
plugins/cuebook/skills/           Development modules
plugins/cuebook/public-skills/    Generated Codex public bundles
plugins/cuebook/assets/           Internal catalog and capability contracts
plugins/cuebook/scripts/          Validators and release builder
skills/                           Generated self-contained Agent Skills bundles
```

Public skill, runner, and reference names describe their purpose rather than a generation number. Frozen backend wire schemas may retain explicit versions internally for compatibility; those names are not part of the creator-facing product.

## Develop And Validate

Generated bundles must come from the canonical plugin sources. Do not edit `skills/` or `plugins/cuebook/public-skills/` by hand.

```bash
npm ci
npm run build:release
npm run validate
npm run test:ci
git diff --exit-code -- skills plugins/cuebook/public-skills
```

Validation checks the two-entrypoint boundary, referenced-resource closure, mobile preview context budget, schema correctness, rendering gates, and generated bundle parity. CI also rejects tracked Python runtime files.

Never commit API keys, OAuth tokens, credentials, mutable user output, or font files. Authentication stays in the Cuebook connector.
