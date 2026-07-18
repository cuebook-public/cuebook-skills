# Cuebook Input Semantics

| Input | Permitted downstream use | Prohibited promotion |
| --- | --- | --- |
| News | Discovery, attributable sourced facts, event clustering, research questions | Search snippets as evidence; syndication as independent confirmation; unsupported causality or consensus |
| Calendar event | Watch creation, catalyst timing, expiry, staffing, pre-event planning | Claiming the event occurred; treating an expected result as fact; inferring price direction |
| Narrative | Hypothesis, reasoning lens, scenario seed, countercase, search prompt | Factual evidence, observed consensus, probability, current price state, self-validation |
| Trade idea | Prospective thesis snapshot, research/watch input, horizon, catalyst, invalidation | Fill, position, P&L, achieved return, backdated call, personalized order instruction |
| Trade history | Conflict disclosure, consented postmortem, reconciled retrospective cohort | Fresh market evidence, current news, cherry-picked winners, synthetic fills, unauthorized disclosure |

## Disclosure Defaults

- Missing position state is `unknown`, never `flat`.
- Missing commercial relationship is `unknown`, never `none`.
- Missing public reuse permission is `private` or `unknown`, never `record_allowed`.
- `self_reported` execution can be retained internally but cannot support public performance claims.
- Keep content engagement, idea outcomes, paper trades, and broker-reconciled executions in separate outcome planes.

## Temporal Rule

For replay at `knowledge_cutoff_at`, use only the exact revision whose `available_at` is at or before the cutoff. A later source correction can invalidate current work, but it cannot rewrite what an earlier workflow knew.
