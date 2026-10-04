"""Transparent evidence scoring. Scores are leads for discussion, not recommendations."""
import json
import csv
from functools import lru_cache
import networkx as nx
from .load import CACHE
from .join import SITE_TABLE
from .osm import GROUPS

USES = {
    "Childcare": ("childcare", "share_0_14"),
    "Study space": ("study", "share_15_24"),
    "Repair workshop": ("repair", "population_density"),
    "Community hub": ("community", "population"),
}
FEATURES = ("join_succeeded", "population", "share_0_14", "share_15_24",
            "share_65_plus", "households", "population_density")


def service_stats(services):
    stats = {}
    for group in GROUPS:
        distances = [e["distance_m"] for e in services if group in e["groups"]]
        stats[group] = {"within_400m": sum(d <= 400 for d in distances),
                        "within_800m": len(distances),
                        "nearest_m": min(distances) if distances else None}
    return stats


@lru_cache(maxsize=1)
def load_table():
    rows = json.loads(SITE_TABLE.read_text(encoding="utf-8"))
    for row in rows:
        path = CACHE / f"osm_{row['site_id']}.json"
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        row["osm_available"] = data is not None
        row["osm_source"] = data["source"] if data else None
        row["osm_retrieved"] = data["retrieved"] if data else None
        row["service_stats"] = service_stats(data["services"]) if data else None
        present = sum(bool(row[k]) if k == "join_succeeded" else row[k] is not None for k in FEATURES)
        # OSM receives three slots because every candidate use needs it.
        row["coverage"] = (present + (3 if data else 0)) / 10
    return rows


def norm(value, values, reverse=False):
    if value is None:
        return None
    lo, hi = min(values), max(values)
    score = 0.5 if hi == lo else (value - lo) / (hi - lo)
    return 1 - score if reverse else score


def coverage_badge(value):
    if value >= 0.85:
        return "Good"
    if value >= 0.5:
        return "Partial"
    return "Very low"


def unanswered(row):
    owner = str(row.get("council_owned") or "").lower()
    protected = str(row.get("protected") or "").lower()
    questions = ["What is the building's current condition?",
                 "What planning permission or change-of-use approval would be needed?"]
    if owner == "yes":
        questions.append("Dublin City Council ownership is flagged; who controls this particular site and can authorise a new use?")
    elif owner == "no":
        questions.append("The site is not flagged as council-owned; who owns it and would they support a new use?")
    else:
        questions.append("Who owns the site? Ownership is not available in the register data.")
    if protected == "yes":
        questions.append("The site is flagged on the Record of Protected Structures; what conservation constraints apply?")
    elif protected == "no":
        questions.append("Are there heritage or conservation constraints beyond the protected-structure flag?")
    else:
        questions.append("Is the site protected, and what conservation constraints apply?")
    return questions


def rank_uses(site_id):
    rows = load_table()
    row = next((r for r in rows if r["site_id"] == site_id), None)
    if row is None:
        raise KeyError(site_id)
    result = []
    for use, (group, demand_key) in USES.items():
        stats = row["service_stats"][group] if row["service_stats"] else None
        supply = stats["within_800m"] if stats else None
        demand = row[demand_key]
        supply_vals = [r["service_stats"][group]["within_800m"] for r in rows if r["service_stats"]]
        demand_vals = [r[demand_key] for r in rows if r[demand_key] is not None]
        low_supply = norm(supply, supply_vals, reverse=True) if supply_vals else None
        demand_norm = norm(demand, demand_vals) if demand_vals else None
        factors = {"low_nearby_supply": low_supply, demand_key: demand_norm}
        facts = []
        if stats:
            nearest = "not available" if stats["nearest_m"] is None else f"{stats['nearest_m']:.0f} m"
            facts.append(f"OSM {group}: {stats['within_400m']} within 400 m; {supply} within 800 m; nearest {nearest}.")
        else:
            facts.append(f"OSM {group} coverage: not available.")
        if demand_key.startswith("share_"):
            label = {"share_0_14": "aged 0–14", "share_15_24": "aged 15–24"}[demand_key]
            facts.append(f"CSO Small Area share {label}: {demand * 100:.1f}%." if demand is not None else f"CSO Small Area share {label}: not available.")
        elif demand_key == "population_density":
            facts.append(f"CSO Small Area density: {demand:.0f} residents/km²; {row['households']:.0f} households." if demand is not None and row['households'] is not None else "CSO density or households: not available.")
            household_vals = [r["households"] for r in rows if r["households"] is not None]
            factors["households"] = norm(row["households"], household_vals) if household_vals else None
        else:
            facts.append(f"CSO Small Area population: {demand:.0f}." if demand is not None else "CSO Small Area population: not available.")
        if low_supply is None or demand_norm is None or (use == "Repair workshop" and factors["households"] is None):
            score = None
        elif use == "Repair workshop":
            score = 100 * (0.5 * low_supply + 0.25 * demand_norm + 0.25 * factors["households"])
        else:
            score = 100 * (0.5 * low_supply + 0.5 * demand_norm)
        result.append({"use": use, "score": None if score is None else round(score, 1),
                       "factors": factors, "facts": facts, "coverage": row["coverage"],
                       "badge": coverage_badge(row["coverage"]), "unanswered": unanswered(row)})
    return sorted(result, key=lambda r: (r["score"] is None, -(r["score"] or 0), r["use"]))


def evidence_graph():
    graph = nx.Graph()
    for row in load_table():
        site_key = f"site:{row['site_id']}"
        graph.add_node(site_key, kind="site")
        if row["small_area_id"]:
            area_key = f"sa:{row['small_area_id']}"
            graph.add_node(area_key, kind="small_area")
            graph.add_edge(site_key, area_key, relation="in_small_area")
        path = CACHE / f"osm_{row['site_id']}.json"
        if path.exists():
            for service in json.loads(path.read_text(encoding="utf-8"))["services"]:
                key = f"osm:{service['id']}"
                graph.add_node(key, kind="service", groups=service["groups"])
                graph.add_edge(site_key, key, weight=service["distance_m"], relation="nearby")
    return graph


def export_evidence_table():
    """One auditable row per register site, including missing-data flags."""
    path = CACHE / "site_evidence.csv"
    columns = ["site_id", "small_area_id", "population", "share_0_14", "share_15_24",
               "share_65_plus", "households", "population_density", "missing_join",
               "missing_saps", "missing_osm", "coverage"]
    for group in GROUPS:
        columns += [f"{group}_within_400m", f"{group}_within_800m", f"{group}_nearest_m"]
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        for site in load_table():
            row = {k: site.get(k) for k in columns}
            row["missing_join"] = not site["join_succeeded"]
            row["missing_saps"] = any(site[k] is None for k in ("population", "share_0_14",
                                                                  "share_15_24", "share_65_plus", "households"))
            row["missing_osm"] = not site["osm_available"]
            for group in GROUPS:
                stats = site["service_stats"][group] if site["service_stats"] else None
                for name, suffix in (("within_400m", "within_400m"), ("within_800m", "within_800m"), ("nearest_m", "nearest_m")):
                    row[f"{group}_{suffix}"] = stats[name] if stats else None
            writer.writerow(row)
    return path


if __name__ == "__main__":
    for row in load_table()[:3]:
        print(row["site_id"], rank_uses(row["site_id"]))
    graph = evidence_graph()
    print(f"Graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")
    print(f"Evidence table: {export_evidence_table()}")
