---
name: prepare-market-content-release
description: Freeze and preflight finalized finance or investment content into ReleaseBundleV1 without publishing it. Use when the user wants to prepare, stage, schedule, hand off, or assess publication readiness for an owned website, X, Telegram, Reddit, Xiaohongshu, Douyin, Seeking Alpha, or another destination; choose manual handoff versus an authorized official API; verify policy and account capability; freeze payload and asset hashes; record separate content and release approvals; add idempotency, dependencies, expiry, and rollback plans. Do not use for research, drafting, media production, credential collection, browser automation, private API access, or any external posting, editing, deleting, scheduling, commenting, or voting action.
---

# Prepare Market Content Release

Create a no-side-effect release bundle from finalized content. A release bundle proves what could be published and what remains blocked; it is never proof that publication occurred.

## Workflow

1. Accept finalized `PostV1`, `MediaPackageV1`, `ViewpointCardV1`, or a human-authored artifact plus its ContentRecipeV1 reference and optional frozen `TradingThesisV1` or hash-linked `SettlementClaimV1` and `SettlementFormulaV1`. Treat `ViewpointVisualV1` as the primary bound Feed asset; retain `LogicCardV1`, `MarketFigureV1`, `ThesisChartV1`, and `IndicatorPackV1` as compatibility or detail assets. Reject mutable working copy, a stale catalog resolution, or an artifact outside the recipe's selected outputs.
2. Read `references/platform-capabilities.md` for the requested destination. Recheck official capability and policy sources when the bundle may become `ready`.
3. Choose one execution mode per item: `manual_handoff`, `platform_draft`, `api_direct`, or `api_scheduled`. Default to `manual_handoff` when official account capability is unverified.
4. Freeze the artifact and final payload by SHA-256 reference. Record the selected variant, asset references, hashes, and rights. For a thesis derivative, record the versioned thesis ref and canonical hash. When the content has a settlement footer, bind the frozen `SettlementClaimV1` and `SettlementFormulaV1` references and canonical hashes to the release item. The formula must point back to that exact claim hash. A release hash never replaces either protocol hash. Do not copy credentials into the bundle.
5. Record platform, opaque account reference, capability snapshot, policy snapshot, schedule, embargo, expiry, dependencies, manual checklist, and rollback path. Website items also record a passing SEO preflight and the GEO preflight state when that module was selected.
6. Record content approval and release approval separately. Pending approval produces `needs_approval`; a policy, rights, content, or capability blocker produces `blocked`.
7. Add one unique idempotency key for every draft or API operation. It identifies the intended operation, not an access credential.
8. Return `ReleaseBundleV1` and validate it:

```bash
python scripts/validate_release_bundle.py release-bundle-v1.json
```

## Execution Modes

- `manual_handoff`: prepare final copy, assets, disclosures, and a human checklist. No platform API assumption.
- `platform_draft`: use only when an authorized official capability can create a draft. A draft receipt is not a publication receipt.
- `api_direct`: immediate external creation by a later execution adapter after explicit release approval.
- `api_scheduled`: later external creation by a verified platform or scheduler adapter, with timezone, publish time, expiry, cancellation, and idempotency.

This skill never calls those adapters.

## Hard Gates

- A PostV1 or MediaPackageV1 `publication_state` must be `ready` before a release item can be ready. A `ViewpointCardV1` must be `ready` or `frozen`; conditional logic nodes, market-figure points, chart bars, indicator values, settlement fields, or disclosures block the card from release while still permitting an authoring preview.
- Current policy must be `ready`; conditional and blocked policy states block execution.
- API and platform-draft modes require verified capability, current official documentation, a named adapter, and supported operation flags.
- Xiaohongshu defaults to manual handoff unless an account-specific official note-publishing capability is verified.
- Seeking Alpha AI-assisted content remains blocked from submission. An internal outline is not a releasable article.
- Owned-web release requires a passing `MarketSEOPackV1` preflight. A selected GEO sidecar must also pass; website execution remains manual until a separate owned CMS adapter contract exists.
- Ready commentary, analysis, or marketing requires resolved position and commercial disclosures in the upstream artifact.
- A thesis derivative must resolve to a frozen `TradingThesisV1`; claim drift, a missing canonical hash, or a resolution window that expired before the planned release blocks readiness.
- A settlement footer must resolve to a hash-linked frozen `SettlementClaimV1` and frozen `SettlementFormulaV1`; drafts, unconfirmed fields, unsealed observation policies, and claim/formula hash drift block release.
- Every shipped asset needs explicit reusable rights and a stable hash or immutable reference.
- Content approval and release approval are distinct. Approval timestamps and approver references must be recorded when approved.
- Never store tokens, cookies, passwords, secrets, API keys, authorization headers, or private signing material.
- Do not mark content published, construct external post IDs, or invent URLs. Only a later `PublicationReceiptV1` may prove an external action.

## Output

Return `ReleaseBundleV1` using `references/release-bundle-v1.schema.json`.

State rules:

- `blocked`: content, policy, capability, rights, schedule, or preflight has a hard blocker.
- `needs_approval`: all hard gates pass, but content or release approval is pending.
- `ready`: all hard gates pass and both approvals are complete. It still has no external side effect.

## Resources

- `references/platform-capabilities.md`: current official capability routing and conservative defaults.
- `references/release-bundle-v1.schema.json`: output contract.
- `scripts/validate_release_bundle.py`: deterministic safety, state, dependency, schedule, and idempotency checks.
- `tests/test_validate_release_bundle.py`: regression cases.
