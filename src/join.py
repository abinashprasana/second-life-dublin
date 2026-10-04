"""Point-in-polygon join from register sites to 2022 Small Areas and SAPS."""
import json
import pandas as pd
import geopandas as gpd
from .load import (ROOT, CACHE, BOUNDARIES, SAPS, register, REGISTER_FIELDS,
                   BOUNDARY_KEY, SAPS_KEY, POPULATION, HOUSEHOLDS)

AGE_COLUMNS = {
    "share_0_14": [f"T1_1AGE{i}T" for i in range(15)],
    "share_15_24": [f"T1_1AGE{i}T" for i in range(15, 20)] + ["T1_1AGE20_24T"],
    "share_65_plus": [f"T1_1AGE{x}T" for x in ("65_69", "70_74", "75_79", "80_84", "GE_85")],
}
SITE_TABLE = CACHE / "site_census.json"


def format_date(val):
    if pd.isna(val) or val is None or str(val).lower() in ("none", "nan", "nat", ""):
        return None
    try:
        dt = pd.to_datetime(val)
        if pd.isna(dt):
            return None
        return dt.strftime("%Y-%m-%d")
    except Exception:
        s = str(val).strip()
        return s[:10] if len(s) >= 10 else s


def resolve_join_matches(joined):
    """Choose a stable Small Area when a point intersects a shared boundary."""
    site_key = REGISTER_FIELDS["id"]
    duplicates = joined.loc[joined.duplicated(subset=site_key, keep=False)]
    ambiguous = []
    for site_id, matches in duplicates.groupby(site_key, sort=True):
        candidates = sorted({str(value) for value in matches[BOUNDARY_KEY].dropna()})
        if len(candidates) > 1:
            ambiguous.append({"siteId": str(site_id), "smallAreaIds": candidates,
                              "chosen": candidates[0]})
    resolved = joined.assign(_sort_key=joined[BOUNDARY_KEY].fillna("~").astype(str))
    resolved = resolved.sort_values([site_key, "_sort_key"]).drop_duplicates(subset=site_key).drop(columns="_sort_key")
    return resolved, ambiguous


def build_join():
    sites = register().to_crs(2157)
    areas = gpd.read_file(BOUNDARIES)
    saps = pd.read_csv(SAPS, dtype={SAPS_KEY: str}, low_memory=False)
    expected = {BOUNDARY_KEY, "COUNTY_ENGLISH"}
    if not expected <= set(areas.columns):
        raise ValueError(f"Boundary columns missing: {expected - set(areas.columns)}")
    needed = {SAPS_KEY, POPULATION, HOUSEHOLDS, *sum(AGE_COLUMNS.values(), [])}
    if not needed <= set(saps.columns):
        raise ValueError(f"SAPS columns missing: {needed - set(saps.columns)}")
    print(f"Register: {len(sites)} rows; boundaries: {len(areas)}; SAPS: {len(saps)}")
    print(f"Boundary columns: {list(areas.columns)}")
    print(f"SAPS columns: {list(saps.columns)}")
    areas = areas[areas["COUNTY_ENGLISH"].astype(str).str.contains("DUBLIN", case=False, na=False)].to_crs(2157)
    areas["area_km2"] = areas.geometry.area / 1_000_000
    joined = gpd.sjoin(sites, areas[[BOUNDARY_KEY, "area_km2", "geometry"]], how="left", predicate="intersects")
    # A point on a shared boundary can intersect two polygons. Pick the same
    # Small Area on every rebuild and record the ambiguity for review.
    joined, ambiguous = resolve_join_matches(joined)
    if len(joined) != len(sites):
        raise ValueError("Spatial join did not produce one row per site")
    saps = saps.set_index(SAPS_KEY)
    records = []
    for _, row in joined.iterrows():
        guid = row.get(BOUNDARY_KEY)
        census = saps.loc[guid] if pd.notna(guid) and guid in saps.index else None
        def number(column):
            if census is None:
                return None
            value = pd.to_numeric(census.get(column), errors="coerce")
            return None if pd.isna(value) else float(value)
        pop = number(POPULATION)
        area = row.get("area_km2")
        area = None if pd.isna(area) else float(area)
        record = {
            "site_id": str(row[REGISTER_FIELDS["id"]]),
            "description": row[REGISTER_FIELDS["description"]],
            "address": row[REGISTER_FIELDS["address"]],
            "on_register": row[REGISTER_FIELDS["on_register"]],
            "active_case": row[REGISTER_FIELDS["active_case"]],
            "protected": row[REGISTER_FIELDS["protected"]],
            "council_owned": row[REGISTER_FIELDS["council_owned"]],
            "date_added": format_date(row[REGISTER_FIELDS["date_added"]]),
            "small_area_id": None if pd.isna(guid) else str(guid),
            "join_succeeded": census is not None,
            "population": pop,
            "households": number(HOUSEHOLDS),
            "area_km2": area,
            "population_density": pop / area if pop is not None and area and area > 0 else None,
            "x_itm": float(row.geometry.x), "y_itm": float(row.geometry.y),
        }
        for key, columns in AGE_COLUMNS.items():
            nums = [number(c) for c in columns]
            record[key] = sum(nums) / pop if pop and all(n is not None for n in nums) else None
        records.append(record)
    CACHE.mkdir(parents=True, exist_ok=True)
    SITE_TABLE.write_text(json.dumps(records, indent=2, default=str), encoding="utf-8")
    (CACHE / "join_report.json").write_text(json.dumps({"siteCount": len(records),
        "joinedCount": sum(r["join_succeeded"] for r in records),
        "ambiguousMatches": ambiguous}, indent=2), encoding="utf-8")
    print(f"Joined sites: {sum(r['join_succeeded'] for r in records)}/{len(records)}")
    print(f"Missing census fields: { {k: sum(r[k] is None for r in records) for k in ('population','share_0_14','share_15_24','share_65_plus','households')} }")
    return records


if __name__ == "__main__":
    build_join()
