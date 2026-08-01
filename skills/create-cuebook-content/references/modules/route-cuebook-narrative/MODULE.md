<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/route-cuebook-narrative/` from the public Skill directory.
# Route Cuebook Narrative

Route on orthogonal axes. Do not use one `lane` field to mix event semantics, reasoning, quality warnings, platform, and tone.

## Workflow

1. Require a cue plus a `GateV1` result from `validate-cuebook-projection`.
2. Stop with `abstain: true` when the gate is `reject`.
3. Run `references/modules/route-cuebook-narrative/scripts/route_narrative.mjs` for source-first classification.
4. Verify event type and reasoning lenses against `references/modules/route-cuebook-narrative/references/narrative-taxonomy.md`.
5. Return `RouteV1` from `references/modules/route-cuebook-narrative/references/route-v1.schema.json`.

## Routing Priority

Use attributable source text first, the cue title and mechanism second, and legacy `observable_type` or `category_tag` only as weak hints. A source saying "index inclusion" remains `mechanical-flow` even if the old cue tag says `analyst_action`.

Event type answers "what happened?". Reasoning lens answers "how can this change price?". Render shape answers "where should the human sentence begin?".

## Resources

- `references/modules/route-cuebook-narrative/references/narrative-taxonomy.md`: event, lens, shape, and context definitions.
- `references/modules/route-cuebook-narrative/references/route-v1.schema.json`: machine contract.
- `references/modules/route-cuebook-narrative/references/route-regression-cases.json`: local and production examples.
- `references/modules/route-cuebook-narrative/scripts/route_narrative.mjs`: deterministic router.
