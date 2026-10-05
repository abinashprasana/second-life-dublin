# OpenStreetMap coverage: all 134 sites

Verified 4 October 2026 against snapshot `2026-10-04T22:35:50+00:00`.

## What changed

Nearby-service evidence used to cover 8 register sites. It now covers all 134. Every site has a cached file, `data/cache/osm_<site-id>.json`, holding the OpenStreetMap services within 800 m, with the source URL and retrieval date.

The 8 original files were not touched.

## How the evidence was collected

Overpass, the usual OSM query service, was unavailable throughout: the main server returned 504 and two mirrors timed out. Every site was fetched instead from the OSM API `map` endpoint (`https://api.openstreetmap.org/api/0.6/map`), the same method used for the original 8.

- For each site, the request covers a bounding box that encloses its 800 m circle. `src/osm.py` keeps the elements whose tags match one of the four service groups and that lie within 800 m in a straight line, using Irish Transverse Mercator (EPSG:2157).
- The API rate-limited the run (HTTP 509) many times. Each time, the fetch waited 90 seconds and retried, and every retry succeeded.
- Six city-centre sites hold more map data than the API returns in one request (HTTP 400: `DS1311`, `DS1948`, `DS2044`, `DS575A`, `DS843`, `DS871A`). `src/osm.py` now splits those requests into four quarter boxes, recursively if needed, and merges the results by OSM id. The quarters cover exactly the same area, so the data is the same.
- No site was skipped, estimated or filled in.

## Independent checks

Run with `python tests/verify_osm_cache.py 60` from `secondlife/`. The script changes nothing.

| Check | Result |
|:---|:---|
| Files present, one per register site, site id matches file name | 134 / 134 |
| Every file records its source URL and retrieval date | 134 / 134 |
| Services checked | 3,326 |
| Distance recomputed with a different method (great-circle, WGS84) agrees within 3 m and is ≤ 800 m | 3,326 / 3,326 |
| Service group follows from the service's own OSM tags | 3,326 / 3,326 |
| Duplicate services within a file | 0 |
| Random sample of new services looked up live by OSM id: name, tags and position still match | 60 / 60 |
| Sites with no matching services at all | 0 (minimum 2, median 19.5, maximum 77) |

### Identical service lists

Twelve small groups of sites have exactly the same set of nearby services. Each group is a row of neighbouring addresses on one street. For example, `DS898` to `DS902`, `DS953` and `DS954` are within about 40 m of each other, and `DS1380` is 170 m away. Each site's distances were computed separately: in that group the nearest service ranges from 49 m to 109 m depending on the site. They share a list because no service sits near the edge of all their 800 m circles. These are genuine results, not copies.

## Effect on scores

- The supply factor is min–max normalised across every site with OSM evidence, so it now compares all 134 sites. Every score from the old 8-site cohort changed. For example, DS1596 Childcare stays at 60.7, but its Repair workshop score rises from 17.0 to 30.3.
- Highest-scoring use across the 134 sites: Repair workshop 80, Childcare 23, Study space 22, Community hub 9.
- No site is now in the "service evidence missing" state. The code path for an unscored site still exists and is still tested with a simulated site, in case a site is added to the register without evidence.

## Code changes

- `src/osm.py`: tiled fallback for HTTP 400 (`osm_api_services`). `build_osm_cache()` now covers every register site by default.
- `src/export_web.py`: the expected scored count comes from the number of OSM cache files on disk, not a hard-coded 8.
- `src/assistant_core.py`: the uncertainty text no longer says "eight cached sites".
- `web/src/validateAtlas.ts`: checks the scored count against `metadata.scoreCohortSize`, not 8.
- `web/src/ProductApp.tsx`: the comparison note reads the cohort size from the snapshot.
- `tests/`: counts are derived from the data, the unscored path is tested with a simulated site, and `verify_osm_cache.py` was added.

## Tests

- Python: 17 / 17 passed.
- Frontend: 10 / 10 passed.
- TypeScript check and production build passed.
- `src.export_web` validation: status `ok`, 134 sites, 134 scored, 0 failures.

## Limits that still apply

- OSM tagging is volunteer-made and uneven. A missing tag does not prove a service is missing.
- 800 m is straight-line distance, not a walking route.
- These counts describe what OSM had on 4 October 2026.
