# Cuebook Frame Publish Workflow

Read this reference only after the creator has seen one complete Frame and explicitly asks to publish, correct, or withdraw it. Keep every transport field and server state backstage.

An explicit “publish,” “send this version,” or equivalent instruction in any language is the one publication authorization for the already confirmed Frame. Do not restate the copy or settlement, ask “confirm publish?” again, or add a release checklist.

## Stage At Preview, Publish In One Call

The selected Fast Preview is already the publication artifact. Its title, body, alt text, evidence refs, settlement meaning, PNG bytes, encoded SHA-256, and byte size are frozen before the creator says “publish.” Do not reread design references, inspect renderer source, rerender, re-audit pixels, recompute hashes, generate HTML, create local JSON contracts, or manually assemble a manifest or draft after that confirmation.

Reuse the cached `get_frame_capabilities` result from task readiness. It must advertise `begin_frame_media_upload` and `complete_frame_publish`. If either is absent, explain briefly that Cuebook publishing needs an update and stop; never substitute a lower-level compatibility path.

**Staging (runs silently the moment the rendered Frame is presented, before any publication intent):**

1. Call `begin_frame_media_upload` once for the frozen `publication` PNG. Reuse the runner-emitted `image_sha256` and `image_byte_size`; declare PNG, 1866 × 1200, and a fresh lowercase UUIDv7.
2. Upload the exact selected PNG once to the returned signed HTTPS PUT target, immediately (the signed URL is short-lived). Never send image bytes through MCP, base64, or a display URL.
3. Call `complete_frame_media_upload` once with the upload id and a fresh lowercase UUIDv7 so scanning, decoding, and normalization run while the creator is still deciding. This touches only the quarantine store: nothing becomes public, and an abandoned staging simply expires backstage. Never mention staging, uploads, or processing to the creator. A visual reroll stages its own new PNG the same way; the superseded staging is abandoned without cleanup calls.

**Publication (after the creator's explicit intent):**

4. Call `complete_frame_publish` once with the staged upload id, a separate fresh lowercase UUIDv7, and the frozen copy, alt text, focal `asset_ref`, exact deadline, timezone, claim, and evidence refs. Map a compound lock's `primary_direction` into Tool `direction`. Add `max_abs_move_bps` only when that focal condition is range. Relative performance adds `pair_asset_ref` and only a creator-stated nonzero `spread_threshold_bps`. Independent conditions add `pair_asset_ref` plus `pair_direction`, and `pair_max_abs_move_bps` only when that leg is range. For directional legs, the server uses zero bps. Validate the complete semantic input before staging; never discover a missing or contradictory second leg after reserving an upload.

Publish immediately whenever the creator confirms, including before market open, after market close, on weekends, and on exchange holidays. Frame publication is not order execution and never waits for a trading session. The server freezes the persisted display snapshot for every settlement asset while keeping the creator's exact deadline. Never add another freshness gate. Never tell the creator to return when the market opens.

**Preflight (optional, read-only):** when publishability is genuinely in doubt — a previous attempt was blocked, or the creator asks whether the view can settle — call `preflight_frame_publish` with the same settlement fields. It resolves assets, the schedule, and entry-observation availability without writing anything; a blocked result names the reason, the affected legs, and whether waiting can cure it. Its result is a current snapshot, never a baseline commitment, and never enters Frame copy. Do not preflight routinely before every publish.

`complete_frame_publish` owns every server-side step after the signed upload, including validation, baseline capture, and atomic publication. Treat it as the only completion call for a new Frame; do not reproduce its work through lower-level compatibility actions or read the Frame back.

A successful `complete_frame_publish` result is final success. Trust the typed MCP result and stop all network work immediately: do not parse or validate a receipt, extract Frame or release IDs, read back the Frame, open a web page, inspect HTML or metadata, probe a canonical URL, or call any follow-up Tool.

## Corrections And Withdrawals

The high-level Tool is for a new initial publication. An explicit correction continues through its correction draft and `prepare_frame_correction_publish` → `publish_frame_correction`. Withdrawal continues through `prepare_frame_withdraw` → first-party consent → `get_frame_action_consent` → `withdraw_frame`. Only withdrawal uses separate action consent.

## Failure Budget

- Correct a local input error once before another call. Do not probe alternate payload shapes.
- If a mutation may have reached the server but its transport result is unknown, replay it at most once with the same idempotency key and byte-identical payload. A lost success answers that replay with the journaled receipt (`idempotent_replay: true`); treat it as the original success.
- A blocked completion (`reprepare_required`) is condition-bound, not final: the message names what is missing (a leg's price, pair alignment, a shared session phase). After that condition plausibly changes, retry ONCE with the SAME idempotency key — completed sub-steps replay and no new draft is created. Never switch to a fresh key for the same frozen payload.
- A true domain rejection — asset identity, authorization, hash, or changed payload — stops the flow. Preserve the frozen Frame and explain the useful next step in ordinary language; do not expose Tool names or internal states.
- Do not manually poll processing in the initial fast lane. The server owns its bounded wait.
- After a successful result, do not run reconciliation, history updates, analytics, sharing setup, or Paper Trade Tools. Those are separate later actions and each requires its own explicit user request.

OAuth, scopes, idempotency, server decoding, malware checks, canonical-pixel hashing, prepared-hash recomputation, publish-token validation, and transaction locking remain authoritative server protections. The shorter Skill path does not weaken them.

## Public Surface

After success, respond warmly in two or three short sentences. Say that the idea is published and invite the creator to see it in Cuebook App; name the distinctive insight Cuebook Agent helped make clear and, when useful, its future checkpoint. Never show a web URL, Frame or release id, receipt, baseline-engine detail, source eligibility, scope, upload state, or other backend language.

Ask at most one optional next step: share the finished idea from Cuebook App with another AI for a fresh judgment, share another signal or intuition, or—when Paper tools are available—offer to record a separate simulated Paper Trade. An offer is not authorization; after explicit opt-in, call `preview_paper_order` and still require explicit placement intent.

The App, not the Skill or publication flow, owns sharing. Its one-sentence share copy is: “Cuebook Agent helped me develop and record this market idea, and I would like your judgment. Open it with Cuebook; if Cuebook is not connected, follow the prompt to install and connect it: <Cuebook share entry>”. The App localizes this copy for the creator and binds that entry to the just-published Frame; the Skill never extracts IDs or fabricates an entry from a web URL.
