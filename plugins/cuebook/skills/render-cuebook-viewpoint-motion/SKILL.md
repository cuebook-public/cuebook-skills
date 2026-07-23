---
name: render-cuebook-viewpoint-motion
description: Render an approved ViewpointMotionSpecV1 as a React and Motion for React component, deterministic keyframes, static poster fallback, and optional MP4 or WebM derivative. Use when Cuebook Feed cards, exported finance clips, or React creator tools need a short animated trading viewpoint. Preserve the approved visual direction and data bindings; do not invent motion-only facts, force audio, loop Feed animations, or replace the static poster.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires Node.js 18+ with Playwright plus a local Chromium/Chrome executable for capture, render, and audit scripts. Local filesystem only; no network access at render time.
---

# Render Cuebook Viewpoint Motion

Build the selected Cuebook motion direction as a production-compatible React component. The canonical editable assets are JSON plus TSX; video is a derivative.

## Workflow

1. Validate `ViewpointMotionSpecV1` with `$direct-cuebook-viewpoint-motion`.
2. Read the target React project's package conventions. Use its component, token, and build patterns. Install `motion` only when the project does not already provide Motion for React.
3. Start from `assets/CuebookMotionPrimitives.tsx`. Generate a thesis-specific component instead of a universal dashboard template.
4. The generated component must accept:
   - `externalTimeMs?: number` for deterministic screenshots and video;
   - `autoplay?: boolean` for Feed behavior;
   - `reducedMotion?: boolean` for explicit testing.
5. Keep one persistent hero element across beats. Animate state changes inside the approved `layout_system` and spatial skeleton; preserve its grid, type scale, density, alignment, and reading order.
6. Preserve the selected 1244 x 800 authoring composition and exact 1866 x 1200 poster. Verify that the same poster remains readable at a 622 x 400 display size; do not create a separate compact bitmap. Text must remain readable throughout, including intermediate keyframes.
7. Capture 4-7 keyframes with `scripts/capture_motion_keyframes.cjs`. Inspect pixels at both sizes.
8. Keep the approved `ViewpointVisualV1` PNG as poster and reduced-motion fallback.
9. For video export, use `assets/CuebookRemotionAdapter.tsx` to drive the same component by frame time. Export H.264 MP4 by default; add WebM only when the destination needs it.
10. Write and validate `ViewpointMotionV1`. Freeze hashes for the JSON spec, TSX component, poster, keyframes, and any video derivatives.

```bash
node scripts/capture_motion_keyframes.cjs http://localhost:3000/motion-preview ./keyframes 0,700,1700,2700,4000
node scripts/validate_viewpoint_motion.mjs viewpoint-motion-v1.json --asset-root .
```

## React Contract

- Runtime import: `motion/react`.
- Feed playback: start once at roughly 55% visibility, never loop, audio off.
- Deterministic playback: external milliseconds override wall-clock animation.
- Reduced motion: render the complete poster or final readable state immediately.
- Expose `window.__cuebookSetTime(ms)` only in preview and export harnesses.
- Prefer transform, opacity, SVG path progress, clip, and direct number interpolation. Avoid layout thrash.
- Keep observed paths solid and future or conditional paths dashed in every frame.

## File Contract

| Purpose | Canonical file |
| --- | --- |
| Motion semantics | `viewpoint-motion-spec-v1.json` |
| Editable runtime | `CuebookViewpointMotion.tsx` |
| Static and reduced-motion fallback | `poster.png` |
| Deterministic QA | `keyframes/*.png` |
| Broad social distribution | `viewpoint.mp4` |
| Optional web derivative | `viewpoint.webm` |

Do not use GIF as the canonical asset. Lottie is suitable only for isolated decorative vector assets; it is not the source of truth for data-bound market charts or Chinese editorial text.

## Hard Gates

- Reject a component that cannot be frozen at an exact millisecond.
- Reject missing first, decisive, or final keyframes.
- Reject a final frame that is blank, mid-transition, or less readable than the poster.
- Reject animation that changes numbers, dates, line shape, hierarchy, or causal meaning without a binding change.
- Reject autoplay audio, infinite loops, unreadable 622px states, and external network assets in frozen outputs.
- Keep motion optional in release recipes. A static viewpoint remains fully publishable.

## Resources

- `assets/CuebookMotionPrimitives.tsx`: deterministic React and Motion primitives.
- `assets/CuebookRemotionAdapter.tsx`: frame-time adapter for video export.
- `references/viewpoint-motion-v1.schema.json`: frozen output manifest.
- `scripts/capture_motion_keyframes.cjs`: deterministic Playwright capture.
- `scripts/validate_viewpoint_motion.mjs`: output and asset validator.
