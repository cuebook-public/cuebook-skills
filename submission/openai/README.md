# OpenAI Plugins Directory Submission

This directory is the source-controlled, secret-free review packet for Cuebook's official OpenAI Plugins Directory submission. Portal credentials and the portal-issued domain token never enter Git.

## Build

```bash
npm run submission:check
npm run submission:prepare
```

The prepare command validates the Cuebook Plugin, verifies exactly five positive and three negative reviewer cases, confirms that exactly two public `SKILL.md` entrypoints are discoverable, and writes:

- `dist/openai-submission/cuebook-skills-<version>.zip` — the final two-Skill upload bundle;
- `dist/openai-submission/submission-manifest.json` — file and archive SHA-256 digests;
- copies of the listing, test cases, annotation rationale, reviewer runbook, release notes, and logo for portal entry.

The archive contains only `query-cuebook` and `create-cuebook-content`. Their internal modules remain ordinary references rather than recursively discoverable Skills.

## Portal-Only Values

The official portal supplies the domain challenge token. Install it as `OPENAI_APPS_CHALLENGE_TOKEN` on the production host and verify the exact response at `/.well-known/openai-apps-challenge`.

Create one dedicated demo user with representative sample data. Generate a high-entropy reviewer password, store only its lowercase SHA-256 digest as `OPENAI_PLUGIN_REVIEW_PASSWORD_SHA256`, and configure the matching username and user id on the production host. Deliver the username and plaintext password only through the portal. Disable reviewer login after the review window.

Identity verification, Apps Management Write permission, country selection, the portal challenge, and the final Submit action are account-level operations and cannot be encoded in this repository.
