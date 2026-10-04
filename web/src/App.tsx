import { useCallback, useEffect, useMemo, useState } from 'react'
import AtlasMap from './AtlasMap'
import type { Atlas, Site, UseName } from './types'

const dateText = (value: string | null) => value ? new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Not available'
const numberText = (value: number | null) => value === null ? 'Not available' : Math.round(value).toLocaleString('en-IE')
const percentageText = (value: number | null) => value === null ? 'Not available' : `${(value * 100).toFixed(1)}%`

function UseGlyph({ name }: { name: UseName }) {
  const common = { width: 30, height: 30, viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  if (name === 'Childcare') return <svg {...common}><path d="M6 25V12l10-7 10 7v13H6Z"/><path d="M12 25v-8h8v8"/><circle cx="11" cy="13" r="1"/><circle cx="21" cy="13" r="1"/></svg>
  if (name === 'Study space') return <svg {...common}><path d="M4 8c4-2 8-2 12 1 4-3 8-3 12-1v17c-4-2-8-2-12 1-4-3-8-3-12-1V8Z"/><path d="M16 9v17"/><path d="M8 13h4M20 13h4"/></svg>
  if (name === 'Repair workshop') return <svg {...common}><path d="M23 6a7 7 0 0 0-8 9L6 24a2 2 0 0 0 3 3l9-9a7 7 0 0 0 9-8l-5 5-4-1-1-4 6-4Z"/></svg>
  return <svg {...common}><circle cx="16" cy="10" r="3"/><circle cx="7" cy="15" r="2.5"/><circle cx="25" cy="15" r="2.5"/><path d="M10 26v-4a6 6 0 0 1 12 0v4H10ZM3 26v-4a4 4 0 0 1 5-4M29 26v-4a4 4 0 0 0-5-4"/></svg>
}

function HeroGraphic() {
  return <div className="hero-graphic" aria-label="Conceptual illustration: one site, four possible uses">
    <svg className="hero-architecture" viewBox="0 0 460 282" role="img" aria-hidden="true">
      <defs><pattern id="plan-grid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#79948b" strokeOpacity=".17" strokeWidth=".7"/></pattern></defs>
      <rect width="460" height="282" fill="url(#plan-grid)"/>
      <path className="hero-draw" d="M82 234V84l59-27h175l62 27v150M65 234h330M141 57v177M316 57v177M82 119h296M82 179h296"/>
      <path className="hero-draw hero-draw--late" d="M164 234v-40h55v40M243 234v-40h50v40M161 82h55v24h-55zM245 82h55v24h-55zM163 136h50v28h-50zM245 136h50v28h-50z"/>
      <path d="M59 250h342M42 263h375" stroke="#b1c3b5" strokeOpacity=".45"/>
      <circle cx="83" cy="83" r="4" fill="#d9ad7f"/><circle cx="378" cy="84" r="4" fill="#d9ad7f"/>
      <path d="M83 83 54 58M378 84l28-26" stroke="#d9ad7f" strokeWidth="1" strokeDasharray="3 5"/>
    </svg>
    <span className="hero-orbit hero-orbit--one"><UseGlyph name="Childcare" /></span>
    <span className="hero-orbit hero-orbit--two"><UseGlyph name="Study space" /></span>
    <span className="hero-orbit hero-orbit--three"><UseGlyph name="Repair workshop" /></span>
    <span className="hero-orbit hero-orbit--four"><UseGlyph name="Community hub" /></span>
    <span className="hero-graphic__caption">CONCEPTUAL STUDY · NOT A SITE IMAGE</span>
  </div>
}

function SiteDetails({ site }: { site: Site }) {
  return <section className="detail" key={site.id} aria-labelledby="site-heading">
    <div className="detail__head">
      <div className="eyebrow">SELECTED SITE <span className="eyebrow-line" /> {site.id}</div>
      <h2 id="site-heading">{site.title}</h2>
      <div className="detail__address">{site.address?.replaceAll('~|~', ' · ') || 'Street address not available in the register'}</div>
      <div className="coverage-row">
        <span className={`coverage-badge ${site.coverage.hasOsm ? 'coverage-badge--good' : 'coverage-badge--partial'}`}>
          <span aria-hidden="true">{site.coverage.hasOsm ? '●' : '◐'}</span> {site.coverage.badge} data coverage · {Math.round(site.coverage.fraction * 100)}%
        </span>
        <span className="small-area-id" title={site.smallArea.id || undefined}>SA {site.smallArea.id || 'not available'}</span>
      </div>
    </div>

    <div className="register-strip" aria-label="Register facts">
      <div><span>Added to register</span><strong>{dateText(site.register.dateAdded)}</strong></div>
      <div><span>Protected flag</span><strong>{site.register.protected || 'Not available'}</strong></div>
      <div><span>Council owned</span><strong>{site.register.councilOwned || 'Not available'}</strong></div>
    </div>

    {!site.coverage.hasOsm && <div className="coverage-warning" role="status"><strong>Nearby-service evidence is not available.</strong><span>The census context is shown, but none of the four uses can be scored for this site.</span></div>}

    <div className="section-label"><span>01</span><h3>Four possible uses</h3></div>
    <p className="section-intro">Evidence scores compare these uses for this site. They are starting points for discussion.</p>
    <div className="uses-list">
      {site.uses.map((item, index) => <article className="use-row" key={item.use} aria-label={`${item.use}, score ${item.score === null ? 'not available' : `${item.score} out of 100`}`}>
        <div className="use-row__top">
          <div className="use-row__identity"><span className="use-row__icon"><UseGlyph name={item.use} /></span><div><small>0{index + 1} / POSSIBILITY</small><h4>{item.use}</h4></div></div>
          <div className="use-row__measure"><div className="use-row__score">{item.score === null ? <span className="score-unavailable">N/A</span> : <><strong>{item.score.toFixed(1)}</strong><small>/ 100</small></>}</div><small className="use-row__coverage">{Math.round(site.coverage.fraction * 100)}% DATA COVERAGE</small></div>
        </div>
        <div className={`score-track ${item.score === null ? 'score-track--empty' : ''}`} aria-hidden="true"><span style={{ width: item.score === null ? '0%' : `${item.score}%` }} /></div>
        <div className="use-row__facts">{item.facts.map((fact, factIndex) => <p key={fact}><span className="source-chip">{factIndex === 0 ? 'OSM' : 'CSO'}</span>{fact.replace(/^(OSM|CSO)\s+/, '')}</p>)}</div>
      </article>)}
    </div>
    <p className="method-note">Method: 50% low nearby supply + 50% local population measure. Repair uses 50% supply, 25% density and 25% households. Factors are normalised across sites with available data. An untagged OSM service may still exist.</p>

    <div className="context-questions">
      <section className="context-block" aria-labelledby="context-heading">
        <div className="section-label"><span>02</span><h3 id="context-heading">Small Area context</h3></div>
        <div className="context-grid">
          <div><strong>{numberText(site.smallArea.population)}</strong><span>Residents</span></div>
          <div><strong>{numberText(site.smallArea.households)}</strong><span>Households</span></div>
          <div><strong>{percentageText(site.smallArea.share0to14)}</strong><span>Aged 0–14</span></div>
          <div><strong>{percentageText(site.smallArea.share15to24)}</strong><span>Aged 15–24</span></div>
        </div>
        <p className="context-note">CSO Census 2022 · values describe the site's Small Area, not the building.</p>
      </section>
      <section className="questions-block" aria-labelledby="questions-heading">
        <div className="section-label"><span>03</span><h3 id="questions-heading">Questions before action</h3></div>
        <ul>{site.unanswered.map(question => <li key={question}>{question}</li>)}</ul>
      </section>
    </div>
    <section className="summary-block" aria-label="Templated summary"><span>PLAIN-LANGUAGE SUMMARY · FROM COMPUTED RESULTS</span><p>{site.summary}</p></section>
  </section>
}

export default function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'covered'>('all')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/atlas.json`)
      .then(response => { if (!response.ok) throw new Error(`Data fetch failed: ${response.status}`); return response.json() as Promise<Atlas> })
      .then(data => {
        if (data.sites.length !== data.metadata.siteCount) throw new Error('Site count does not match export metadata')
        const demo = data.sites.filter(site => site.coverage.hasOsm).sort((a, b) => b.services.length - a.services.length)[0] || data.sites[0]
        setAtlas(data)
        setSelectedId(demo.id)
      })
      .catch(() => setError('The local evidence snapshot could not be loaded. Rebuild it with python -m secondlife.src.export_web.'))
  }, [])

  const onSelect = useCallback((id: string) => setSelectedId(id), [])
  const selected = atlas?.sites.find(site => site.id === selectedId)
  const filtered = useMemo(() => {
    if (!atlas) return []
    const term = query.trim().toLocaleLowerCase('en-IE')
    return atlas.sites.filter(site => (filter === 'all' || site.coverage.hasOsm) &&
      (!term || `${site.id} ${site.title} ${site.address || ''}`.toLocaleLowerCase('en-IE').includes(term)))
  }, [atlas, query, filter])
  const demoId = atlas?.sites.filter(site => site.coverage.hasOsm).sort((a, b) => b.services.length - a.services.length)[0]?.id

  if (error) return <main className="load-state"><h1>Second Life</h1><p role="alert">{error}</p></main>
  if (!atlas || !selected) return <main className="load-state"><div className="loading-mark" aria-hidden="true">S/L</div><p>Opening the evidence atlas…</p></main>

  return <>
    <a className="skip-link" href="#atlas-main">Skip to atlas</a>
    <header className="masthead">
      <div className="topbar wrap"><div className="brand"><span className="brand-mark" aria-hidden="true">S<span>↗</span>L</span><span><strong>SECOND LIFE</strong><small>THE DUBLIN EVIDENCE ATLAS</small></span></div><div className="topbar__right"><span>FIELD GUIDE / 001</span><span className="topbar__edition">DUBLIN · 2026</span></div></div>
      <div className="hero wrap"><div className="hero__copy"><div className="eyebrow eyebrow--light"><span className="eyebrow-dot" /> A NEW VIEW OF WHAT EXISTS</div><h1>What might this<br /><em>place become?</em></h1><p>Explore four possible futures for a neglected Dublin site. See the evidence, the gaps, and the questions that still need people to answer them.</p><div className="hero__rule"><span>EXPLORE BELOW</span><span aria-hidden="true">↓</span></div></div><HeroGraphic /></div>
    </header>
    <div className="stat-band"><div className="wrap stat-band__inner"><div><strong>{atlas.metadata.siteCount}</strong><span>sites in supplied register</span></div><div><strong>{atlas.metadata.osmSiteCount}</strong><span>with nearby-service evidence</span></div><div><strong>04</strong><span>possible uses to examine</span></div><p>Evidence, not an answer.<br />Human judgement stays central.</p></div></div>

    <main id="atlas-main" className="wrap atlas-main">
      <div className="atlas-heading"><div><div className="eyebrow">THE INTERACTIVE ATLAS <span className="eyebrow-line" /> DUBLIN CITY</div><h2>Explore the possibilities</h2></div><p>Select a site to see what local data suggests—and what it cannot tell you.</p></div>
      <div className="atlas-layout">
        <aside className="site-rail" aria-label="Site finder">
          <div className="site-rail__head"><span className="rail-index">01 / FIND A PLACE</span><label htmlFor="site-search">Search the register</label><div className="search-wrap"><svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.6"/></svg><input id="site-search" type="search" placeholder="Street, area or site ID" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="filter-row" role="group" aria-label="Filter sites"><button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All {atlas.sites.length}</button><button type="button" className={filter === 'covered' ? 'is-active' : ''} aria-pressed={filter === 'covered'} onClick={() => setFilter('covered')}>Scored {atlas.metadata.osmSiteCount}</button></div></div>
          <div className="site-rail__list" aria-label={`${filtered.length} matching sites`}>{filtered.length ? filtered.map(site => <button type="button" key={site.id} className={`site-option ${site.id === selectedId ? 'site-option--active' : ''}`} aria-current={site.id === selectedId ? 'true' : undefined} onClick={() => onSelect(site.id)}><span className={`site-option__dot ${site.coverage.hasOsm ? 'site-option__dot--covered' : ''}`} aria-hidden="true"/><span className="site-option__body"><small>{site.id} <span>·</span> {site.coverage.hasOsm ? 'SCORABLE' : 'PARTIAL DATA'}</small><strong>{site.title}</strong></span><span className="site-option__arrow" aria-hidden="true">↗</span></button>) : <p className="empty-search">No sites match that search.</p>}</div>
          <button className="demo-button" type="button" onClick={() => { if (demoId) { setSelectedId(demoId); setFilter('all'); setQuery('') } }}><span>↗</span> Return to demo site</button>
        </aside>
        <section className="map-panel" aria-label="Interactive Dublin site map"><div className="panel-topline"><span>02 / MAP THE EVIDENCE</span><span>LOCAL GEOGRAPHY · OFFLINE</span></div><AtlasMap sites={atlas.sites} selectedId={selectedId} onSelect={onSelect} /><div className="panel-footnote">Selected circles show approximate straight-line reach, not walking routes. Service points appear only where OSM evidence was cached.</div></section>
        <div className="evidence-panel"><div className="panel-topline"><span>03 / READ THE EVIDENCE</span><span>REGISTER + CSO + OSM</span></div><SiteDetails site={selected} /></div>
      </div>
      <section className="principle" aria-label="How to interpret scores"><div className="principle__mark" aria-hidden="true">?</div><div><span>THE IMPORTANT CAVEAT</span><h2>A score starts a conversation<br /><em>It does not settle one</em></h2></div><p>Proximity is not demand. OSM tagging is incomplete. The register may have changed. Ownership, condition, planning and community priorities require further work.</p></section>
    </main>
    <footer className="footer"><div className="wrap footer__inner"><div><strong>SECOND LIFE</strong><span>Evidence for a more thoughtful next use.</span><small>Scores are leads for a conversation, not recommendations.</small></div><div><span className="footer__label">DATA SOURCES · RETRIEVAL DATES</span>{atlas.metadata.sources.map(source => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name} · {dateText(source.retrieved)} ↗</a>)}<small>© OpenStreetMap contributors · Map geometry from Tailte Éireann / CSO</small></div></div></footer>
  </>
}
