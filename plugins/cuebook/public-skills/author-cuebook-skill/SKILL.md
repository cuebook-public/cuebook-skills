---
name: author-cuebook-skill
description: "Package and submit the creator's own agent skill to the Cuebook community skill marketplace for review. Use only on an explicit request to publish, submit, or share a skill they authored to Cuebook. Collect the package (one SKILL.md plus references markdown or JSON, no scripts, 512 KiB cap), run the structural pre-check, confirm one manifest card (slug, display name, summary, declared capability tier, license) with the creator, then walk the signed upload contract: begin_skill_publish, HTTP PUT, complete_skill_publish. Every receipt reads submitted for review — listing happens only after Cuebook's byte-level review pipeline and, for write-capable skills, human review approve and distribute it. Never describe a submission as published or live, never submit without the confirmed card, at most one submission per task, and require the creator's Cuebook handle to exist before beginning."
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: "Requires a connected Cuebook MCP server with the cuebook.community.publish consent (one-time per-user step-up). Degrades honestly: without the scope, explain the step-up and stop."
---

# Author Cuebook Skill

Be the conversational front door for community skill submission. A creator who has written their own agent skill brings it here; this Skill collects the package, checks its structure locally, confirms one manifest card, and walks the signed upload contract. The platform reviews the exact bytes that were uploaded: what a reviewer approves is exactly what installs. Nothing this Skill does makes a package public.

## Cuebook Context

Stay in Cuebook unless the creator explicitly asks for another Skill. Keep routing backstage.

Browsing already-published community skills is a read: `list_community_skills` for the catalog or one creator's set, `get_community_skill` for one entry by handle and slug. Use them here only to check slug availability or show the creator a published example on request.

## Package Contract

A submission is one zip archive with a fixed shape. Check it locally before any tool call; the server enforces the same rules byte-for-byte and rejects violations.

- Exactly one `SKILL.md` at the archive root. It is the skill's entire instruction surface.
- Every other file lives under `references/` and ends in `.md` or `.json`. Nothing else ships: no scripts, no binaries, no images, no hidden files.
- At most 40 files. The zip stays at or under 512 KiB (524,288 bytes).
- Paths are plain relative paths. Duplicate paths, `..` segments, absolute paths, backslashes, and names that collide when case-folded are all rejected server-side; catch them in the pre-check instead of burning a submission.

Run the structural pre-check with `scripts/validate_community_skill_submission.mjs` against `references/community-skill-submission-v1.schema.json` before showing the manifest card. A failing pre-check ends the walk with the exact failures listed; never "fix" a creator's package silently — report what would be rejected and let them change it.

## Capability Tiers

The manifest declares what the skill's text can cause. The declaration is graded server-side against the actual package text; under-declaring is rejected by the grader as `UNDECLARED_CAPABILITY`.

- **t0** — pure prompt. The text references no Cuebook tools at all.
- **t1** — the text references read tools only.
- **t2** — the text instructs ANY state-changing action: paper trading, memory proposals, frame publication, or anything else that writes — even by paraphrase, and even when the writing is routed through official Cuebook skills rather than named tools.

When unsure between tiers, declare t2. A t2 package must show every write action to the user and wait for explicit consent before acting, must never batch or loop writes, and follows the proposal discipline: at most one memory proposal per task, and it never claims something was saved or published. If the creator's text does not honor that discipline, say so plainly before submission — the review pipeline will hold it to the same standard.

## Manifest Card

Before any submission tool call, show the creator one card and wait for explicit confirmation. The card contains:

- **slug** — lowercase kebab-case, 3-40 characters, never a double hyphen. This is the install identity under the creator's handle; it cannot be reused casually later.
- **display_name** — the human name for the listing.
- **summary** — at most 280 characters; what the listing shows first.
- **description** — at most 1024 characters; the full listing description.
- **version** — semver (`MAJOR.MINOR.PATCH`). Resubmissions after rejection use a new version.
- **declared_tier** — t0, t1, or t2, with one line of reasoning for why that tier is right.
- **license** — one of `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC0-1.0`, `MIT`. The creator chooses; never default it.

An edit to any field reprints the card. Only an explicit confirmation of the exact card advances to submission. The creator's Cuebook handle must already exist — the listing will carry it — so if the account is missing, stop and say what to set up first; do not improvise an identity.

## Submission Walk

One confirmed card, one submission, in order:

1. Compute the sha256 and exact byte size of the final zip. These freeze the package: the reservation is bound to them.
2. Call `begin_skill_publish` with the manifest identity, the sha256, the byte size, and a fresh UUIDv7 `idempotency_key`. The result carries a signed `upload_url`.
3. HTTP PUT the zip bytes to `upload_url` with content-type `application/zip`. Upload exactly the hashed bytes; any drift fails the completion step.
4. Call `complete_skill_publish` with the confirmed manifest. The server verifies the uploaded bytes against the reservation and lands an append-only version awaiting review.

Surface errors honestly, in the creator's language:

- A quota error means the daily submission cap is reached. Say so and stop; do not retry or queue.
- A `forbidden_scope` error means the creator has not completed the one-time `cuebook.community.publish` consent step-up. Explain that the step-up happens in Cuebook, then stop. Never work around a missing scope.
- A hash or size mismatch means the local package changed after the reservation. Re-run the pre-check and start a fresh submission only if the creator confirms the new bytes.

At most one submission per task. A failed step is reported, not silently retried into a second reservation.

## Receipt Discipline

The only truthful wording for a successful walk is **submitted for review**. Never say published, live, listed, approved, or available.

Tell the creator what happens next, once, plainly: automated gates check structure, normalization, capability grading, and content policy; write-capable (t2) skills additionally pass human review; approved skills are then distributed by bot to `github.com/cuebook-public/cuebook-community-skills`, where anyone can install them through the plugin marketplace, and the listing carries the creator's handle.

## Honest Limits

- No promises about review time or approval odds. "Submitted for review" is the end of what this Skill knows.
- A rejected submission can be revised and resubmitted as a new version; the walk starts over with a fresh pre-check and card.
- Delisting and takedown are platform actions inside Cuebook, not operations of this Skill.
- This Skill never edits the creator's package content, never invents manifest fields, and never submits on inference. Explicit request in, confirmed card through, one submission out.

## Output

Validate the assembled submission record against `references/community-skill-submission-v1.schema.json`:

```bash
node scripts/validate_community_skill_submission.mjs community-skill-submission-v1.json
```

The record freezes the file listing, zip hash and size, the confirmed manifest card, and the confirmation state. A record whose `card_confirmed` is false never reaches `begin_skill_publish`.
