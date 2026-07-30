# Cuebook Frame Publish Workflow

Read this reference when one complete Frame is ready to show. Stage its exact media silently while
the creator decides; perform no publication write until the creator explicitly asks to publish or
correct it. Keep every transport field and server state backstage.

An explicit “publish,” “send this version,” or equivalent instruction in any language is the one
publication authorization for the already displayed, unchanged Frame. It both selects that
copy-to-image pair and authorizes its external write. Do not restate the copy or settlement, ask
“confirm publish?” again, or add a release checklist.

## Stage At Preview, Publish In One Call

The selected Frame is already complete. Its title, body, alt text, subject assets, evidence refs, optional external Artifact, optional settlement meaning, image bytes, MIME type, native dimensions, encoded SHA-256, and byte size are frozen before the creator says “publish.” Do not reread design references, inspect renderer source, rerender, resize or crop creator media, re-audit pixels, recompute hashes, generate HTML, create local JSON contracts, or manually assemble a manifest or draft after that confirmation.

Reuse the cached `get_frame_capabilities` result from task readiness. It must advertise
`contract_version: frame-mcp-phase-b-v3`, `reasoning_tags.mode: agent_inferred`,
`begin_frame_media_upload`, and `complete_frame_publish`. If any is absent, explain briefly that
Cuebook publishing needs an update and stop; never substitute a lower-level compatibility path.

**Staging (runs silently the moment the rendered Frame is presented, before any publication intent):**

1. Call `begin_frame_media_upload` once for the frozen `publication` image. For a generated visual, reuse the runner's PNG, 1866 × 1200 dimensions, hash, and byte size. For a creator image, reuse the inspector's exact PNG/JPEG/WebP MIME type, native width and height, one-frame declaration, hash, and byte size. Use a fresh lowercase UUIDv7.
2. Upload the exact selected bytes once to the returned signed HTTPS PUT target, immediately (the signed URL is short-lived). Never send image bytes through MCP, base64, or a display URL. Do not resize, crop, stretch, pad, restamp, or re-encode a creator image.
3. Call `complete_frame_media_upload` once with the upload id and a fresh lowercase UUIDv7 so scanning, decoding, and normalization run while the creator is still deciding. This touches only the quarantine store: nothing becomes public, and an abandoned staging simply expires backstage. Never mention staging, uploads, or processing to the creator. A visual reroll stages its own new PNG the same way; the superseded staging is abandoned without cleanup calls.

**Publication (after the creator's explicit intent):**

4. Call `complete_frame_publish` once with the staged upload id, a separate fresh lowercase UUIDv7,
   frozen copy, alt text, `subject_asset_refs`, evidence refs, frozen `reasoning_tags`, and one
   explicit `settlement` object.
   - Always send `reasoning_tags` as
     `{schema_version:"frame-reasoning-tags.v1",primary:<tag|null>,secondary:[...]}`. Infer it
     silently from the confirmed interaction and evidence; never ask for a tag choice or expose it
     in the public recap. Use only `fundamental`, `technical`, `macro_event`, `flow_positioning`,
     `sentiment_narrative`, and `risk_management`, with at most one primary and two distinct
     secondary tags. Use `risk_management` only when the content materially reasons about downside,
     invalidation, exposure, sizing, liquidity, drawdown, concentration, or another risk boundary;
     ordinary uncertainty is not enough. Honest empty is `{primary:null,secondary:[]}`.
   - Use `settlement: {mode:"none"}` when the creator did not choose a market-settled outcome.
     Nothing economic can appear in this branch.
   - Use `settlement: {mode:"market",settle_at,timezone,claim_text,rule}` only for a confirmed
     testable outcome. `rule` is exactly one closed variant:
     `single_direction {asset_ref,direction}`, `single_range {asset_ref,max_abs_move_bps}`,
     `relative {asset_ref,pair_asset_ref,direction,spread_threshold_bps?}`, or
     `compound {primary,secondary}` where each condition is
     `{asset_ref,direction}` and a range condition additionally requires `max_abs_move_bps`.
     Relative direction is `outperform|underperform`; ordinary direction is `long|short`.
   - Add `external_artifact_url` only when the creator confirmed a public provider-hosted interactive Artifact. The uploaded image remains its immutable poster and fallback.

Validate subject identities, Artifact URL, and any complete settlement meaning before staging; never discover a missing or contradictory second leg after reserving an upload. Artifact and Settlement are independent, so all four combinations are valid.

Publish immediately whenever the creator confirms, including before market open, after market close, on weekends, and on exchange holidays. Frame publication is not order execution and never waits for a trading session. The server freezes the persisted display snapshot for every settlement asset while keeping the creator's exact deadline. Never add another freshness gate. Never tell the creator to return when the market opens.

**Preflight (optional, read-only):** when publishability is genuinely in doubt — a previous attempt
was blocked, or the creator asks whether the view can settle — call `preflight_frame_publish` with
the same market `settlement` object but omit `claim_text`. It resolves assets, the schedule, and
entry-observation availability without writing anything; a blocked result names the reason, the
affected legs, and whether waiting can cure it. Its result is a current snapshot, never a baseline
commitment, and never enters Frame copy. Do not preflight routinely before every publish.

`complete_frame_publish` owns every server-side step after the signed upload, including validation, optional baseline capture, and atomic publication. Treat it as the only completion call for a new Frame; do not reproduce its work through lower-level compatibility actions or read the Frame back.

A successful `complete_frame_publish` result is final success. Trust the typed MCP result and stop all network work immediately: do not parse or validate a receipt, extract Frame or release IDs, read back the Frame, open a web page, inspect HTML or metadata, probe a canonical URL, or call any follow-up Tool.

## Child Follow-Up And Retrospective

A child Frame is an append-only text supplement under one existing parent, not a smaller initial
publication. It inherits the parent's author, visibility, lifecycle, and moderation and has no
independent image, Artifact, Settlement, or child-of-child path.

1. On an explicit request to follow up or review a Frame, call `get_frame` for the frozen parent and
   `list_child_frames` once for its existing supplements. Use the Settlement result or passed
   deadline as evidence for review, but never rewrite the parent's original claim.
2. If the creator is adding a follow-up and there is a real original-thesis-versus-later-evidence
   comparison, offer one compact question: whether to preserve this change as a retrospective
   under the original Frame. Ask at most once and continue with an ordinary child if they decline.
   Do not add a redundant prompt when the user already explicitly asked for a retrospective.
3. Draft and show the exact child title and body. Say plainly that it will be appended under the
   existing Frame, then ask one natural question: publish this exact supplement or change it. Do
   not render or stage media. An explicit “append,” “publish this review,” or equivalent for the
   unchanged text is authorization.
4. After authorization, call `publish_child_frame` once with the parent reference, exact title,
   body, language, pinned `skill_refs`, a fresh lowercase UUIDv7, and
   `reasoning_tags:{schema_version:"frame-child-reasoning-tags.v1",primary:<tag|null>,secondary:[...]}`.
   Infer at most one primary and two distinct secondary tags from the child itself. The allowed
   values are the six parent tags plus child-only `retrospective`. Use `retrospective` only for an
   actual comparison of the original thesis with later evidence or outcome; a correction, new
   observation, or status update alone does not qualify. Apply `risk_management` under the same
   material-risk rule as an independent Frame. Honest empty is
   `{primary:null,secondary:[]}`.

Only the parent author may append. If the server rejects authorship, stop without alternate payloads
or identity probing. A visitor can continue a read-only review; if they explicitly want to publish
their own judgment, use the normal new-Frame flow with its full image and publication confirmation,
not the child path.

A successful child publication result is final. Do not read it back or publish another child. Reply
briefly that the review or follow-up was added under the original Frame and invite the author to
revisit it in Cuebook App; keep ids, tags, receipts, and Tool language backstage.

## Corrections And App-Only Author Controls

The high-level Tool is for a new initial publication. An explicit correction continues through its correction draft and `prepare_frame_correction_publish` → `publish_frame_correction`.

Published releases are immutable, and MCP has no hide, delete, or management action. For author
hide/show or a possible delete during the first hour after initial publication, direct the creator
to Cuebook App; never simulate the App action. Use a Correction only when economics are unchanged
and the creator is clarifying copy, references, the visual, external Artifact binding, or inferred
reasoning tags. A changed thesis, direction, horizon, settlement rule, or other economic meaning
requires a new Frame.

## Failure Budget

- Correct a local input error once before another call. Do not probe alternate payload shapes.
- If a mutation may have reached the server but its transport result is unknown, replay it at most once with the same idempotency key and byte-identical payload. A lost success answers that replay with the journaled receipt (`idempotent_replay: true`); treat it as the original success.
- For a market-settled Frame, a blocked completion (`reprepare_required`) is condition-bound, not final: the message names what is missing (a leg's price, pair alignment, or shared observation boundary). After that condition plausibly changes, retry ONCE with the SAME idempotency key — completed sub-steps replay and no new draft is created. Never switch to a fresh key for the same frozen payload. A non-settling Frame has no baseline availability gate.
- A true domain rejection — asset identity, authorization, hash, or changed payload — stops the flow. Preserve the frozen Frame and explain the useful next step in ordinary language; do not expose Tool names or internal states.
- Do not manually poll processing in the initial fast lane. The server owns its bounded wait.
- After a successful result, do not run reconciliation, history updates, analytics, sharing setup, or Paper Trade Tools. A separately qualified end-of-task memory candidate may follow its own proposal discipline; it is never publication verification.

OAuth, scopes, idempotency, server decoding, malware checks, canonical-pixel hashing, prepared-hash recomputation, publish-token validation, and transaction locking remain authoritative server protections. The shorter Skill path does not weaken them.

## Public Surface

After success, respond warmly in two or three short sentences. Say that the idea is published and invite the creator to see it in Cuebook App; name the distinctive insight Cuebook Agent helped make clear and, when useful, its future checkpoint. Never show a web URL, Frame or release id, receipt, baseline-engine detail, source eligibility, scope, upload state, or other backend language.

Choose exactly one natural end action. When the Memory Proposal Discipline qualifies, propose that
single candidate and offer nothing else. Otherwise choose at most one action that matches the
creator's evident intent: share the finished idea from Cuebook App with another AI for a fresh
judgment, continue with another signal or intuition, or—when Paper tools are available—offer to
record a separate simulated Paper Trade. Omit an end action when none helps. An offer is not
authorization; after explicit Paper opt-in, call `preview_paper_order` and still require explicit
placement intent.

The App, not the Skill or publication flow, owns sharing. Its one-sentence share copy is: “Cuebook Agent helped me develop and record this market idea, and I would like your judgment. Open it with Cuebook; if Cuebook is not connected, follow the prompt to install and connect it: <Cuebook share entry>”. The App localizes this copy for the creator and binds that entry to the just-published Frame; the Skill never extracts IDs or fabricates an entry from a web URL.
