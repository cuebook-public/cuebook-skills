---
name: route-cuebook-narrative
description: Classify a validated Cuebook cue into an event type, one or more market-reasoning lenses, a render shape, and explicit data requirements. Use after source-to-asset projection validation when a cue needs deterministic routing for finance or investment content. Do not approve publication, fetch live data, infer missing evidence, or write copy.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Route Cuebook Narrative

Route on orthogonal axes. Do not use one `lane` field to mix event semantics, reasoning, quality warnings, platform, and tone.

## Workflow

1. Require a cue plus a `GateV1` result from `validate-cuebook-projection`.
2. Stop with `abstain: true` when the gate is `reject`.
3. Run `scripts/route_narrative.py` for source-first classification.
4. Verify event type and reasoning lenses against `references/narrative-taxonomy.md`.
5. Return `RouteV1` from `references/route-v1.schema.json`.

## Routing Priority

Use attributable source text first, the cue title and mechanism second, and legacy `observable_type` or `category_tag` only as weak hints. A source saying "index inclusion" remains `mechanical-flow` even if the old cue tag says `analyst_action`.

Event type answers "what happened?". Reasoning lens answers "how can this change price?". Render shape answers "where should the human sentence begin?".

## Resources

- `references/narrative-taxonomy.md`: event, lens, shape, and context definitions.
- `references/route-v1.schema.json`: machine contract.
- `references/route-regression-cases.json`: local and production examples.
- `scripts/route_narrative.py`: deterministic router.
- `scripts/test_route_narrative.py`: regression runner.
