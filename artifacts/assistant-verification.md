# Local evidence assistant verification

Verified 4 October 2026 against snapshot `2026-10-04T14:10:06+00:00`.

## Delivered

- FastAPI on `127.0.0.1:8765`, serving the production frontend and two assistant endpoints.
- Ollama `qwen3:4b` (digest prefix `359d7dd4bcda`), thinking disabled, temperature zero, JSON schema output, 8192-token context.
- In-memory site conversation, explicit two-use comparison, source references, filter previews, map/list application, clear search and cancellation.
- Python resolves filters and renders exact snapshot facts. The model interprets questions and selects evidence; it does not compose unrestricted factual prose. Existing scores and static exports are unchanged.
- Loopback inference only, unexpected origins rejected, bounded JSON requests/history/output, one active request, 60-second deadline, no question logging or cloud fallback.

## Checks

- Python: 17 tests passed, including existing data/scoring tests, filter/null rules, citation rejection, origin restrictions, snapshot mismatch, runtime failure and disconnect cancellation.
- Frontend: 10 tests passed, including stale-answer cancellation and existing map picking/camera regressions. Run `npm test` in `web`.
- TypeScript and production build passed. Vite retains its existing large lazy 3D chunk warning (about 249 KB gzip).
- Live model: **24/24 representative questions passed**. See `assistant-evaluation.json` for the synthetic questions, full responses and deterministic expectations. No invented numeric facts, scores or source references were returned. Scored and unscored comparisons, empty results, ownership/planning gaps, ambiguous criteria and instruction-override attempts were included.
- Early evaluation exposed unwanted filters and confused census fields. Adding explicit field examples and the complete response schema to the prompt corrected those cases before the final 24-case run. This finite evaluation does not guarantee correct interpretation of every future question; visible filters remain essential.
- Browser: real explanation, two-use comparison, source-link expansion, natural-language search, eight-result preview, eight flat-map markers, matching site list, switching the filtered view to 3D, clearing to 134 sites, cancellation, conversation reset during a site change, keyboard focus, mobile flat-map default and static-only service-unavailable state checked.
- Desktop and 390 px mobile screenshots saved alongside this report. Physical touch-device and screen-reader testing remain outstanding.

## Local performance

This computer has approximately 16 GB RAM and Intel Iris Xe graphics. Ollama reports **3.9 GB** for the loaded model/context and **100% CPU** processing.

For the same eight-site search, after explicitly unloading this model: **50.13 s cold**, **4.66 s warm**. Both returned the expected eight IDs. See `assistant-timing.json`.

Across the final evaluation, subsequent requests ranged from **4.55 to 33.37 s**, median **13.67 s**. The first request took 39.19 s. These are observations on this machine, not latency guarantees; competing workloads can reach the timeout.

Inference requests use only the local Ollama API after model download. No network adapter was disabled during verification. No external tiles, fonts, tools or model calls were added.

## Run and release

From `secondlife`, run `./run-assistant.ps1`, then open `http://127.0.0.1:8765`. Ollama must be running. Installation and Vite development instructions are in the README. The project-local `.assistant-deps` installation used here leaves the existing `.deps` folder intact.

The static-only frontend and Streamlit fallback remain available. This is a local release; public distribution still depends on verification of the register and boundary reuse terms.
