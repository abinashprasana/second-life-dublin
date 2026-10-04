"""Project the existing atlas into metres; polygon interior rings remain holes."""
import math
from pyproj import Transformer

PROJECT = Transformer.from_crs(4326, 2157, always_xy=True)
ORIGIN = [715000, 734000]


def project(lon, lat):
    x, north = PROJECT.transform(lon, lat)
    return [round(x - ORIGIN[0], 3), round(-(north - ORIGIN[1]), 3)]


def polygons(collection):
    result = []
    for feature in collection["features"]:
        geometry = feature["geometry"]
        coordinates = geometry["coordinates"]
        if geometry["type"] == "Polygon":
            coordinates = [coordinates]
        elif geometry["type"] != "MultiPolygon":
            raise ValueError("Scene requires polygon geometry")
        for polygon in coordinates:
            result.append([[project(*point[:2]) for point in ring] for ring in polygon])
    return result


def build_scene(areas, outline, sites):
    land = polygons(outline)
    boundaries = polygons(areas)
    points = [point for polygon in land for ring in polygon for point in ring]
    scene = {"sceneVersion": 1, "crs": "EPSG:2157", "units": "metres",
             "origin": ORIGIN, "axis": "x=east,z=south", "outline": land,
             "areas": boundaries, "ringsM": [400, 800],
             "bounds": [min(p[0] for p in points), min(p[1] for p in points),
                        max(p[0] for p in points), max(p[1] for p in points)],
             "sites": [{"id": site["id"], "position": project(site["position"]["lon"], site["position"]["lat"]),
                        "services": [{"position": project(s["lon"], s["lat"]), "groups": s["groups"]} for s in site["services"]]} for site in sites]}
    if len(scene["sites"]) != 134 or not all(math.isfinite(v) for p in points for v in p):
        raise ValueError("Scene geometry or site count is invalid")
    if any(len(ring) < 4 or ring[0] != ring[-1] for polygon in land + boundaries for ring in polygon):
        raise ValueError("Scene contains an unclosed polygon ring")
    return scene
