"""Second Life: evidence leads for Dublin derelict sites."""
import json
import folium
import streamlit as st
from streamlit_folium import st_folium
from pyproj import Transformer
from src.load import CACHE
from src.score import load_table, rank_uses, coverage_badge
from src.summary import templated_summary

st.set_page_config(page_title="Second Life | Dublin", page_icon="🏘️", layout="wide")
st.markdown("""<style>
.block-container {padding-top: 1.5rem; max-width: 1500px;}
.stApp {background: #f7f5f0; color: #192d29;}
h1, h2, h3, h4, h5, h6 {color: #173d35 !important;}
p, span, label, div {color: #192d29;}
[data-testid="stMetricLabel"] {color: #334d45 !important; font-weight: 600;}
[data-testid="stMetricValue"] {color: #173d35 !important;}
[data-testid="stCaptionContainer"] {color: #435e56 !important;}
.stMarkdown p {color: #192d29 !important;}
.streamlit-expanderHeader {color: #173d35 !important; font-weight: 600;}
</style>""", unsafe_allow_html=True)


@st.cache_data
def sites_data():
    rows = load_table()
    to_wgs = Transformer.from_crs(2157, 4326, always_xy=True)
    for row in rows:
        row["lon"], row["lat"] = to_wgs.transform(row["x_itm"], row["y_itm"])
    return rows


rows = sites_data()
if not rows:
    st.error("No processed site cache. Run `python -m secondlife.src.join` from the workspace root.")
    st.stop()
by_id = {row["site_id"]: row for row in rows}
enriched = [r for r in rows if r["osm_available"]]
demo = max(enriched, key=lambda r: sum(v["within_800m"] for v in r["service_stats"].values())) if enriched else rows[0]
if "selected_site" not in st.session_state or st.session_state.selected_site not in by_id:
    st.session_state.selected_site = demo["site_id"]

st.title("Second Life")
st.caption("Explore possible new uses for Dublin City derelict sites with register, census, and nearby service evidence.")
st.info("Scores are leads for a conversation, not recommendations. Proximity is a straight-line proxy, not a walking route or a measure of demand.")

left, right = st.columns([1.15, 1], gap="large")
with left:
    c1, c2 = st.columns([3, 1])
    with c1:
        options = list(by_id)
        selected = st.selectbox("Select a site", options, index=options.index(st.session_state.selected_site),
                                format_func=lambda sid: f"{sid} · {by_id[sid]['description'][:62]}")
        st.session_state.selected_site = selected
    with c2:
        st.write("")
        st.write("")
        if st.button("Demo site", use_container_width=True):
            st.session_state.selected_site = demo["site_id"]
            st.rerun()
    active = by_id[st.session_state.selected_site]
    m = folium.Map(location=[53.3478, -6.2597], zoom_start=12, tiles=None, control_scale=True)
    outline = CACHE / "dublin_outline.geojson"
    if outline.exists():
        folium.GeoJson(json.loads(outline.read_text(encoding="utf-8")),
                       style_function=lambda _: {"fillColor": "#e0e9de", "color": "#a4b9ac", "weight": 1, "fillOpacity": 0.65}).add_to(m)
    for row in rows:
        selected_pin = row["site_id"] == active["site_id"]
        colour = "#cc6c32" if selected_pin else ("#207663" if row["coverage"] >= .85 else "#bd8b3d" if row["coverage"] >= .5 else "#bf5a56")
        folium.CircleMarker([row["lat"], row["lon"]], radius=8 if selected_pin else 5,
                            color="#173d35" if selected_pin else colour, fill=True,
                            fill_color=colour, fill_opacity=.95, weight=2 if selected_pin else 1,
                            tooltip=row["site_id"], popup=row["site_id"]).add_to(m)
    map_result = st_folium(m, height=620, use_container_width=True, key="site_map",
                           returned_objects=["last_object_clicked_popup"])
    clicked = map_result.get("last_object_clicked_popup") if map_result else None
    if clicked and clicked in by_id and clicked != active["site_id"]:
        st.session_state.selected_site = clicked
        st.rerun()
    st.caption(f"All {len(rows)} register sites shown. {len(enriched)} sites have cached OSM evidence. Green = good coverage; amber = partial. Map works offline with the cached outline.")

with right:
    active = by_id[st.session_state.selected_site]
    ranked = rank_uses(active["site_id"])
    st.subheader(active["description"])
    st.caption(f"{active['site_id']} · {active['address'] if active['address'] != 'No Address' else 'Address not available'}")
    info1, info2, info3 = st.columns(3)
    date_str = str(active["date_added"]).split()[0] if active["date_added"] else "not available"
    info1.metric("Added to register", date_str)
    info2.metric("Protected flag", active["protected"] or "not available")
    info3.metric("Council-owned flag", active["council_owned"] or "not available")
    st.markdown(f"**Data coverage:** {coverage_badge(active['coverage'])} ({active['coverage']:.0%}) · Small Area `{active['small_area_id'] or 'not available'}`")
    if not active["osm_available"]:
        st.warning("Nearby OpenStreetMap data was not cached for this site. Scores are not available.")
    st.markdown("### Ranked uses")
    for item in ranked:
        score_text = "not available" if item["score"] is None else f"{item['score']:.1f}/100"
        st.markdown(f"**{item['use']}** · {score_text}")
        if item["score"] is not None:
            st.progress(item["score"] / 100)
        with st.expander("Why · data-backed facts", expanded=item == ranked[0]):
            for fact in item["facts"]:
                st.write(f"• {fact}")
            st.caption("Weights: 50% low nearby supply + 50% local population measure. Repair uses 50% supply + 25% density + 25% households. Factors are min–max normalised across sites with data.")
    st.markdown("### Unanswered questions")
    for question in ranked[0]["unanswered"]:
        st.write(f"• {question}")
    st.markdown("**Templated summary (from the data above)**")
    st.write(templated_summary(active, ranked))

st.divider()
st.markdown("**Sources and retrieval dates** · Dublin City Council derelict sites GeoJSON (user supplied, received 4 Oct 2026); [CSO Census 2022 SAPS](https://www.cso.ie/en/census/census2022/census2022smallareapopulationstatistics/) (retrieved 4 Oct 2026); [Tailte Éireann 2022 Small Areas](https://data.gov.ie/dataset/cso-small-areas-national-statistical-boundaries-2022-generalised-20m) (retrieved 4 Oct 2026); [OpenStreetMap](https://www.openstreetmap.org/copyright) (cached 4 Oct 2026).")
st.caption("Scores are leads for a conversation, not recommendations. OSM coverage is patchy; the register may be out of date. © OpenStreetMap contributors.")
