---
name: reconcile-market-content-history
description: Reconcile publishing receipts, content revisions, corrections, engagement snapshots, market outcomes, and authorized trade-history records into ContentHistoryLedgerV1. Use after release preparation or publication attempts, during correction/retraction work, for postmortem and idea-scorecard programs, or when deciding whether any content or trading performance claim is supportable. Keep prepared, attempted, acknowledged, verified-published, edited, corrected, retracted, and removed states distinct. Do not publish content, retry ambiguous posts, fabricate remote IDs or fills, treat engagement as investment validation, or turn incomplete/self-reported history into a track record.
---

# Reconcile Market Content History

Build the append-only history plane for creator operations. A ReleaseBundleV1 is prepared work; only a durable verified platform receipt proves publication. Content engagement, analytical calibration, and executed trading performance remain separate outcome planes.

## Workflow

1. Freeze `reconciliation_cutoff_at`, workflow and release references, policy version, and the exact supplied receipt/export hashes.
2. Register each publication attempt with release item, payload hash, destination, idempotency key, attempt time, remote identity, verification method, and current state.
3. Fold publication audit events through `attempted -> acknowledged -> verified_published`. Preserve `failed` and `ambiguous`; do not silently retry an ambiguous create with a new key.
4. Register content performance only against verified receipts. Preserve observation window, source, provisional/final state, and `packaging_only` use.
5. Register market outcomes against an opportunity and predeclared window. Call them idea scorecards or calibration, never a trade record.
6. Reconcile trade history by type: idea, paper, or executed. Only complete, consented, broker-reconciled executed cohorts may become eligible for later performance-claim review.
7. Append corrections with target hash, before/after patch, evidence, severity, approver, public action, affected artifacts, and replacement. Material corrections invalidate dependent artifacts and approvals.
8. Freeze learning snapshots with cutoff, feature revisions, cohort query hash, label definition, window, exclusions, policy versions, and `forward_time` split.
9. Return `ContentHistoryLedgerV1`, run `scripts/validate_content_history.py`, and repair every error.

## Publication States

- `attempted`: a request was sent.
- `acknowledged`: the platform accepted or queued it but durable publication is not yet verified.
- `verified_published`: remote ID, verification time, and verifiable locator/method exist.
- `ambiguous`: the call outcome cannot prove whether a post exists. Stop automated retries.
- `edited`, `corrected`, `retracted`, `removed`: later states linked to the same durable remote object.

HTTP success alone is not a publication receipt.

## Corrections

- Append a correction; never rewrite the old ledger entry.
- A later correction does not change an earlier decision snapshot. It changes current validity.
- Material or critical corrections require `edit`, `notice`, or `retraction`, plus dependency invalidation.
- A complete correction must account for every affected artifact.
- Trade corrections append amendments/reversals and rerun reconciliation.

## Outcome Planes

Read `references/outcome-policy.md` before handling outcomes.

- Content performance measures packaging and distribution.
- Market outcomes measure analytical calibration or an idea scorecard after a registered window.
- Trading performance requires executed records, complete cohorts, fills, fees, financing/FX/corporate-action treatment, consent, and reconciliation.

## Hard Gates

- `verified_published` without remote identity, timestamp, locator, or verification method: block.
- Two ambiguous creates for one release item with different idempotency keys: block duplicate-publication risk.
- Performance snapshot attached to an unverified receipt: block.
- Future window, later correction, or later market result included before the cutoff: block temporal leakage.
- Paper or self-reported trade marked eligible for a public performance claim: block.
- Partial or winner-only cohort marked complete: block.
- Material correction with no public action or incomplete invalidation cascade: block.
- Random row split for time-dependent learning: reject.

## Boundaries

- Do not call external publishing APIs or handle credentials.
- Do not generate new investment copy; route replacement content through the creator workflow.
- Do not infer missing remote IDs, fills, fees, cohort members, or consent.
- Do not use content engagement to validate source quality or investment correctness.

## Output Contract

Return the shape in `references/content-history-ledger-v1.schema.json`:

```json
{
  "schema_version": "content-history-ledger-v1",
  "ledger_id": "CHL_...",
  "publication_receipts": [],
  "corrections": [],
  "artifact_invalidations": [],
  "content_performance": [],
  "market_outcomes": [],
  "trade_reconciliations": [],
  "learning_snapshots": [],
  "audit_events": [],
  "quality_report": {}
}
```

## Resources

- `references/outcome-policy.md`: state, outcome-plane, cohort, and claim rules.
- `references/content-history-ledger-v1.schema.json`: authoritative contract.
- `scripts/validate_content_history.py`: receipt, correction, outcome, cohort, and event checks.
- `tests/test_validate_content_history.py`: regression suite.
- `evals/trigger_cases.json`: routing cases.
- `evals/rubric.md`: reconciliation quality gate.
- `evals/failure_cases.md`: stable failures.
