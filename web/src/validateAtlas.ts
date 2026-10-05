import type { Atlas } from './types'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function validateAtlas(value: unknown): Atlas {
  if (!record(value) || !record(value.metadata) || !Array.isArray(value.sites)) {
    throw new Error('The evidence file has an invalid structure.')
  }
  const metadata = value.metadata
  if (metadata.schemaVersion !== 2) throw new Error('This evidence file needs a newer version of Second Life.')
  if (typeof metadata.generatedAt !== 'string' || typeof metadata.scoringMethodVersion !== 'string' ||
      typeof metadata.siteCount !== 'number' || typeof metadata.osmSiteCount !== 'number' ||
      !Array.isArray(metadata.sources) || metadata.sources.length < 4 ||
      metadata.sources.some(source => !record(source) || typeof source.name !== 'string' ||
        typeof source.url !== 'string' || typeof source.retrieved !== 'string')) {
    throw new Error('The evidence metadata is incomplete.')
  }
  if (value.sites.length !== metadata.siteCount || value.sites.length !== 134) {
    throw new Error('The evidence file has an unexpected number of sites.')
  }
  const ids = new Set<string>()
  let scored = 0
  for (const site of value.sites) {
    if (!record(site) || typeof site.id !== 'string' || ids.has(site.id) ||
        typeof site.title !== 'string' || !record(site.position) ||
        typeof site.position.lat !== 'number' || typeof site.position.lon !== 'number' ||
        !Number.isFinite(site.position.lat) || !Number.isFinite(site.position.lon) ||
        site.position.lat < 53 || site.position.lat > 53.6 ||
        site.position.lon < -6.6 || site.position.lon > -5.9 ||
        !record(site.register) || !record(site.smallArea) || !record(site.coverage) ||
        typeof site.coverage.fraction !== 'number' || site.coverage.fraction < 0 || site.coverage.fraction > 1 ||
        !Array.isArray(site.uses) || site.uses.length !== 4 ||
        !Array.isArray(site.unanswered) || !Array.isArray(site.services)) {
      throw new Error('The evidence file contains an invalid site.')
    }
    ids.add(site.id)
    const covered = site.coverage.evidenceStatus === 'scored'
    if (site.coverage.evidenceStatus !== 'missing_osm' && !covered) throw new Error('Invalid evidence status.')
    if (site.coverage.hasOsm !== covered) throw new Error('Conflicting evidence status.')
    if (covered) scored += 1
    const useNames = new Set<string>()
    for (const use of site.uses) {
      if (!record(use) || typeof use.use !== 'string' || !Array.isArray(use.facts) ||
          (covered && (typeof use.score !== 'number' || use.score < 0 || use.score > 100)) ||
          (!covered && use.score !== null)) throw new Error('The evidence file contains an invalid use.')
      useNames.add(use.use)
    }
    if (useNames.size !== 4) throw new Error('The evidence file contains duplicate uses.')
  }
  if (scored !== metadata.osmSiteCount || scored !== metadata.scoreCohortSize) throw new Error('The evidence counts do not agree.')
  return value as unknown as Atlas
}
