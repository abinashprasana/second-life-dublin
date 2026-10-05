"""Build the static, offline evidence snapshot consumed by the React frontend."""
import hashlib
import json
import math
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
from pyproj import Transformer

from .load import BOUNDARIES, CACHE, RAW, ROOT
from .score import load_table, rank_uses
from .summary import templated_summary
from .scene import build_scene

OUTPUT = ROOT / "web" / "public" / "data"
TO_WGS = Transformer.from_crs(2157, 4326, always_xy=True)
SCHEMA_VERSION = 2
SCORING_METHOD_VERSION = "1.0"
SOURCE_RETRIEVED = "2026-10-04"


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def site_record(row):
    lon, lat = TO_WGS.transform(row["x_itm"], row["y_itm"])
    ranked = rank_uses(row["site_id"])
    osm_path = CACHE / f"osm_{row['site_id']}.json"
    services = json.loads(osm_path.read_text(encoding="utf-8"))["services"] if osm_path.exists() else []
    return {
        "id": row["site_id"],
        "title": row["description"],
        "address": None if row["address"] in (None, "No Address") else row["address"],
        "position": {"lat": lat, "lon": lon},
        "register": {
            "dateAdded": str(row["date_added"]).split()[0] if row["date_added"] else None,
            "onRegister": row["on_register"],
            "activeCase": row["active_case"],
            "protected": row["protected"],
            "councilOwned": row["council_owned"],
        },
        "smallArea": {
            "id": row["small_area_id"],
            "population": row["population"],
            "share0to14": row["share_0_14"],
            "share15to24": row["share_15_24"],
            "share65plus": row["share_65_plus"],
            "households": row["households"],
            "density": row["population_density"],
        },
        "coverage": {"fraction": row["coverage"], "badge": ranked[0]["badge"],
                     "hasOsm": row["osm_available"], "osmRetrieved": row["osm_retrieved"],
                     "evidenceStatus": "scored" if row["osm_available"] else "missing_osm"},
        "uses": [{"use": item["use"], "score": item["score"], "facts": item["facts"],
                  "factors": item["factors"]} for item in ranked],
        "unanswered": ranked[0]["unanswered"],
        "summary": templated_summary(row, ranked),
        "services": [{"id": item["id"], "lat": item["lat"], "lon": item["lon"],
                      "groups": item["groups"], "distanceM": item["distance_m"]}
                     for item in services],
    }


def export_areas():
    areas = gpd.read_file(BOUNDARIES)
    if "COUNTY_ENGLISH" not in areas.columns:
        raise ValueError("Boundary file lacks COUNTY_ENGLISH")
    areas = areas.loc[areas["COUNTY_ENGLISH"] == "DUBLIN CITY", ["geometry"]].to_crs(2157)
    if len(areas) != 2261 or areas.geometry.isna().any() or areas.geometry.is_empty.any():
        raise ValueError("Dublin City Small Area geometry is incomplete")
    areas["geometry"] = areas.geometry.simplify(35, preserve_topology=True)
    areas = areas.to_crs(4326)
    area_geojson = json.loads(areas.to_json())
    outline = CACHE / "dublin_outline.geojson"
    if not outline.exists():
        raise FileNotFoundError(outline)
    outline_geojson = json.loads(outline.read_text(encoding="utf-8"))
    for name, geometry in (("areas", area_geojson), ("outline", outline_geojson)):
        if geometry.get("type") != "FeatureCollection" or not geometry.get("features"):
            raise ValueError(f"{name} geometry is not a usable FeatureCollection")
        if any(not feature.get("geometry") for feature in geometry["features"]):
            raise ValueError(f"{name} geometry has an empty feature")
    return area_geojson, outline_geojson


def validate_snapshot(snapshot):
    errors = []
    sites = snapshot.get("sites", [])
    metadata = snapshot.get("metadata", {})
    if metadata.get("schemaVersion") != SCHEMA_VERSION:
        errors.append("Unexpected schema version")
    if len(sites) != 134 or len({site.get("id") for site in sites}) != 134:
        errors.append("Expected 134 unique sites")
    scored = [site for site in sites if site.get("coverage", {}).get("evidenceStatus") == "scored"]
    if not scored or len(scored) != metadata.get("scoreCohortSize"):
        errors.append(f"Expected {metadata.get('scoreCohortSize')} scored sites; found {len(scored)}")
    for site in sites:
        site_id = site.get("id", "unknown")
        position = site.get("position", {})
        lat, lon = position.get("lat"), position.get("lon")
        if not (isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and
                math.isfinite(lat) and math.isfinite(lon) and 53.0 <= lat <= 53.6 and -6.6 <= lon <= -5.9):
            errors.append(f"{site_id}: invalid coordinate")
        covered = site.get("coverage", {}).get("evidenceStatus") == "scored"
        if covered != site.get("coverage", {}).get("hasOsm"):
            errors.append(f"{site_id}: inconsistent evidence status")
        uses = site.get("uses", [])
        if len(uses) != 4 or len({item.get("use") for item in uses}) != 4:
            errors.append(f"{site_id}: expected four unique uses")
        for item in uses:
            score = item.get("score")
            if covered and (not isinstance(score, (int, float)) or not math.isfinite(score) or not 0 <= score <= 100):
                errors.append(f"{site_id}: invalid score")
            if not covered and score is not None:
                errors.append(f"{site_id}: unscored site has a score")
            if not item.get("facts"):
                errors.append(f"{site_id}: missing supporting facts")
    if metadata.get("siteCount") != len(sites) or metadata.get("osmSiteCount") != len(scored):
        errors.append("Metadata counts differ from site records")
    sources = metadata.get("sources", [])
    if not sources or any(not all(source.get(key) for key in ("name", "publisher", "url", "retrieved")) for source in sources):
        errors.append("Source provenance is incomplete")
    if errors:
        raise ValueError("Export validation failed: " + "; ".join(errors[:20]))
    return {"siteCount": len(sites), "scoredCount": len(scored),
            "unscoredCount": len(sites) - len(scored),
            "missingSmallArea": sum(site["smallArea"]["id"] is None for site in sites),
            "missingPopulation": sum(site["smallArea"]["population"] is None for site in sites)}


def export():
    report_path = CACHE / "export_build_report.json"
    try:
        sites = [site_record(row) for row in load_table()]
        areas, outline = export_areas()
        scene = build_scene(areas, outline, sites)
        snapshot = {
            "metadata": {
                "schemaVersion": SCHEMA_VERSION,
                "scoringMethodVersion": SCORING_METHOD_VERSION,
                "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "title": "Second Life — Dublin City evidence atlas",
                "retrieved": SOURCE_RETRIEVED,
                "siteCount": len(sites),
                "osmSiteCount": sum(site["coverage"]["hasOsm"] for site in sites),
                # Counted from the cache files on disk so a missed join fails validation.
                "scoreCohortSize": len(list(CACHE.glob("osm_*.json"))),
                "sources": [
                    {"name": "Dublin City Council derelict sites register", "publisher": "Dublin City Council",
                     "url": "https://data.smartdublin.ie/dataset/derelict-site-register", "retrieved": SOURCE_RETRIEVED},
                    {"name": "Census 2022 Small Area Population Statistics", "publisher": "CSO",
                     "url": "https://www.cso.ie/en/census/census2022/census2022smallareapopulationstatistics/", "retrieved": SOURCE_RETRIEVED},
                    {"name": "2022 Small Areas — generalised 20m", "publisher": "Tailte Éireann",
                     "url": "https://data.gov.ie/dataset/cso-small-areas-national-statistical-boundaries-2022-generalised-20m", "retrieved": SOURCE_RETRIEVED},
                    {"name": "OpenStreetMap service tags", "publisher": "OpenStreetMap contributors",
                     "url": "https://www.openstreetmap.org/copyright", "retrieved": SOURCE_RETRIEVED},
                ],
            }, "sites": sites,
        }
        counts = validate_snapshot(snapshot)
        inputs = [RAW / "dublin_city_council_derelict_sites_register_260427.geojson",
                  RAW / "saps_2022_small_area.csv", BOUNDARIES, CACHE / "site_census.json",
                  CACHE / "dublin_outline.geojson", *sorted(CACHE.glob("osm_*.json"))]
        join_report = CACHE / "join_report.json"
        report = {"status": "ok", "generatedAt": snapshot["metadata"]["generatedAt"],
                  "schemaVersion": SCHEMA_VERSION, **counts,
                  "smallAreaCount": len(areas["features"]),
                  "sceneVersion": scene["sceneVersion"],
                  "scenePolygonCount": len(scene["areas"]),
                  "sceneHoleCount": sum(len(polygon) - 1 for polygon in scene["areas"] + scene["outline"]),
                  "ambiguousMatches": json.loads(join_report.read_text(encoding="utf-8")).get("ambiguousMatches", []) if join_report.exists() else [],
                  "sourceChecksums": {str(path.relative_to(ROOT)): checksum(path) for path in inputs},
                  "validationFailures": []}
        OUTPUT.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="secondlife-export-", dir=OUTPUT.parent) as directory:
            temporary = Path(directory)
            for name, value in (("atlas.json", snapshot), ("dublin_areas.geojson", areas),
                                ("dublin_outline.geojson", outline), ("dublin_scene.json", scene), ("build_report.json", report)):
                (temporary / name).write_text(json.dumps(value, ensure_ascii=False,
                    allow_nan=False, separators=(",", ":")), encoding="utf-8")
            for file in temporary.iterdir():
                os.replace(file, OUTPUT / file.name)
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Exported {counts['siteCount']} sites, {counts['scoredCount']} scored, {report['smallAreaCount']} Small Areas")
        return snapshot
    except Exception as exc:
        CACHE.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps({"status": "failed", "validationFailures": [str(exc)]}, indent=2), encoding="utf-8")
        raise


if __name__ == "__main__":
    export()
