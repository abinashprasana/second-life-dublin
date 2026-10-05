"""Independent checks on every cached OSM evidence file. Prints a report; changes nothing.

Run from the project root: python tests/verify_osm_cache.py [live_sample_size]
The live sample looks services up on the OSM API; pass 0 to skip it.
"""
import json, math, random, sys, time, hashlib
import xml.etree.ElementTree as ET
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parents[1]))
import requests
from pyproj import Transformer
from src.load import CACHE
from src.join import SITE_TABLE
from src.osm import groups_for, OSM_API

ORIGINAL = {"DS040", "DS864", "DS905", "DS1012", "DS1369", "DS1596", "DS1868", "DS1982"}
TO_WGS = Transformer.from_crs(2157, 4326, always_xy=True)
sites = {s["site_id"]: s for s in json.loads(SITE_TABLE.read_text(encoding="utf-8"))}
problems, checked_services, fingerprints = [], 0, {}


def haversine(lat1, lon1, lat2, lon2):
    r = 6_371_008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


files = sorted(CACHE.glob("osm_*.json"))
for path in files:
    data = json.loads(path.read_text(encoding="utf-8"))
    sid = path.stem.removeprefix("osm_")
    if data.get("site_id") != sid or sid not in sites:
        problems.append(f"{sid}: file/site id mismatch"); continue
    if data.get("source") not in (OSM_API, "https://overpass-api.de/api/interpreter") or not data.get("retrieved"):
        problems.append(f"{sid}: missing source or retrieval date")
    site = sites[sid]
    slon, slat = TO_WGS.transform(site["x_itm"], site["y_itm"])
    ids = [s["id"] for s in data["services"]]
    if len(ids) != len(set(ids)):
        problems.append(f"{sid}: duplicate service ids")
    for s in data["services"]:
        checked_services += 1
        d = haversine(slat, slon, s["lat"], s["lon"])
        if d > 803 or abs(d - s["distance_m"]) > 3:
            problems.append(f"{sid} {s['id']}: distance {s['distance_m']} vs independent {d:.1f}")
        if groups_for(s["tags"]) != s["groups"] or not s["groups"]:
            problems.append(f"{sid} {s['id']}: groups {s['groups']} don't follow from tags")
    key = hashlib.sha256(json.dumps(sorted(ids)).encode()).hexdigest()
    fingerprints.setdefault(key, []).append(sid)

identical = [v for v in fingerprints.values() if len(v) > 1]
for group in identical:
    pts = [sites[s] for s in group]
    spread = max(math.hypot(a["x_itm"] - b["x_itm"], a["y_itm"] - b["y_itm"]) for a in pts for b in pts)
    if spread > 150:
        problems.append(f"identical service lists for distant sites {group} ({spread:.0f} m apart)")

# Live spot check: look up a random sample of services from the new sites by OSM id.
random.seed(1596)
new_services = [(p.stem[4:], s) for p in files if p.stem[4:] not in ORIGINAL
                for s in json.loads(p.read_text(encoding="utf-8"))["services"]]
sample = random.sample(new_services, min(int(sys.argv[1]) if len(sys.argv) > 1 else 40, len(new_services)))
live_ok = live_bad = 0
for sid, s in sample:
    kind, oid = s["id"].split("/")
    try:
        r = requests.get(f"https://api.openstreetmap.org/api/0.6/{kind}/{oid}", timeout=30,
                         headers={"User-Agent": "SecondLife/1.0 (civic site evidence product)"})
        if r.status_code == 410:
            problems.append(f"{sid} {s['id']}: deleted from OSM since retrieval"); live_bad += 1; continue
        r.raise_for_status()
        el = ET.fromstring(r.content).find(kind)
        tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
        same_groups = groups_for(tags) == s["groups"]
        same_name = tags.get("name") == s["tags"].get("name")
        close = True
        if kind == "node":
            close = haversine(float(el.get("lat")), float(el.get("lon")), s["lat"], s["lon"]) < 5
        if same_groups and same_name and close:
            live_ok += 1
        else:
            live_bad += 1
            problems.append(f"{sid} {s['id']}: live OSM differs (groups {same_groups}, name {same_name}, position {close})")
    except Exception as exc:
        problems.append(f"{sid} {s['id']}: live lookup error {str(exc)[:80]}")
    time.sleep(1.5)

print(f"FILES {len(files)} (original {len([f for f in files if f.stem[4:] in ORIGINAL])}, new {len([f for f in files if f.stem[4:] not in ORIGINAL])})")
print(f"SERVICES CHECKED {checked_services}")
print(f"IDENTICAL LISTS {identical}")
print(f"LIVE SAMPLE {live_ok} match / {live_bad} differ of {len(sample)}")
print(f"PROBLEMS {len(problems)}")
for p in problems:
    print("  -", p)
