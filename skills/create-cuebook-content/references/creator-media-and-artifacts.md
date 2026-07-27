# Creator Media And External Artifacts

Read this reference only when the creator supplies an image or a public interactive link. These are first-class expression choices, not degraded versions of a Cuebook-generated visual.

## Independent Choices

A Frame always keeps one title, one body, one publication image, and alt text. Three other facts remain independent:

- `subject_asset_refs` say which assets the Frame is about. They do not create a price test.
- `settlement_mode` says whether the Frame has a market-settled outcome.
- `external_artifact_url` adds a provider-hosted interactive experience behind the publication image.

All four Artifact × Settlement combinations are valid. Never invent a settlement merely because an interactive Artifact mentions a market, and never require an Artifact for a settleable view.

## Creator-Supplied Image

When the creator chooses their own PNG, JPEG, or WebP:

1. Confirm that it is their intended publication image and that they have the right to publish it.
2. Use the file as supplied. Do not crop, stretch, pad, recolor, restamp, or silently convert it to 1866 × 1200.
3. Run:

```bash
node scripts/inspect_creator_image.mjs /absolute/path/to/image \
  --out ./creator-image-inspection.json
```

4. Present the actual image with the proposed title and body. Image acceptance does not imply approval of the copy, Artifact, or Settlement.
5. Reuse the inspection's exact MIME type, native width and height, frame count, byte size, and encoded SHA-256 during staging.

The local inspection is deliberately small. It accepts one still image up to 12 MiB, 16 megapixels, and 8192 px on either edge. Cuebook remains authoritative for full decoding, malware checks, metadata cleaning, moderation, canonicalization, and upload integrity.
For an EXIF-oriented file, the reported width and height are its canonical display dimensions; the staged source bytes remain unchanged and the server removes the orientation metadata while preserving that appearance.

The 1866 × 1200 profile remains the recommended output for Cuebook-generated images. It is not a requirement for creator media.

## External Interactive Artifact

An Artifact is a public provider-hosted interactive URL paired with the Frame's immutable static image:

- Preserve the creator's canonical public HTTPS URL; never proxy, rewrite, mirror, or claim Cuebook hosts the live page.
- The publication image is the poster and failure fallback. Prefer a creator-supplied poster. If none exists, create one Cuebook poster from the confirmed idea or capture a rights-safe static view when the host and client support it.
- Show the poster during confirmation. The App loads the live page only after the reader taps it.
- Treat the page as mutable and potentially removable. A Correction may bind a new URL and poster; the previous release keeps its old binding.
- Never make Settlement depend on page content.

Hosting is not authorship. A URL under `*.ok.kimi.link` may be described as “Kimi hosted,” but never “made by Kimi” without a separate verifiable attestation. Apply the same rule to Vercel, Netlify, and creator-owned domains.

Reject credentials, non-HTTPS URLs, private-network hosts, or links that are not publicly launchable. Keep provider checks and App navigation policy backstage.

## Confirmation

Confirm the expression in one natural pass: title, body, the actual poster/image, whether tapping it opens an interactive Artifact, and—only when chosen—the settlement rule. Do not turn these independent choices into a form or require a second confirmation just because an Artifact is present.
