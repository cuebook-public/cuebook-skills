# Cuebook Frame Publish Workflow

Read this reference only after the creator selects a Frame and explicitly asks to publish, correct, or withdraw it. These are internal transport and audit instructions. Never expose their fields as part of the public Frame.

## Freeze And Render

Freeze the selected title, body, image, creator meaning, evidence refs, and encoded image bytes. Use one honest renderer mode:

- `cuebook_template`: retain optional HTML and licensed-font provenance; run DOM typography, collision, binding, capture, alt-text, byte-hash, canonical-pixel-hash, and manifest checks.
- `finished_bitmap`: use for external or already approved pixels and by default for a selected Fast Preview. Original HTML and production font files are not required. Audit valid PNG, exact role dimensions, legibility, clipping/collision, external imagery policy, encoded-byte hash, and canonical RGBA8 pixel hash. Record the generic raster and embedded-pixel profiles without claiming a font was verified from pixels.

Backend malware, decoding, EXIF/metadata, and upload-hash checks remain authoritative. Do not duplicate them as an HTML or font gate.

Before beginning the upload, build and locally validate the immutable assembly skeleton, including the required settlement intent, title, body, encoded media hash, alt text, evidence refs, and lineage. Do not upload a market-view image while settlement is null or unsupported. Add the server-issued media and manifest binding only after registration, then validate the complete assembly once. The assembly media hash uses the encoded PNG bytes; the visual manifest's `publication` role hash uses canonical RGBA8 pixels. The manifest's publication alt text is authoritative, and any assembly duplicate must match. Do not create compact, web, thumbnail, or OG authoring roles.

### Direct Fast Publish

Use this lane for the normal case: one passed `FramePreviewV1` candidate has been selected and the creator asks to publish it.

1. Revalidate the selected preview and its existing PNG; do not regenerate valid copy or pixels.
2. Run the `finished_bitmap` raster audit once, compute the encoded PNG hash and canonical RGBA8 pixel hash once, and retain the preview's exact alt text.
3. Bind the manifest directly to the selected preview candidate. A stable `preview_id#candidate_id` reference plus the canonical hash of that frozen candidate is sufficient source lineage; do not synthesize a `VisualDirectionSetV1` solely to obtain a binding id.
4. Build and validate the `FrameDraftAssemblyV1` skeleton directly from the selected Frame projection, its existing evidence refs, and the standard settlement intent before upload. After media and manifest registration, add `FrameDraftAssemblyBindingV1` and validate the pair once. The legacy-named `intake_ref` and `direction_set_ref` lineage fields may carry stable refs to the preview and selected candidate. Do not add the optional local generation handoff.
5. Do not create a workflow DAG, `PostV1`, `VisualDirectionSetV1`, `PublishCandidateSetV1`, release bundle, HTML page, font package, sibling candidate, or release rendition in this lane.

Use the full orchestrated artifact path only when the creator explicitly requested three alternatives, a correction, a reproducibility audit, or another advanced deliverable that actually consumes those artifacts.

## Publish Sequence

Use the capability map in `../../assets/mcp-capability-map-v1.json` and follow this order exactly. Reuse the normal Create preflight's cached `get_frame_capabilities` result when still valid; do not call it twice merely because the creator moved from preview to publication.

`get_frame_capabilities` → begin the publication upload → one signed HTTPS PUT → complete the publication upload → poll owner-only `get_frame_media_status` → `register_frame_visual_manifest` → create or update the draft with assembly plus registered binding → `prepare_frame_publish` → `publish_frame` with the returned `prepared_hash` and `publish_token`.

- Never pull image bytes back through MCP, browse a display URL, use a standalone media retrieval operation, or fall back to base64.
- Upload exactly one 2488 × 1056 PNG under the `publication` role. Feed and detail surfaces reuse it. Any future CDN resize is transparent delivery infrastructure, not a Skill-generated rendition or Frame wire role.
- Give every mutation a fresh lowercase UUIDv7. Replay a key only with the identical payload.
- Keep the normal remote critical path to one call per mutation: begin, complete, register, draft, prepare, and publish, plus the required owner-only status poll and one signed PUT. Do not probe the same operation with alternate payload shapes.
- Ordinary initial publication goes directly from prepare to publish under the active publish grant and first-party publish action. It does not request or poll separate action consent.
- Correction uses `prepare_frame_correction_publish` → `publish_frame_correction`, also without separate consent.
- Withdrawal alone uses `prepare_frame_withdraw` → first-party consent → `get_frame_action_consent` polling → `withdraw_frame`.
- If a required capability is absent, stop at the latest completed phase. Never use a legacy write fallback.
- A structurally valid `publish_frame` or `publish_frame_correction` receipt is the terminal success signal. Do not call `get_frame` as a post-publish check, open or curl a Frame web page, inspect generated page HTML or metadata, or perform another network verification step.

### Failure Budget

- A local schema or Tool-input error is not retryable. Correct the payload locally once before making another call; never send the same invalid shape repeatedly.
- For an uncertain transport failure after a mutation may have reached the server, replay at most once with the exact same idempotency key and byte-identical payload. Never mint a new key to recover an uncertain write.
- A domain rejection, policy rejection, authorization error, hash conflict, changed-payload conflict, or second transport failure stops the flow at the last receipt. Explain the blocker plainly and preserve the frozen Frame; do not loop, probe adjacent Tools, or use `get_frame`, `get_frame_draft`, capabilities refresh, or browser requests as recovery polling.
- Poll `get_frame_media_status` only for server-declared processing, with the server-provided retry timing when available. Do not turn other mutations into polling loops.

The server recomputes the prepared hash and revalidates the credential, grant, client, user, scopes, policy, and token inside the publish transaction. Treat client allowlists as routing optimization, not authorization.

## Public Surface

The creator sees only the selected Frame's `title`, `body`, `image_ref`, and `alt_text`. After a valid publish receipt, say exactly “已发布，去 Cuebook App 看。” and stop. Never present `canonical_url`, a Cuebook web link, release or Frame identifiers, receipt fields, or a browser fallback. On successful withdrawal say “已撤回.” Do not expose preparation, upload, draft, processing, consent, hash, scope, or credential state.
