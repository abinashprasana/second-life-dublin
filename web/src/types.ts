export type UseName = 'Childcare' | 'Study space' | 'Repair workshop' | 'Community hub'

export interface UseEvidence {
  use: UseName
  score: number | null
  facts: string[]
  factors: Record<string, number | null>
}

export interface Service {
  id: string
  lat: number
  lon: number
  groups: string[]
  distanceM: number
}

export interface Site {
  id: string
  title: string
  address: string | null
  position: { lat: number; lon: number }
  register: {
    dateAdded: string | null
    onRegister: string | null
    activeCase: string | null
    protected: string | null
    councilOwned: string | null
  }
  smallArea: {
    id: string | null
    population: number | null
    share0to14: number | null
    share15to24: number | null
    share65plus: number | null
    households: number | null
    density: number | null
  }
  coverage: {
    fraction: number
    badge: 'Good' | 'Partial' | 'Very low'
    hasOsm: boolean
    osmRetrieved: string | null
    evidenceStatus: 'scored' | 'missing_osm'
  }
  uses: UseEvidence[]
  unanswered: string[]
  summary: string
  services: Service[]
}

export interface Atlas {
  metadata: {
    schemaVersion: number
    scoringMethodVersion: string
    generatedAt: string
    title: string
    retrieved: string
    siteCount: number
    osmSiteCount: number
    scoreCohortSize: number
    sources: Array<{ name: string; publisher: string; url: string; retrieved: string }>
  }
  sites: Site[]
}
