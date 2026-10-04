# Spatial workspace verification — 4 October 2026

Passed:

- Full Python export: 134 sites, eight scored, 126 unscored, 2,261 Small Areas. Scene report includes polygon and interior-ring counts.
- Six Python tests, including three scored-site parity checks, an unscored site, deterministic joins, validation rejection, scene coordinates, and polygon holes.
- TypeScript checking and production build. The 3D bundle is loaded separately (about 248 KB gzip).
- Desktop dimensional map and all four concept states; use selection changes the evidence and caption. Keyboard activation tested.
- Flat-map marker selection, site search, bookmarked site loading, and unscored concept exploration without scores.
- Mobile 390 × 844 viewport: flat view by default, 134 pins after loading, optional 3D, no horizontal overflow.
- Missing scene, unavailable WebGL, and actual `WEBGL_lose_context` recovery through the local verification page. Site selection survives context loss.
- Demand renderer frame counter remains unchanged when idle. Reduced-motion simulation settles in one frame; CSS also disables interface transitions under the native reduced-motion media query.
- Runtime data uses local fetches; verification blocks cross-origin fetches. Fonts and rendering assets are bundled locally.

Screenshots: `desktop-atlas.jpg`, `desktop-concept.jpg`, `mobile-atlas.jpg`.

Reproduce failure checks with `npm run dev -- --port 4175`, then visit `/verify.html`. This page is not included in the production build. Parameters `missingScene`, `noWebGL`, `reducedMotion`, and `slowFrames` exercise relevant paths.

Remaining device checks: physical touch gestures and sustained performance on a low-end GPU. Automatic pixel-ratio reduction is implemented but has not been measured on that hardware. Public release still depends on the existing source-reuse verification gate.
