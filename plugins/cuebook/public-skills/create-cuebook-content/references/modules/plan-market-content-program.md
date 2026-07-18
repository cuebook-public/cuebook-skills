<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/plan-market-content-program/` from the public Skill directory.
# Plan Market Content Program

Turn an editorial objective and bounded source set into a channel-independent program. Model meaning and dependencies first; leave prose, assets, exact release operations, and external side effects to downstream skills.

## Workflow

1. Normalize objective, recipe ref/revision, selected opportunity refs, audience, language, content class, planning horizon, source/research/thesis references, requested outputs, and exclusions. Preserve each candidate's lifecycle, expiry, evidence state, disclosure requirements, and the recipe's plating choices. For `TradingThesisV1`, preserve thesis ID, revision, cutoff, canonical hash, resolution window, and disclosure state.
2. Choose one topology from `references/modules/plan-market-content-program/references/planning-patterns.md`: `single`, `anchor_and_derivatives`, `serial`, `event_lifecycle`, `community_loop`, or `evergreen_series`.
3. Define one editorial job per item. Examples: establish the event, explain a mechanism, test a countercase, invite primary evidence, answer a recurring question, or recap what changed.
4. Assign platform, format, temporal mode, target context, source scope, renderer capability (`compact_text`, `structured_media`, or `manual_authoring`), asset jobs, and interaction job. Treat a subreddit or named community as part of the target context.
5. Add parent and dependency edges. Preserve semantic facts across derivatives but require original wording and native composition for each channel. A frozen thesis is the semantic anchor: channel items may omit detail for fit, but may not change its claim, direction, probability, invalidation, or resolution criteria.
6. Choose a release strategy separately from the topology. Use relative order or event triggers here; exact account, time, approval, and execution mode belong to `references/modules/prepare-market-content-release.md`.
7. Define measurement questions and fixed observation windows. Separate content quality, distribution, audience response, and any later market outcome.
8. Return `ContentProgramV1` and validate it:

```bash
node references/modules/plan-market-content-program/scripts/validate_content_program.mjs content-program-v1.json
```

## Inputs

- Objective and intended reader or community.
- Stable source references or an upstream research artifact. References may be IDs, paths, or URLs; do not invent their contents.
- Optional `ContentOpportunitySetV1`; use only selected candidates and preserve their reason codes, research gaps, lifecycle, and expiry.
- Optional `ContentRecipeV1`; treat its outputs, bundle strategy, flavor references, and selected optional skills as bounded planning intent. Do not silently add destinations the user did not select.
- Optional `TradingThesisV1`; use only `ready` or `frozen` declarations. Record its versioned ref in every derived item and require outcome/update jobs to point back to the original declaration.
- Requested or excluded platforms.
- Optional horizon, event expiry, cadence, and asset constraints.
- Optional `MediaFormatV1` or `ProfileV1` rule IDs. Apply them downstream; this skill records planning intent only.

## Hard Boundaries

- Do not fetch, infer, or rewrite source facts. Record only source references and editorial jobs.
- Do not draft headlines, hooks, captions, scripts, replies, or calls to action.
- Do not promise reach, virality, conversion, or best posting time from generic benchmarks.
- Do not cross-post identical wording. `wording_reuse_allowed` remains false.
- Do not use `synchronized` release for items that depend on one another.
- Do not plan repeated promotion into multiple communities as a growth tactic.
- Do not treat comments, votes, views, or follower count as evidence quality.
- Do not include accounts, credentials, API modes, exact schedule timestamps, or approval state. Those belong to the release layer.

## Output

Return `ContentProgramV1` using `references/modules/plan-market-content-program/references/content-program-v1.schema.json`. Each item must have a stable ID, one editorial job, bounded source references, a native renderer, and explicit dependencies.

Route downstream by renderer capability:

- `compact_text`: `references/modules/render-cuebook-market-post.md` for X, Telegram, simple Xiaohongshu text, or a buy-side note.
- `structured_media`: `references/modules/render-cuebook-market-media.md` for owned-web long-form, Reddit, Xiaohongshu carousel, or short video.
- `manual_authoring`: keep a human-authored or unsupported destination outside AI rendering.

After all channel artifacts are final, call `references/modules/prepare-market-content-release.md`. This skill never marks content published.

## Resources

- `references/modules/plan-market-content-program/references/planning-patterns.md`: topology, release-strategy, and measurement patterns.
- `references/modules/plan-market-content-program/references/content-program-v1.schema.json`: output contract.
- `references/modules/plan-market-content-program/scripts/validate_content_program.mjs`: deterministic graph and boundary validator.
