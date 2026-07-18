<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/assemble-cuebook-publish-candidates/` from the public Skill directory.
# Assemble Cuebook Publish Candidates

Freeze one already selected Frame by default. Assemble three finished choices only for an explicit three-alternative request. Every retained choice has one creator-facing projection: `frame.title`, `frame.body`, and `frame.image_ref`; attach `alt_text` to the image. Keep copy splits, evidence anchors, settlement state, disclosures, labels, scores, and calibration backstage.

## Workflow

1. Accept a selected `FramePreviewV1` or an explicit three-candidate expression plan. Preserve creator ownership, direction, horizon, claim, mechanism, caveat, query result refs, and image pairing.
2. Read `references/modules/assemble-cuebook-publish-candidates/references/autonomous-calibration-policy.md`. Resolve volatile facts and source conflicts through their owning Query artifacts. Do not run new research merely to recreate facts already bound to the preview.
3. For one selected preview, preserve its exact title, body, publication image, alt text, and image hash; materialize only the canonical artifacts required for release lineage. Do not generate sibling drafts.
4. For an explicit three-alternative request, invoke `references/modules/render-cuebook-market-post.md` once in batch mode. Generate `conviction`, `evidence`, and `catalyst` or `mechanism` siblings from one meaning lock and one fact ledger. Retry only a failed sibling.
5. Enforce the Frame budget: headline at most 32 visible characters, body at most 220, close at most 56, no more than four short paragraphs, no more than three hard numbers, and at most 300 visible characters including hidden tags.
6. Require one selected release-grade `VisualDirectionSetV1` direction for the normal freeze path, or three passed directions for explicit alternatives. Full and compact derivatives, capture reports, render audits, and production fonts are required only for retained release directions.
7. Bind one optional `SettlementClaimV1` across every retained candidate. Copy variation cannot change subject, direction, baseline, metric, operator, threshold, deadline, session, or authoritative source. Keep it `needs_confirmation` until the user confirms every field.
8. Build `candidate.frame` deterministically: `title = copy.headline`, `body = trim(copy.body) + "\n\n" + trim(copy.close)`, `image_ref = visual.preview_ref`, and `alt_text = visual.alt_text`.
9. A sole confirmed preview returns `PublishCandidateSetV1` in `selected` with `generation_policy.candidate_count: 1`. Three unselected alternatives return `ready_for_selection` with `candidate_count: 3`. Selection remains an atomic copy-to-visual confirmation.
10. Validate with `references/modules/assemble-cuebook-publish-candidates/scripts/validate_publish_candidate_set.mjs`, including `--asset-root` for local release derivatives.

```bash
node references/modules/assemble-cuebook-publish-candidates/scripts/validate_publish_candidate_set.mjs publish-candidate-set-v1.json --asset-root ./output
```

## Rules

- Default to one selected candidate supplied by `FramePreviewV1`. Generate three only when the creator explicitly requested alternatives.
- Return `blocked` with zero candidates only when no source-faithful public output survives.
- Calibrate shared facts once. Reuse compatible source, policy, instrument, and market snapshots while fresh.
- Keep the creator-owned viewpoint as the decision anchor. Evidence may strengthen, connect, narrow, or condition it; a material contradiction requires creator review.
- Do not display research notes, source counts, workflow state, labels, tags, evidence links, settlement panels, disclosures, scores, or platform names beside the Frame.
- No retained candidate may require a follow-up rewrite. Retry only the failed retained branch.
- When three were requested, vary rhetorical entry and spatial composition without changing meaning.
- After return or selection, the conversational handoff may name one strength in the idea, state what Cuebook concretely supported, and suggest one next observation outside `candidate.frame`.

## Output

Return `PublishCandidateSetV1` from `references/modules/assemble-cuebook-publish-candidates/references/publish-candidate-set-v1.schema.json`.
