# Cuebook Frame Publish Workflow

Read this reference only after the creator has seen one complete Frame and explicitly asks to publish, correct, or withdraw it. Keep every transport field and server state backstage.

## Initial Publish: Three Steps

The selected Fast Preview is already the publication artifact. Its title, body, alt text, evidence refs, settlement meaning, PNG bytes, encoded SHA-256, and byte size are frozen before the creator says “publish.” Do not reread design references, inspect renderer source, rerender, re-audit pixels, recompute hashes, generate HTML, create local JSON contracts, or manually assemble a manifest or draft after that confirmation.

Reuse the cached `get_frame_capabilities` result from task readiness. It must advertise `begin_frame_media_upload` and `complete_frame_publish`. If either is absent, explain briefly that Cuebook publishing needs an update and stop; never fall back to the legacy multi-call authoring sequence.

Publish immediately whenever the creator confirms, including before market open, after market close, on weekends, and on exchange holidays. Frame publication is not order execution and never waits for a trading session. For an equity, ETF, or index, the server can freeze the latest eligible persisted realtime observation or provider-official completed close as the baseline while keeping the creator's exact future deadline. Never tell the creator to return when the market opens. A real `missing_eligible_observation` response means Cuebook lacks a bounded persisted observation; describe it as a temporary data-availability issue, not a market-hours rule.

1. Call `begin_frame_media_upload` once for the frozen `publication` PNG. Reuse the runner-emitted `image_sha256` and `image_byte_size`; declare PNG, 2488 × 1056, and a fresh lowercase UUIDv7.
2. Upload the exact selected PNG once to the returned signed HTTPS PUT target. Never send image bytes through MCP, base64, or a display URL.
3. Call `complete_frame_publish` once with the upload id, a separate fresh lowercase UUIDv7, and the already confirmed title, body, language, alt text, asset, direction, exact deadline, creator timezone, claim, and evidence refs. Map each frozen preview ref to its known `news`, `event`, `filing`, `fact`, or `user_source` kind without refetching it; use `fact` for an ordinary frozen Cuebook result whose narrower kind is not already known.

`complete_frame_publish` owns media completion and processing, raster manifest registration, draft assembly, the standard deadline contract, prepare, and the atomic publish transaction. Do not call `complete_frame_media_upload`, `get_frame_media_status`, `register_frame_visual_manifest`, `create_frame_draft`, `prepare_frame_publish`, `publish_frame`, or `get_frame` in the normal initial-publish lane.

A structurally valid `FramePublicationReceiptV1` from `complete_frame_publish` is final success. Stop all network work immediately: no readback, web page, canonical URL, HTML inspection, metadata probe, or receipt verification.

## Corrections And Withdrawals

The high-level Tool is for a new initial publication. An explicit correction continues through its correction draft and `prepare_frame_correction_publish` → `publish_frame_correction`. Withdrawal continues through `prepare_frame_withdraw` → first-party consent → `get_frame_action_consent` → `withdraw_frame`. Only withdrawal uses separate action consent.

## Failure Budget

- Correct a local input error once before another call. Do not probe alternate payload shapes.
- If a mutation may have reached the server but its transport result is unknown, replay it at most once with the same idempotency key and byte-identical payload.
- A domain, policy, authorization, hash, or changed-payload rejection stops the flow. Preserve the frozen Frame and explain the useful next step in ordinary language; do not expose Tool names or internal states.
- Do not manually poll processing in the initial fast lane. The server owns its bounded wait.

OAuth, scopes, idempotency, server decoding, malware checks, canonical-pixel hashing, prepared-hash recomputation, publish-token validation, and transaction locking remain authoritative server protections. The shorter Skill path does not weaken them.

## Public Surface

After success, respond warmly in two or three short sentences. Say that the idea is published and invite the creator to see it in Cuebook App; name the distinctive insight Cuebook Agent helped make clear and, when useful, its future checkpoint. Never show a web URL, Frame or release id, receipt, baseline-engine detail, source eligibility, scope, upload state, or other backend language.

Ask at most one optional next step: share the finished idea from Cuebook App with another AI for a fresh judgment, share another signal or intuition, or—when Paper tools are available—offer to record a separate simulated Paper Trade. An offer is not authorization; after explicit opt-in, call `preview_paper_order` and still require explicit placement intent.

The App, not the Skill or publication flow, owns sharing. Its one-sentence share copy is: “这是 Cuebook Agent 帮我完善并记录的交易想法，想听听你怎么判断；请用 Cuebook 打开，尚未连接时按提示安装并连接：<Cuebook 分享入口>”. The App binds that entry to the exact published release or an opaque equivalent; the Skill never fabricates one from a web URL.
