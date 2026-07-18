# MCP Settlement Protocol

The formula Skill compiles semantics. Cuebook MCP owns registration, observations, state transitions, and outcome receipts.

## Freeze and publish

There is no standalone settlement-registration Tool. Put the frozen settlement intent, claim hash, and formula hash inside `FrameDraftAssemblyV1`; then use the registered visual binding to create or update the Frame draft. `prepare_frame_publish` validates the draft and returns a prepared hash, short-lived publish token, and preview. `publish_frame` atomically freezes the Frame release, visual binding, and Settlement Contract.

Hard gates:

- claim and formula are both `frozen`;
- `formula.lineage.claim_ref` and `claim_hash` match the draft assembly exactly;
- `formula.execution_profile.engine` is supported and its family is one of the four server templates;
- the server regenerates the canonical outcome AST from `execution_profile` and rejects a mismatch;
- every source, calendar, session, timezone, interval, boundary operator, and missing-data policy is pinned;
- protocol-event horizons carry a stable event ID and authoritative source;
- prepare and publish do not fetch future observations or pre-score the view;
- each mutation has its own lowercase UUIDv7, and `publish_frame` revalidates the active grant and recomputes the prepared hash inside the transaction.

The draft assembly carries the complete canonical formula or an immutable artifact reference that the server resolves inside the same transaction. A hash without retrievable canonical bytes is not publishable.

## Resolve

`list_settlements` returns `SettlementOutcomeV1`:

```json
{
  "schema_version": "settlement-outcome-v1",
  "registration_ref": "registration:...",
  "claim_hash": "<64 hex>",
  "formula_hash": "<64 hex>",
  "lifecycle_state": "succeeded",
  "activation": {
    "state": "triggered",
    "observed_at": "2026-08-01T00:00:00Z",
    "captured_values": {}
  },
  "outcome": {
    "observed_at": "2028-04-20T00:00:00Z",
    "expression_result": true,
    "score_result": "success",
    "verdict": "hit",
    "combined_metrics": {},
    "leg_results": []
  },
  "observation_receipts": [],
  "resolved_at": "2028-04-20T00:01:00Z"
}
```

Every observation receipt records variable ID, source ref, instrument ref, event time, retrieval time, value, unit, session, interval, adjustment basis, and `sealed: true`. Store the evaluated expression branch and captured trigger values so the outcome can be reproduced from the receipt alone.

## Lifecycle

```text
immediate: active -> succeeded | failed | invalidated | manual_review | annulled
conditional: pending_activation -> active -> succeeded | failed | invalidated | manual_review | annulled
conditional, no trigger: pending_activation -> expired_untriggered -> no_score
```

Missing data follows the frozen formula policy. It never silently becomes `false`. A correction creates a new receipt revision and preserves the previous one.
