# Cuebook Frame Publish Workflow

Read this reference only after the creator selects a Frame and explicitly asks to publish, correct, or withdraw it. These are internal transport and audit instructions. Never expose their fields as part of the public Frame.

## Freeze And Render

Freeze the selected title, body, image, creator meaning, evidence refs, and encoded image bytes. Use one honest renderer mode:

- `cuebook_template`: retain optional HTML and licensed-font provenance; run DOM typography, collision, binding, capture, alt-text, byte-hash, canonical-pixel-hash, and manifest checks.
- `finished_bitmap`: use for external or already approved pixels and by default for a selected Fast Preview. Original HTML and production font files are not required. Audit valid PNG, exact role dimensions, legibility, clipping/collision, external imagery policy, encoded-byte hash, and canonical RGBA8 pixel hash. Record the generic raster and embedded-pixel profiles without claiming a font was verified from pixels.

Backend malware, decoding, EXIF/metadata, and upload-hash checks remain authoritative. Do not duplicate them as an HTML or font gate.

Assemble the frozen backend draft and binding only after all media roles are ready. Assembly media hashes use encoded PNG bytes; visual-manifest role hashes use canonical RGBA8 pixels. The manifest's alt text is authoritative, and any assembly duplicate must match.

## Publish Sequence

Use the capability map in `assets/plugin/mcp-capability-map-v1.json` and follow this order exactly:

`get_frame_capabilities` → begin each role upload → signed HTTPS PUT → complete each role upload → poll owner-only `get_frame_media_status` → `register_frame_visual_manifest` → create or update the draft with assembly plus registered binding → `prepare_frame_publish` → `publish_frame` with the returned `prepared_hash` and `publish_token` → `get_frame` readback.

- Never pull image bytes back through MCP, browse a display URL, use a standalone media retrieval operation, or fall back to base64.
- Give every mutation a fresh lowercase UUIDv7. Replay a key only with the identical payload.
- Ordinary initial publication goes directly from prepare to publish under the active publish grant and first-party publish action. It does not request or poll separate action consent.
- Correction uses `prepare_frame_correction_publish` → `publish_frame_correction`, also without separate consent.
- Withdrawal alone uses `prepare_frame_withdraw` → first-party consent → `get_frame_action_consent` polling → `withdraw_frame`.
- If a required capability is absent, stop at the latest completed phase. Never use a legacy write fallback.

The server recomputes the prepared hash and revalidates the credential, grant, client, user, scopes, policy, and token inside the publish transaction. Treat client allowlists as routing optimization, not authorization.

## Public Surface

The creator sees only the selected Frame's `title`, `body`, `image_ref`, and `alt_text`. On successful readback say “已发布.” On successful withdrawal say “已撤回.” Do not expose preparation, upload, draft, processing, consent, receipt, hash, scope, or credential state unless the creator explicitly requests technical diagnostics.
