"""Load source files and profile their actual schemas."""
from pathlib import Path
import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
CACHE = ROOT / "data" / "cache"
REGISTER = RAW / "dublin_city_council_derelict_sites_register_260427.geojson"
BOUNDARIES = RAW / "small_areas_2022_generalised.geojson"
SAPS = RAW / "saps_2022_small_area.csv"

# Verified against the supplied GeoJSON properties, rather than inferred from its name.
REGISTER_FIELDS = {
    "id": "derelict_site_reference_number",
    "description": "derelict_site_description",
    "address": "full_address",
    "on_register": "is_on_current_derelict_sites_register",
    "active_case": "is_active_derelict_site_case",
    "protected": "is_on_current_record_of_protected_structures",
    "council_owned": "is_owned_by_dublin_city_council",
    "date_added": "date_added_to_the_derelict_sites_register",
}
BOUNDARY_KEY = "SA_GUID_2022"
SAPS_KEY = "GUID"
POPULATION = "T1_1AGETT"
HOUSEHOLDS = "T5_1T_H"


def register():
    sites = gpd.read_file(REGISTER)
    missing = set(REGISTER_FIELDS.values()) - set(sites.columns)
    if missing:
        raise ValueError(f"Register columns missing: {sorted(missing)}")
    if sites.crs is None:
        raise ValueError("Register has no CRS")
    return sites


def profile_register():
    sites = register()
    lines = [
        f"CRS: {sites.crs}",
        f"Rows: {len(sites)}",
        f"Columns: {list(sites.columns)}",
        "Sample rows (first 3):",
        sites.head(3).drop(columns="geometry").to_string(index=False),
        f"Geometry types: {sites.geometry.geom_type.value_counts().to_dict()}",
        "Null counts:",
        sites.isna().sum().to_string(),
        f"EPSG:4326 bounds: {sites.to_crs(4326).total_bounds.tolist()}",
        f"EPSG:2157 bounds: {sites.to_crs(2157).total_bounds.tolist()}",
        f"Field map: {REGISTER_FIELDS}",
    ]
    CACHE.mkdir(parents=True, exist_ok=True)
    text = "\n".join(lines) + "\n"
    (CACHE / "register_profile.txt").write_text(text, encoding="utf-8")
    print(text)


def profile_census():
    areas = gpd.read_file(BOUNDARIES)
    saps = pd.read_csv(SAPS, low_memory=False)
    for label, frame in (("Boundaries", areas), ("SAPS", saps)):
        print(f"{label}: {len(frame)} rows, {len(frame.columns)} columns")
        print(list(frame.columns))
    return areas, saps


if __name__ == "__main__":
    profile_register()
    profile_census()
