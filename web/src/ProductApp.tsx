import type { CSSProperties } from 'react'
import { applyTheme } from './theme'
import { useCallback, useEffect, useMemo, useState } from 'react'
import SpatialViewer from './SpatialViewer'
import AssistantPanel from './AssistantPanel'
import { validateAtlas } from './validateAtlas'
import type { Atlas, Site, UseEvidence, UseName } from './types'
import './cinematic.css'
import type { CameraPreset } from './sceneControls'

applyTheme()

const groupFor: Record<UseName, string> = {
  Childcare: 'childcare', 'Study space': 'study',
  'Repair workshop': 'repair', 'Community hub': 'community',
}
const useNumber: Record<UseName, string> = {
  Childcare: '01', 'Study space': '02', 'Repair workshop': '03', 'Community hub': '04',
}
const fmt = (value: number | null) => value === null ? 'Not available' : Math.round(value).toLocaleString('en-IE')
const pct = (value: number | null) => value === null ? 'Not available' : `${(value * 100).toFixed(1)}%`
const dateText = (value: string | null) => value ? new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Not available'

function UseCard({ item, active, coverage, onSelect }: { item: UseEvidence; active: boolean; coverage: number; onSelect: () => void }) {
  return <button type="button" className={`product-use ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={onSelect}>
    <span className="product-use__identity"><span className="use-symbol" aria-hidden="true">{item.use === 'Childcare' ? '✳' : item.use === 'Study space' ? '▤' : item.use === 'Repair workshop' ? '⚒' : '◇'}</span><span><small>{useNumber[item.use]} / POSSIBLE USE</small><strong>{item.use}</strong></span><span className="product-use__score"><b>{item.score?.toFixed(1)}</b><span>/ 100</span></span></span>
    <span className="product-use__bar" aria-hidden="true"><i style={{ transform: `scaleX(${(item.score ?? 0) / 100})` }}/></span>
    <span className="product-use__fact">{item.facts[0]}</span>
    <span className="product-use__hint"><span>Inputs available: {Math.round(coverage * 100)}%</span><span>{active ? 'Selected' : 'Explore'} ↗</span></span>
  </button>
}

function Evidence({ site, activeUse, atlas }: { site: Site; activeUse: UseEvidence | null; atlas: Atlas }) {
  return <section id="evidence" className="product-evidence" aria-labelledby="evidence-heading">
    <div className="product-section-head"><span>03 / THE EVIDENCE</span><h2 id="evidence-heading">What the data says</h2><p>These are clues to discuss, not a decision about the building.</p></div>
    <div className="product-evidence-grid">
      <div className="product-evidence-card">
        <span className="source-heading">01 / DUBLIN CITY COUNCIL</span><h3>Register record</h3>
        <dl><div><dt>Added to register</dt><dd>{dateText(site.register.dateAdded)}</dd></div><div><dt>Protected structure flag</dt><dd>{site.register.protected || 'Not available'}</dd></div><div><dt>Council ownership flag</dt><dd>{site.register.councilOwned || 'Not available'}</dd></div></dl>
        <small>Dublin City Council register · source retrieved {dateText(atlas.metadata.sources[0]?.retrieved || null)}</small>
      </div>
      <div className="product-evidence-card">
        <span className="source-heading">02 / CSO CENSUS 2022</span><h3>The neighbourhood</h3>
        <div className="product-facts"><div><b>{fmt(site.smallArea.population)}</b><span>residents</span></div><div><b>{fmt(site.smallArea.households)}</b><span>households</span></div><div><b>{pct(site.smallArea.share0to14)}</b><span>aged 0–14</span></div><div><b>{pct(site.smallArea.share15to24)}</b><span>aged 15–24</span></div></div>
        <small>CSO Census 2022 · describes Small Area {site.smallArea.id || 'not available'}, not this building</small>
      </div>
      <div className="product-evidence-card product-evidence-card--focus">
        <span className="source-heading">03 / CACHED OPENSTREETMAP TAGS</span><h3>{activeUse ? `${activeUse.use}: why it appears` : 'Nearby services'}</h3>
        {activeUse ? <ul>{activeUse.facts.map(fact => <li key={fact}>{fact}</li>)}</ul> : <p>Nearby-service evidence has not been cached for this site. The four uses cannot be scored yet.</p>}
        <small>{site.coverage.hasOsm ? `OSM service tags retrieved ${dateText(site.coverage.osmRetrieved)} · ${Math.round(site.coverage.fraction * 100)}% of tracked input fields available; tags may still be incomplete` : 'OSM evidence unavailable · missing tags are not proof that a service is absent'}</small>
      </div>
    </div>
    {activeUse && <p className="product-method">Scores combine nearby service tags and Census measures. The service factor is normalised across the {atlas.metadata.scoreCohortSize} sites with cached OSM evidence; Census factors use all sites with available values. These are leads for discussion, not citywide rankings. Nearby means straight-line distance.</p>}
  </section>
}

export default function ProductApp() {
  const [atlas, setAtlas] = useState<Atlas | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [selectedUse, setSelectedUse] = useState<UseName | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'scored'>('all')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [initialPreset] = useState<CameraPreset>(() => new URLSearchParams(window.location.search).has('site') ? 'site' : 'city')
  const [focusVersion, setFocusVersion] = useState(0)
  const [assistantSearch, setAssistantSearch] = useState<{ids:string[];labels:string[]}|null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/atlas.json`)
      .then(response => { if (!response.ok) throw new Error(`The evidence file could not be loaded (${response.status}).`); return response.json() as Promise<unknown> })
      .then(value => {
        const data = validateAtlas(value)
        const demo = data.sites.filter(site => site.coverage.hasOsm).sort((a, b) => b.services.length - a.services.length)[0] || data.sites[0]
        const requested = new URLSearchParams(window.location.search).get('site')
        const match = requested ? data.sites.find(site => site.id === requested) : null
        if (requested && !match) {
          setNotice(`Site ${requested} was not found. Showing ${demo.id} instead.`)
        }
        if (!match) {
          const url = new URL(window.location.href)
          url.searchParams.set('site', demo.id)
          window.history.replaceState({}, '', url)
        }
        setAtlas(data)
        setSelectedId(match?.id || demo.id)
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'The local evidence could not be loaded.'))
  }, [])

  const selectSite = useCallback((id: string) => {
    setSelectedId(id)
    setFocusVersion(value => value + 1)
    setSelectedUse(null)
    setShowAll(false)
    setNotice('')
    const url = new URL(window.location.href)
    url.searchParams.set('site', id)
    window.history.pushState({}, '', url)
  }, [])
  useEffect(() => {
    if (!atlas) return
    const onPop = () => {
      const requested = new URLSearchParams(window.location.search).get('site')
      const demo = atlas.sites.filter(site => site.coverage.hasOsm).sort((a, b) => b.services.length - a.services.length)[0] || atlas.sites[0]
      setSelectedId(requested && atlas.sites.some(site => site.id === requested) ? requested : demo.id)
      setFocusVersion(value => value + 1)
      setSelectedUse(null); setShowAll(false); setNotice('')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [atlas])
  const selected = atlas?.sites.find(site => site.id === selectedId)
  const filtered = useMemo(() => (assistantSearch ? assistantSearch.ids.map(id=>atlas?.sites.find(s=>s.id===id)).filter((s):s is Site=>!!s) : atlas?.sites || []).filter(site =>
    (filter === 'all' || site.coverage.hasOsm) &&
    `${site.id} ${site.title} ${site.address || ''}`.toLocaleLowerCase('en-IE').includes(query.trim().toLocaleLowerCase('en-IE'))), [atlas, filter, query, assistantSearch])
  const activeUse = selected?.coverage.hasOsm ? selected.uses.find(item => item.use === selectedUse) || selected.uses[0] : null
  const visibleUses = selected?.coverage.hasOsm ? selected.uses.slice(0, showAll ? 4 : 2) : []
  const conceptUse = selectedUse || activeUse?.use || 'Community hub'

  if (error) return <main className="product-load"><h1>Second Life</h1><p role="alert">{error}</p><p>Rebuild the local snapshot with <code>python -m src.export_web</code>, then reload this page.</p></main>
  if (!atlas || !selected) return <main className="product-load"><h1>Second Life</h1><p>Opening the evidence…</p></main>

  return <>
    <a className="skip-link" href="#place">Skip to the site</a>
    <header className="product-header"><div className="wrap product-top"><a className="product-brand" href="#top" aria-label="Second Life home"><span>S<span>↗</span>L</span><strong>SECOND LIFE</strong></a><span>DUBLIN CITY / PLACES WITH POSSIBILITY</span><a href="#atlas">Browse sites <span aria-hidden="true">↗</span></a></div></header>
    <main>
      <section className="cinematic-opening" aria-labelledby="intro-heading">
        <div id="top" className="wrap product-intro"><div className="hero-cartography" aria-hidden="true"><img className="hero-map-outline" src={`${import.meta.env.BASE_URL}art/dublin-outline.svg`} alt=""/><img className="hero-map-areas" src={`${import.meta.env.BASE_URL}art/dublin-areas.svg`} alt=""/></div><div><span className="product-eyebrow"><i/> SEE THE PLACE. EXPLORE WHAT’S NEXT.</span><h1 id="intro-heading">A new chapter<br/>for <em>this place</em></h1></div><div className="intro-aside"><p>Every empty place holds a question.<br/> Explore Dublin’s sites, try a possible use, and follow the evidence.</p><div className="hero-actions"><a className="product-primary" href="#place">Explore the atlas <span aria-hidden="true">↘</span></a><a href="#atlas">Browse sites ↗</a></div><div className="product-stats"><span><b>{atlas.metadata.siteCount}</b> registered sites</span><span><b>{atlas.metadata.osmSiteCount}</b> with service evidence</span><span><b>{atlas.metadata.siteCount - atlas.metadata.osmSiteCount}</b> awaiting evidence</span></div></div></div>
        <div className="wrap workspace-wrap">
          {notice && <p className="product-notice" role="status">{notice}</p>}
          {assistantSearch&&<div className="assistant-search-banner" role="status"><p><strong>{assistantSearch.ids.length} sites in this search</strong> · {assistantSearch.labels.join(' · ')}{!assistantSearch.ids.includes(selectedId)&&' · Selected site is outside these results.'}</p><button onClick={()=>{setAssistantSearch(null);setQuery('');setFilter('all')}}>Clear search</button></div>}
          <section id="place" className="product-place" aria-label="Explore a site">
            <div className="workspace-topline"><span><i/> THE LIVING ATLAS</span><span>REGISTER + CENSUS + NEARBY SERVICES</span></div>
            <div className="product-place-grid">
              <SpatialViewer sites={atlas.sites} visibleSiteIds={assistantSearch?.ids} selectedId={selectedId} selectedUse={conceptUse} selectedGroup={groupFor[conceptUse]} initialPreset={initialPreset} focusVersion={focusVersion} onSelect={selectSite}/>
              <aside className="product-selected" aria-label="Selected site and possibilities"><span className="product-site-id">01 / SITE {selected.id}</span><h2>{selected.title}</h2><p>{selected.address?.replaceAll('~|~', ' · ') || 'Street address not available in the register'}</p><div className="product-status"><i className={selected.coverage.hasOsm ? 'is-scored' : ''}/>{selected.coverage.hasOsm ? 'Nearby-service evidence cached' : 'Nearby-service evidence missing'}</div><small>Register retrieved {dateText(atlas.metadata.sources[0]?.retrieved || null)}</small>
                <section id="possibilities" className="product-possibilities" aria-labelledby="possibilities-heading"><div className="product-section-head"><span>02 / POSSIBILITIES</span><h2 id="possibilities-heading">{selected.coverage.hasOsm ? 'What could work here?' : 'Imagine a different use'}</h2><p>{selected.coverage.hasOsm ? 'Choose a use. See the context behind it.' : 'Unranked concepts. Nearby-service evidence is not available here.'}</p></div>
                {selected.coverage.hasOsm ? <><div className="product-use-grid">{visibleUses.map(item => <UseCard key={item.use} item={item} active={activeUse?.use === item.use} coverage={selected.coverage.fraction} onSelect={() => setSelectedUse(item.use)}/>)}</div><button type="button" className="product-text-button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show the first two' : 'See all four possible uses'} <span aria-hidden="true">{showAll ? '−' : '+'}</span></button><p className="comparison-note">Service factors compare eight sites. Missing tags do not prove a service is absent.</p></> : <div className="product-no-score"><strong>No scores for this site yet.</strong><div className="concept-options">{(Object.keys(groupFor) as UseName[]).map(name => <button key={name} aria-pressed={conceptUse === name} onClick={() => setSelectedUse(name)}>{name}</button>)}</div><p>Register and census context are available. A cached nearby-service survey is still needed.</p></div>}
                </section>
                <AssistantPanel key={selectedId} site={selected} atlas={atlas} selectedUse={conceptUse} onApply={(ids,labels)=>{setAssistantSearch({ids,labels});setQuery('');setFilter('all');if(ids.length&&!ids.includes(selectedId))selectSite(ids[0]);document.getElementById('place')?.scrollIntoView({behavior:'instant'})}}/>
              </aside>
            </div>
          </section>
        </div>
        <nav className="product-steps wrap" aria-label="Site journey"><a href="#place"><span>01</span> Place</a><a href="#possibilities"><span>02</span> Possibilities</a><a href="#evidence"><span>03</span> Evidence</a><a href="#next-checks"><span>04</span> Next checks</a></nav>
      </section>
      <div className="product-lower"><div className="wrap product-main" style={{'--outline-art': `url("${new URL(`${import.meta.env.BASE_URL}art/dublin-outline.svg`, document.baseURI).href}")`, '--areas-art': `url("${new URL(`${import.meta.env.BASE_URL}art/dublin-areas.svg`, document.baseURI).href}")`} as CSSProperties}>
        <Evidence site={selected} activeUse={activeUse || null} atlas={atlas}/>
        <section id="next-checks" className="product-next" aria-labelledby="next-heading"><div className="product-section-head"><span>04 / NEXT CHECKS</span><h2 id="next-heading">The next step is local</h2><p>Take these questions to the people who know the place.</p></div><ol>{selected.unanswered.map(question => <li key={question}>{question}</li>)}</ol><div className="product-summary"><span>SUMMARY FROM COMPUTED RESULTS</span><p>{selected.summary}</p></div></section>
        <section id="atlas" className="product-atlas" aria-labelledby="atlas-heading"><div className="product-section-head"><span>THE REGISTER / ALL SITES</span><h2 id="atlas-heading">Find your next possibility</h2><p>Search a street, an area, or a site you already know.</p></div><div className="product-search"><div><label htmlFor="site-search">Search by street, area, or site ID</label><input id="site-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try DS1596 or a street"/></div><div className="site-filters" role="group" aria-label="Filter sites"><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All {atlas.metadata.siteCount}</button><button type="button" aria-pressed={filter === 'scored'} onClick={() => setFilter('scored')}>With evidence {atlas.metadata.osmSiteCount}</button></div><span className="result-count" role="status">{filtered.length} sites found</span></div><div className="product-site-list" aria-label={`${filtered.length} matching sites`}>{filtered.length ? filtered.map(site => <button type="button" key={site.id} aria-current={site.id === selectedId ? 'true' : undefined} onClick={() => { selectSite(site.id); document.getElementById('place')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }) }}><i className={site.coverage.hasOsm ? 'is-scored' : ''}/><span><small>{site.id} · {site.coverage.hasOsm ? 'EVIDENCE CACHED' : 'SERVICE EVIDENCE MISSING'}</small><strong>{site.title}</strong></span><span aria-hidden="true">↗</span></button>) : <p>No sites match that search. Try a shorter street name or another site ID.</p>}</div></section>
      </div></div>
    </main>
    <footer className="product-footer"><div className="wrap"><div><strong>SECOND LIFE</strong><p>Good places deserve<br/><em>another chapter</em></p><small>Scores do not establish demand, feasibility, ownership, or permission.</small></div><div><span>SOURCES / RETRIEVAL DATES</span>{atlas.metadata.sources.map(source => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name} · {dateText(source.retrieved)} ↗</a>)}<small>© OpenStreetMap contributors · map geometry from Tailte Éireann / CSO · evidence build {new Date(atlas.metadata.generatedAt).toLocaleDateString('en-IE')}</small></div></div></footer>
  </>
}

