export type ScreenSite = { id: string; x: number; y: number; depth: number }

/** Return every marker under a click target, nearest first, for overlapping sites. */
export function nearbySites(sites: ScreenSite[], x: number, y: number, radius = 14): string[] {
  const limit = radius * radius
  return sites
    .filter(site => site.depth >= -1 && site.depth <= 1 && (site.x - x) ** 2 + (site.y - y) ** 2 <= limit)
    .sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2) || a.id.localeCompare(b.id))
    .map(site => site.id)
}

/** Pick the nearest visible marker within a CSS-pixel target, including hollow centres. */
export function pickSite(sites: ScreenSite[], x: number, y: number, radius = 14): string | null {
  let nearest: ScreenSite | undefined
  let distance = radius * radius
  for (const site of sites) {
    if (site.depth < -1 || site.depth > 1) continue
    const squared = (site.x - x) ** 2 + (site.y - y) ** 2
    if (squared < distance || (squared === distance && (!nearest || site.id < nearest.id))) {
      nearest = site
      distance = squared
    }
  }
  return nearest?.id ?? null
}

export function isSiteClick(start: {x:number;y:number}, end: {x:number;y:number}) {
  return Math.hypot(end.x-start.x,end.y-start.y) <= 6
}
