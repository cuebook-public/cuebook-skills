# Finished Bitmap Release V1

Use `finished_bitmap` when the selected publication image already exists as pixels or came from an external renderer. It is a peer release path, not a degraded Cuebook template.

## Two renderer modes

- `cuebook_template`: HTML and licensed font files are optional provenance/reproducibility inputs and enable DOM typography, binding, responsive-layout, and collision QA.
- `finished_bitmap`: HTML and original font files are not required. Set `html_ref: null`, `render_audit_ref: null`, and point `capture_report_ref` to `frame-raster-audit-v1`. The audit records `font_profile.profile: embedded-pixels-v1` and `verification: not_asserted`; it never identifies or certifies a font from pixels.

Both modes retain 2488 x 1056 `publication` and 622 x 264 `compact` PNGs. Public/unlisted release also retains an independently composed 1200 x 630 `og` PNG. Neither mode downloads uploaded media through MCP.

## Raster audit request

```json
{
  "schema_version": "frame-finished-bitmap-audit-request-v1",
  "audited_at": "2026-07-18T10:00:00.000Z",
  "renditions": {
    "publication": {"ref": "publication.png"},
    "compact": {"ref": "compact.png"},
    "og": {"ref": "og.png"}
  },
  "image_review": {
    "reviewer": "model",
    "reviewed_at": "2026-07-18T10:00:00.000Z",
    "legibility": "pass",
    "collision": "pass",
    "imagery_policy": "no_external_untrusted",
    "imagery_result": "pass",
    "mutable_price": "absent",
    "backend_price_lock_ref": null
  }
}
```

The reviewer inspects every final rendition at useful and thumbnail sizes. `imagery_policy: no_external_untrusted` means no obvious external/untrusted image is visible, or every visible external image has an approved source/right. Use `not_required` only when that policy truly does not apply.

`mutable_price` is `absent` unless the displayed current/entry value is bound to a real backend `quote-lock:` or `entry-lock:` ref. A model-authored ref is invalid. Until such a backend lock exists, use relative copy such as `BTC · 30D LONG`. Historical axes and frozen target/settlement levels are different and remain allowed when source-bound.

Run:

```bash
node scripts/audit_finished_bitmap.mjs request.json \
  --asset-root ./selected \
  --out ./selected/raster-audit.json
```

The report binds the review to each rendition's encoded SHA-256 and canonical straight-alpha RGBA8 pixel SHA-256. It checks common supported PNG encoding and exact role dimensions as an early release preflight. The Frame service remains authoritative for malware scanning, general decoding, EXIF/metadata policy, and upload-integrity enforcement.

## Manifest compatibility

`build_frame_visual_manifest.mjs` emits the unchanged `frame-visual-manifest-v1` fields in both modes: `role_hashes`, `capture_audit`, `source_bindings`, `font_profile`, and `alt_text_by_role`. The finished-bitmap path uses `capture_audit.profile_version: frame-raster-audit-v1` and a deterministic descriptor hash for `embedded-pixels-v1`. This is Skill behavior only and does not require a Frame B0 manifest schema change.
