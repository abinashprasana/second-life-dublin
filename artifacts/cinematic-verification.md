# Cinematic civic atlas — verification

Verified 4 October 2026 against the local production build.

## Automated checks

- Python: six regression tests passed. Covers three scored sites against Python facts/rankings, an unscored site, 134 unique joined records, deterministic shared-boundary handling, export validation, and projected geometry/holes.
- Frontend: four focused tests passed for city framing, ignoring idle gaps, sustained active performance below 30 fps, and normal 60 fps interaction.
- `npm run build`: TypeScript and production build passed. The 3D chunk remains lazy loaded, approximately 249 KB gzip; Vite reports its normal large-chunk warning.
- Evidence and scene export contracts and scoring formula were not changed. Coverage remains 134 / 8 / 126.

## Browser checks

- Desktop 1440 × 1120: default whole-city view, bookmarked site focus, city/site presets, zoom/reset, and layer controls exercised.
- Map marker selection (DS1012), searchable list selection (DS492), keyboard Enter activation, URL updates, and invalid-ID fallback checked.
- Four concepts selected; captions, supporting facts and service category updated together. Community hub at DS1596 displayed seven cached nearby tags; childcare displayed the explicit no-matching-tags message.
- Unscored DS492 retained register/census context and four conceptual choices, with zero score bars.
- Mobile 390 × 844: flat map default, vertically stacked workspace, normal page scroll, controls, search, no horizontal document overflow.
- Missing scene asset, unavailable WebGL, and actual `WEBGL_lose_context` exercised using the local development fixture. Selected site retained with a useful fallback notice.
- Caught and fixed intentional canvas disposal being mistaken for graphics failure. Flat → 3D → concept switching rechecked successfully. Disabled Leaflet zoom animation to avoid callbacks after map removal.
- Reduced-motion fixture: camera preset changes without travel. CSS independently disables reveal, transition and smooth scrolling under the native media query.
- Demand rendering observed idle: concept canvas frame counter remained 24 across separate observations; map counter also remained unchanged while idle.
- Representative text contrast checks: 5.37:1–14.64:1, including source headings, secondary copy, controls, comparison facts and coverage. Light-section keyboard focus was strengthened.
- Local-only fetch guard exercised in verification. Runtime assets, geometry and fonts are bundled locally; no external map tiles, models or data APIs are used.

## Captures

- `cinematic-desktop.jpg`: production city overview and comparison.
- `cinematic-concept.jpg`: production cutaway model and selected-site panel.
- `cinematic-mobile-hero.jpg` and `cinematic-mobile-map.jpg`: mobile opening and workspace.
- `cinematic-mobile-unscored.jpg`: search and evidence-gap copy for DS492.
- `cinematic-interaction.webm`: short live canvas recording showing camera presets and use concepts. Canvas only; HTML controls are documented in the screenshots. Recorded through the development-only MediaRecorder control.

## Remaining physical-device checks and release gate

Real phone touch gestures, screen-reader traversal, native OS reduced-motion settings, and sustained low-end GPU interaction still require physical-device checks. Slow-frame quality detection is unit-tested; it is not a hardware performance benchmark. No claim of a full WCAG audit is made.

Public release remains subject to verification of the register and boundary reuse terms. The existing Streamlit fallback and cached evidence remain available.
