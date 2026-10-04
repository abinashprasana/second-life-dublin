# Ink-blue visual update

Completed 4 October 2026.

- Shared CSS/Leaflet/Three.js palette, ivory reading sections, apricot selections and darker orange text accents.
- Hero SVGs generated from existing projected geometry, including interior rings. Brief 550 ms entrance; static map outlines and grid treatments in lower sections.
- TypeScript and production build pass; all 10 frontend regression tests pass. Existing lazy 3D chunk size warning remains.
- Browser checks: desktop and 390 px mobile, both maps, four concept choices, static concept fallback, scored and unscored sites, evidence filter, search, and a real local assistant answer.
- Rendered text contrast scan found no normal-text failures after darkening small orange headings. The decorative map-tab glyph has a 3.36:1 ratio and is accompanied by its text label. This is not a complete accessibility certification.
- Decorative layers are non-interactive; mobile has no horizontal overflow and omits the hero's fine boundary layer. The CSS reduced-motion override disables animations/transitions; an OS-level reduced-motion and physical touch-device retest remains outstanding.
- Data exports, scoring, assistant logic and source attribution are unchanged. No continuous background animation or additional WebGL canvas was added.

Screenshots: `ink-blue-evidence-desktop.png`, `ink-blue-evidence-mobile.png`, `ink-blue-next-checks.png`.
