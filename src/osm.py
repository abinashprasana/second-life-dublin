"""Fetch and cache OSM service evidence; API bbox fallback when Overpass is blocked."""
import json
import math
import time
from datetime import date
from pathlib import Path
import xml.etree.ElementTree as ET
import requests
from pyproj import Transformer
from .load import CACHE
from .join import SITE_TABLE

TO_WGS = Transformer.from_crs(2157, 4326, always_xy=True)
TO_ITM = Transformer.from_crs(4326, 2157, always_xy=True)
GROUPS = ("childcare", "study", "repair", "community")
OVERPASS = "https://overpass-api.de/api/interpreter"
OSM_API = "https://api.openstreetmap.org/api/0.6/map"


def groups_for(tags):
    amenity, shop, office, craft = (tags.get(k, "") for k in ("amenity", "shop", "office", "craft"))
    groups = set()
    if amenity in {"kindergarten", "childcare"}:
        groups.add("childcare")
    if amenity in {"library", "community_centre", "coworking_space"} or office == "coworking":
        groups.add("study")
    if (craft in {"shoemaker", "electronics_repair", "bicycle_repair", "repair", "key_cutter"}
            or shop in {"second_hand", "charity", "bicycle", "electronics_repair"}
            or amenity == "recycling"):
        groups.add("repair")
    if amenity in {"community_centre", "social_centre", "arts_centre", "place_of_worship"}:
        groups.add("community")
    return sorted(groups)


def overpass_query(lat, lon):
    around = f"(around:800,{lat:.7f},{lon:.7f})"
    clauses = [
        f'nwr{around}["amenity"~"^(kindergarten|childcare|library|community_centre|coworking_space|recycling|social_centre|arts_centre|place_of_worship)$"];',
        f'nwr{around}["office"="coworking"];',
        f'nwr{around}["shop"~"^(second_hand|charity|bicycle|electronics_repair)$"];',
        f'nwr{around}["craft"~"^(shoemaker|electronics_repair|bicycle_repair|repair|key_cutter)$"];',
    ]
    return "[out:json][timeout:35];(" + "".join(clauses) + ");out center;"


def parse_overpass(response):
    result = []
    for element in response.get("elements", []):
        tags = element.get("tags", {})
        groups = groups_for(tags)
        pos = element.get("center", element)
        if groups and "lat" in pos and "lon" in pos:
            result.append({"id": f"{element['type']}/{element['id']}", "lat": pos["lat"],
                           "lon": pos["lon"], "tags": tags, "groups": groups})
    return result


def parse_osm_xml(content):
    root = ET.fromstring(content)
    nodes = {e.get("id"): (float(e.get("lat")), float(e.get("lon"))) for e in root.findall("node")}
    result = []
    for kind in ("node", "way", "relation"):
        for element in root.findall(kind):
            tags = {t.get("k"): t.get("v") for t in element.findall("tag")}
            groups = groups_for(tags)
            if not groups:
                continue
            if kind == "node":
                pos = nodes.get(element.get("id"))
            elif kind == "way":
                points = [nodes.get(n.get("ref")) for n in element.findall("nd")]
                points = [p for p in points if p]
                pos = (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)) if points else None
            else:
                pos = None  # relation geometry is not guaranteed in the bbox response
            if pos:
                result.append({"id": f"{kind}/{element.get('id')}", "lat": pos[0],
                               "lon": pos[1], "tags": tags, "groups": groups})
    return result


def nearby(site, elements):
    output = []
    for e in elements:
        x, y = TO_ITM.transform(e["lon"], e["lat"])
        metres = math.hypot(x - site["x_itm"], y - site["y_itm"])
        if metres <= 800:
            output.append({**e, "distance_m": round(metres, 1)})
    return output


def fetch_site(site, provider="osm_api"):
    path = CACHE / f"osm_{site['site_id']}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    lon, lat = TO_WGS.transform(site["x_itm"], site["y_itm"])
    last_error = None
    for attempt in range(3):
        try:
            if provider == "overpass":
                response = requests.post(OVERPASS, data={"data": overpass_query(lat, lon)}, timeout=45,
                                         headers={"User-Agent": "SecondLife/1.0 (civic site evidence product)"})
                response.raise_for_status()
                services = parse_overpass(response.json())
                source = OVERPASS
            else:
                # 800 m circle enclosed by a latitude/longitude bbox. Distances are filtered below.
                lat_delta = 800 / 111_000
                lon_delta = 800 / (111_000 * math.cos(math.radians(lat)))
                bbox = f"{lon-lon_delta:.7f},{lat-lat_delta:.7f},{lon+lon_delta:.7f},{lat+lat_delta:.7f}"
                response = requests.get(OSM_API, params={"bbox": bbox}, timeout=90,
                                        headers={"User-Agent": "SecondLife/1.0 (civic site evidence product)"})
                response.raise_for_status()
                services = parse_osm_xml(response.content)
                source = OSM_API
            result = {"site_id": site["site_id"], "source": source, "retrieved": date.today().isoformat(),
                      "services": nearby(site, services)}
            path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            return result
        except Exception as exc:
            last_error = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"OSM fetch failed for {site['site_id']}: {last_error}")


def selected_sites(sites, n=8):
    # Spread a small fallback sample across Dublin rather than choosing neighbouring records.
    eligible = [s for s in sites if str(s["on_register"]).lower() == "yes"]
    chosen = [min(eligible, key=lambda s: s["site_id"])]
    while len(chosen) < min(n, len(eligible)):
        remaining = [s for s in eligible if s not in chosen]
        chosen.append(max(remaining, key=lambda s: min(math.hypot(s["x_itm"] - c["x_itm"],
                                                         s["y_itm"] - c["y_itm"]) for c in chosen)))
    return chosen


def build_osm_cache(n=8, provider="osm_api"):
    sites = json.loads(SITE_TABLE.read_text(encoding="utf-8"))
    picked = selected_sites(sites, n)
    for i, site in enumerate(picked, 1):
        path = CACHE / f"osm_{site['site_id']}.json"
        if not path.exists() and i > 1:
            time.sleep(2)
        result = fetch_site(site, provider)
        print(f"{i}/{len(picked)} {site['site_id']}: {len(result['services'])} services, {result['source']}", flush=True)


if __name__ == "__main__":
    build_osm_cache()
