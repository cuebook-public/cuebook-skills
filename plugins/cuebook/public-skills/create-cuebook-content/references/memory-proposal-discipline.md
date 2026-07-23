# Memory Proposal Discipline

Read this reference only at the very end of a creation task, and only when one of two things is true: the creator explicitly asked to remember something, or a published Frame / committed paper plan surfaced ONE insight sharp enough that the creator would want it next time. Ordinary tasks end without any memory write; reading memory belongs to the Query side's Decision Memory Coach.

## Hard rules

1. At most ONE `propose_memory` call per task. Never batch, never loop, never propose "while we're at it".
2. Requires the `cuebook.memory.read` + `cuebook.memory.propose` scopes (one-time consent step-up handled by the host). On an authorization error, mention the one-time permission naturally and finish the task without the proposal.
3. Every proposal lands as an unconfirmed CANDIDATE. Say "I proposed this for your review in Cuebook" — never "I remembered this" or "saved".
4. Existing memories cannot be modified, replaced, or deleted from here, and their absence cannot be inferred from a duplicate outcome.
5. The summary is one plain sentence in the creator's own framing (≤1000 chars, no markdown blocks, no instructions, no secrets, no chat transcript).
6. Scope uses locators the server can resolve: canonical tickers must come from `search_assets` results, never guessed. Unresolvable locators fail closed — fix the ticker or drop the qualifier; never substitute a proxy silently.
7. `source_refs` use the EXACT provenance grammar the server enforces: `cuebook://decision/episodes/{id}` (an episode belonging to the creator) or `cuebook://frames/{id}` (the creator's own, or a public one) — real UUID v7 row ids only. Aliases like `/previous`, interest/tagore projections, and every other namespace are rejected at propose time. A proposal grounded only in this conversation uses one bounded `client_attestation` instead; when a ref is rejected, fall back to the attestation rather than inventing another ref.
8. `client_observed_user_intent` is honest telemetry: `explicit` only when the creator literally asked to remember; otherwise `inferred`.
9. Respect the outcome: `duplicate` means it already exists (do not re-propose a paraphrase); `rejected_cooldown` means the user previously declined this claim (drop it silently — never argue it back in).
10. `idempotency_key` is a UUID v7 (time-ordered). Common v4 generators (`uuidgen`, `crypto.randomUUID`) produce ids the contract rejects.

Validate before calling:

```bash
node scripts/validate_memory_proposal.mjs memory-proposal-v1.json
```

## What qualifies as a proposable insight

- A preference or constraint the creator stated in their own words ("always check inventory cycles before valuation");
- A thinking anchor that shaped THIS published viewpoint and is scoped (asset, sector, strategy, or horizon), not a market prediction;
- Never: P&L reactions, personality conclusions, one-off outcomes generalized into habits, market facts, or anything the creator did not express or clearly enact.
