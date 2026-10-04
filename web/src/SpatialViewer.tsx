import { palette } from './theme'
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import AtlasMap from './AtlasMap'
import type { Site, UseName } from './types'
import { DEFAULT_LAYERS } from './sceneControls'
import type { CameraCommand, CameraPreset, LayerVisibility } from './sceneControls'

const SceneCanvas = lazy(() => import('./SceneCanvas'))
export type SceneData = { sceneVersion: number; units: string; origin: number[]; bounds: number[]; outline: number[][][][]; areas: number[][][][]; sites: { id: string; position: number[]; services: { position: number[]; groups: string[] }[] }[] }
class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { console.error('Spatial scene failed:', error); this.props.onFail() }
  render() { return this.state.failed ? null : this.props.children }
}

export default function SpatialViewer({ sites, visibleSiteIds, selectedId, selectedUse, selectedGroup, initialPreset, focusVersion, onSelect }: {
  sites: Site[]; visibleSiteIds?:string[]; selectedId: string; selectedUse: UseName; selectedGroup: string; initialPreset: CameraPreset; focusVersion: number; onSelect: (id: string) => void
}) {
  const [mode, setMode] = useState<'map' | 'concept'>('map')
  const [three, setThree] = useState(() => !window.matchMedia('(max-width: 700px)').matches)
  const [scene, setScene] = useState<SceneData | null>(null)
  const [failure, setFailure] = useState('')
  const [visible, setVisible] = useState(true)
  const [preset, setPreset] = useState<CameraPreset>(initialPreset)
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS)
  const [command, setCommand] = useState<CameraCommand>({ kind: 'reset', serial: 0 })
  const root = useRef<HTMLDivElement>(null)
  const selected = sites.find(site => site.id === selectedId)!
  const services = selected.services.filter(service => service.groups.includes(selectedGroup))

  useEffect(() => { if (focusVersion > 0) { setPreset('site'); setCommand(c => ({ kind: 'reset', serial: c.serial + 1 })) } }, [focusVersion])
  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}data/dublin_scene.json`).then(r => { if (!r.ok) throw Error(); return r.json() }).then((data: SceneData) => {
      if (data.sceneVersion !== 1 || data.units !== 'metres' || data.sites.length !== sites.length || !data.outline.length || !data.areas.length || data.bounds.length !== 4 || data.bounds.some(v => !Number.isFinite(v)) || sites.some(site => !data.sites.some(s => s.id === site.id))) throw Error()
      if (live) setScene(data)
    }).catch(() => { if (live) { setThree(false); setFailure('The dimensional map is unavailable. The flat map and site list are still available.') } })
    let onscreen = true
    const updateVisibility = () => setVisible(onscreen && !document.hidden)
    const observer = new IntersectionObserver(entries => { onscreen = entries[0].isIntersecting; updateVisibility() }, { rootMargin: '60px' })
    if (root.current) observer.observe(root.current)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => { live = false; observer.disconnect(); document.removeEventListener('visibilitychange', updateVisibility) }
  }, [sites])
  const fail = useCallback(() => { setThree(false); setFailure('3D is unavailable on this device. Your selected site is saved; the flat map and concept illustration are available.') }, [])
  const geometryFail = useCallback(() => setFailure('The boundary layer is unavailable. Site pins and the site list still work.'), [])
  const act = (kind: CameraCommand['kind']) => setCommand(c => ({ kind, serial: c.serial + 1 }))
  const choosePreset = (value: CameraPreset) => { setPreset(value); act('reset') }
  const toggle = (key: keyof LayerVisibility) => setLayers(value => ({ ...value, [key]: !value[key] }))

  return <div className="spatial-viewer" ref={root} data-view={mode}>
    <div className="spatial-toolbar">
      <div className="viewer-tabs" role="group" aria-label="Spatial view"><button aria-pressed={mode === 'map'} onClick={() => setMode('map')}><span aria-hidden="true">◈</span> Dublin map</button><button aria-pressed={mode === 'concept'} onClick={() => setMode('concept')}><span aria-hidden="true">⌂</span> Use concept</button></div>
      <a href="#atlas">Find a site ↗</a>
    </div>
    <div className={`spatial-stage ${three && scene ? 'is-dimensional' : 'is-flat'}`}>
      {three && scene ? <SceneBoundary onFail={fail}><Suspense fallback={<p className="scene-loading">Preparing the atlas…</p>}><SceneCanvas scene={scene} sites={sites} visibleSiteIds={visibleSiteIds} selectedId={selectedId} selectedUse={selectedUse} selectedGroup={selectedGroup} mode={mode} command={command} preset={preset} layers={layers} visible={visible} onSelect={onSelect} onFail={fail}/></Suspense></SceneBoundary> : mode === 'map' ? <AtlasMap sites={sites} visibleSiteIds={visibleSiteIds} selectedId={selectedId} selectedGroup={selectedGroup} layers={layers} preset={preset} command={command} onSelect={onSelect} onGeometryError={geometryFail}/> : <div className="static-concept"><svg viewBox="0 0 500 300" role="img" aria-label={`Conceptual ${selectedUse.toLowerCase()} cutaway`}><path d="M80 220 270 285 440 185 250 125Z" fill="#b78261"/><path d="M80 220V70L250 15V125M80 70 270 135 440 35V185L270 285V135" fill="#e9e0c9" stroke="#b7ac90" strokeWidth="3"/><path d="M140 210 260 250 370 187 250 148Z" fill={palette.mapBase}/><path d="M180 190v-35l80 27v35m-80-62 70-40 80 27-70 40m70-40v35" fill="#d5a075" stroke="#f2e8d3" strokeWidth="4"/></svg><strong>{selectedUse}</strong><span>Furniture and layout are illustrative.</span></div>}
      <div className="scene-caption"><span>{mode === 'map' ? 'DUBLIN CITY / SPATIAL ATLAS' : 'CONCEPTUAL USE ILLUSTRATION'}</span><strong>{mode === 'map' ? (preset === 'city' ? 'The city, in context.' : 'Closer to the possibility.') : selectedUse}</strong></div>
      {mode === 'map' && !three && <div className="scene-orientation" aria-hidden="true"><span>↑</span>N</div>}
      <div className="scene-readout" aria-live="polite"><span className="readout-id"><i/> {selected.id} <small>{selected.coverage.hasOsm ? 'SERVICE EVIDENCE CACHED' : 'SERVICE EVIDENCE MISSING'}</small></span><span>{selected.position.lat.toFixed(4)}° N &nbsp; {Math.abs(selected.position.lon).toFixed(4)}° W</span><span className="readout-service">{selectedUse} <b>{!layers.services && mode === 'map' ? 'Layer hidden' : !selected.coverage.hasOsm ? 'Evidence unavailable' : services.length ? `${services.length} tagged nearby` : 'No matching cached tags'}</b></span></div>
    </div>
    {mode === 'map' && <div className="map-options"><div className="camera-presets" role="group" aria-label="Camera preset"><button aria-pressed={preset === 'city'} onClick={() => choosePreset('city')}>Whole city</button><button aria-pressed={preset === 'site'} onClick={() => choosePreset('site')}>Selected site</button></div><div className="map-layers" role="group" aria-label="Map layers">{([['areas', 'Small Areas'], ['services', 'Nearby services'], ['rings', 'Distance rings']] as const).map(([key,label]) => <button key={key} aria-pressed={layers[key]} onClick={() => toggle(key)}><i aria-hidden="true"/>{label}</button>)}</div></div>}
    <div className="spatial-controls"><button className="view-switch" onClick={() => setThree(v => !v)} disabled={!scene || !!failure}>{three ? 'Flat view' : 'Explore in 3D'}</button>{(three || mode === 'map') && <><button aria-label="Zoom in" onClick={() => act('in')}>+</button><button aria-label="Zoom out" onClick={() => act('out')}>−</button><button onClick={() => act('reset')}>Reset view</button></>}<span>{three ? 'Drag to orbit · scroll to read' : mode === 'map' ? 'Drag to pan' : 'Concept illustration'}</span></div>
    {failure && <p className="spatial-warning" role="status">{failure}</p>}
    <div className="spatial-foot">{mode === 'map' ? <><span><i className="legend-filled"/> Cached evidence <i className="legend-outlined"/> Evidence missing</span><span>{layers.rings ? 'Rings: 400 m / 800 m, straight-line.' : 'Distance rings hidden.'} Layer depth is decorative.</span></> : <><span>One building, four possibilities.</span><span>Illustrative layout; actual dimensions and condition are unknown.</span></>}</div>
  </div>
}


