"""Deterministic plain-language summary of computed results."""


def templated_summary(site, ranked):
    scored = [r for r in ranked if r["score"] is not None]
    if not scored:
        return "Nearby service evidence is not available for this site, so the four uses cannot be ranked yet. The census context and unanswered questions remain visible below."
    first = scored[0]
    return (f"For {site['site_id']}, {first['use'].lower()} has the highest evidence score "
            f"({first['score']:.1f}/100) among the four uses. {first['facts'][0]} "
            "This is a lead for a conversation, not a recommendation.")
