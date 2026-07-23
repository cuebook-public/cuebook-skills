# Decision Memory Coach

Read this module only when the creator explicitly asks about their own past decisions, execution, results, saved preferences or thinking anchors, or how Cuebook sees them as a decision maker. It is an internal composition module behind the existing public entrances — never a third entry point, never a silent default, and never a reason to read personal memory during an ordinary market question.

## Authorization

- The memory surface uses two dedicated OAuth scopes: `cuebook.memory.read` for reading, plus `cuebook.memory.propose` for proposing candidates. Neither is part of the standard connection; the host performs a one-time consent step-up on first use.
- If a memory tool answers with an authorization error naming a required scope, say naturally that this needs a one-time memory permission the user can grant when the host asks, and continue the rest of the answer from non-memory data. Never retry in a loop, never treat the refusal as an account problem, and never ask the user to reinstall or re-login.
- Confirming, correcting, rejecting, and forgetting memories happen only inside Cuebook. Never present those as something this task can do, and never claim a proposal was "remembered".

## One request, composable lenses

Compose ONE `get_decision_context` call per user question with 1–4 analysis requests over at most 3 distinct subjects. Subjects:

- `cuebook://decision/episodes/previous` — the latest decision episode;
- `cuebook://decision/episodes/{id}` — a specific episode already referenced;
- `working-context://current-plan` — the plan the creator is describing right now (send it as `current_plan` with `authority: "client_asserted_current"`).

Map the creator's real question to lenses; do not enumerate lenses to the user:

| Creator is really asking | Lens |
|---|---|
| What is still missing from this plan? | `plan_completeness` |
| Why did I think that at the time? | `historical_reconstruction` |
| Did my actions match my plan? | `plan_execution_comparison` |
| How did the judgment line up with the result? | `decision_outcome_comparison` |
| What should I challenge before acting now? | `current_context_challenge` |
| Is this a one-off or a repeated pattern? | `recurring_pattern_search` |
| How does Cuebook see me as a decision maker? | `decision_behavior_inspection` |
| Which memories are you using on me? | `memory_inspection` |

Validate the request before calling:

```bash
node scripts/validate_decision_context_request.mjs decision-context-request-v2.json
```

## The pack is a ceiling, not a suggestion

The server returns an evidence manifest and per-claim support levels. They are the outer bound of what may be said:

- `supported` — the comparison or evaluation may be stated, with its evidence and stated limitations;
- `descriptive_only` — list the facts; do not conclude deviation, discipline, or attribution;
- `candidate_only` — present as a pattern awaiting the user's confirmation, never as a trait;
- `unsupported` — abstain and name what is missing, in plain language;
- `forbidden` — do not reveal contents or counts; mention only that permission is missing.

Never upgrade a level, never average two levels, and never let fluent prose imply more certainty than the level allows. When the manifest marks a domain `unavailable`, say what is absent instead of filling the gap — and fetch fresh market context through the ordinary public market tools, never from memory. Memory items are questions to raise, not market facts.

## Authority tags are load-bearing

- `frozen_user_commitment` — the plan frozen when the user actually committed; the only basis for "what you planned then".
- `canonical_domain_fact` — orders, fills, and outcomes as recorded.
- `client_asserted_current` — what the user says right now. It supports checking and challenging the current plan; it never becomes historical evidence, never fills a missing frozen field, and never upgrades a discipline claim.
- `confirmed_memory` vs `candidate_memory` — say which one a personalization came from; candidates are offered as "you might recognize this", not applied as rules.

## Answer shape

Organize one natural answer, not a report of modules: what the question is understood to be; what is certain (then-view, execution, later result, current info kept separate); what is missing that would change the judgment (ask at most the minimum); the single most worth-challenging point; and, expandable, which memories were used with their status and scope. For "how does Cuebook see me", keep three layers visibly distinct — observed behavior with sources, candidate interpretations with coverage and counterexamples, and user-confirmed collaboration rules — and never compress them into a personality score or a verdict like "undisciplined".

## Writing memory

This entrance stays read-only. When the creator explicitly says to remember something, or a creation task ends with a qualified insight, the proposal happens on the creation side under `create-cuebook-content` references/memory-proposal-discipline.md — at most one proposal per task, always landing as a candidate the user confirms inside Cuebook.
