import { palette } from './theme'
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import type { Site } from './types'
import { DEFAULT_LAYERS } from './sceneControls'
import type { CameraCommand, CameraPreset, LayerVisibility } from './sceneControls'

interface Props {
  sites: Site[]
  visibleSiteIds?: string[]
  selectedId: string
  onSelect: (id: string) => void
  selectedGroup?: string | null
  onGeometryError?: () => void
  layers?: LayerVisibility
  preset?: CameraPreset
  command?: CameraCommand
}

const dataPath = (name: string) => `${import.meta.env.BASE_URL}data/${name}`

export default function AtlasMap({ sites, visibleSiteIds, selectedId, onSelect, selectedGroup, onGeometryError, layers = DEFAULT_LAYERS, preset = 'site', command }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const pointsRef = useRef<L.LayerGroup | null>(null)
  const areasRef = useRef<L.GeoJSON | null>(null)
  const layersRef = useRef(layers)
  layersRef.current = layers

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      zoomAnimation: false,
      scrollWheelZoom: false,
      minZoom: 10,
      maxZoom: 17,
    })
    mapRef.current = map
    map.fitBounds(L.latLngBounds(sites.map(site => [site.position.lat, site.position.lon])), { padding: [34, 34] })
    let live = true
    Promise.all([
      fetch(dataPath('dublin_areas.geojson')).then(response => { if (!response.ok) throw new Error('Small Areas unavailable'); return response.json() as Promise<GeoJsonObject> }),
      fetch(dataPath('dublin_outline.geojson')).then(response => { if (!response.ok) throw new Error('Outline unavailable'); return response.json() as Promise<GeoJsonObject> }),
    ]).then(([areas, outline]) => {
      if (!live) return
      areasRef.current = L.geoJSON(areas, { style: { color: palette.mapArea, weight: 0.6, opacity: 0.35, fillOpacity: 0 }, interactive: false })
      if (layersRef.current.areas) areasRef.current.addTo(map).bringToBack()
      L.geoJSON(outline, { style: { color: palette.mapLine, weight: 1.5, opacity: 0.85,
        fillColor: palette.mapBase, fillOpacity: 0.5 }, interactive: false }).addTo(map).bringToBack()
    }).catch(() => { if (live) onGeometryError?.() })
    requestAnimationFrame(() => map.invalidateSize())
    return () => {
      live = false
      mapRef.current = null
      areasRef.current = null
      map.remove()
    }
  }, [sites, onGeometryError])

  useEffect(() => {
    const map = mapRef.current, areas = areasRef.current
    if (!map || !areas) return
    if (layers.areas) areas.addTo(map).bringToBack()
    else areas.remove()
  }, [layers.areas])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    pointsRef.current?.remove()
    const layer = L.layerGroup().addTo(map)
    pointsRef.current = layer
    for (const site of sites) {
      if (visibleSiteIds && !visibleSiteIds.includes(site.id)) continue
      const selected = site.id === selectedId
      const className = `atlas-pin ${site.coverage.hasOsm ? 'atlas-pin--covered' : 'atlas-pin--partial'}${selected ? ' atlas-pin--selected' : ''}`
      const marker = L.marker([site.position.lat, site.position.lon], {
        keyboard: false,
        title: `${site.id}: ${site.title}`,
        zIndexOffset: selected ? 1000 : 0,
        icon: L.divIcon({ className: 'atlas-pin-wrap', html: `<span class="${className}"><span class="atlas-pin__core"></span></span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
      })
      const siteTooltip = document.createElement('span')
      siteTooltip.textContent = site.id
      marker.bindTooltip(siteTooltip, { direction: 'top', offset: [0, -8] })
      marker.on('click', () => onSelect(site.id))
      marker.addTo(layer)
    }
    const selected = sites.find(site => site.id === selectedId)
    if (selected && (!visibleSiteIds || visibleSiteIds.includes(selected.id))) {
      const centre: L.LatLngExpression = [selected.position.lat, selected.position.lon]
      if (layers.rings) {
        L.circle(centre, { radius: 800, color: palette.selection, weight: 1.4, dashArray: '5 5', fillColor: palette.selection, fillOpacity: 0.035, interactive: false }).addTo(layer)
        L.circle(centre, { radius: 400, color: palette.selection, weight: 1, dashArray: '2 5', fillOpacity: 0, interactive: false }).addTo(layer)
      }
      for (const service of layers.services ? selected.services.filter(service => !selectedGroup || service.groups.includes(selectedGroup)) : []) {
        const highlighted = !selectedGroup || service.groups.includes(selectedGroup)
        const serviceTooltip = document.createElement('span')
        serviceTooltip.textContent = `${service.groups.join(' / ')} · ${Math.round(service.distanceM)} m`
        L.circleMarker([service.lat, service.lon], { radius: highlighted ? 5 : 2.5, color: palette.service, weight: 1, fillColor: palette.service, fillOpacity: 0.7 })
          .bindTooltip(serviceTooltip, { direction: 'top' })
          .addTo(layer)
      }
    }
    return () => { layer.remove(); pointsRef.current = null }
  }, [sites, visibleSiteIds, selectedId, selectedGroup, onSelect, layers.rings, layers.services])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const selected = sites.find(site => site.id === selectedId)!
    map.stop()
    if (preset === 'city') map.fitBounds(L.latLngBounds(sites.map(site => [site.position.lat,site.position.lon])), { padding: [35,65], animate, duration:.26 })
    else map.setView([selected.position.lat,selected.position.lon],14,{ animate, duration:.26 })
  }, [sites, selectedId, preset])

  const previousCommand = useRef(command?.serial)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !command || previousCommand.current === command.serial) return
    previousCommand.current = command.serial
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (command.kind === 'in') map.zoomIn(1,{animate})
    else if (command.kind === 'out') map.zoomOut(1,{animate})
    else if (preset === 'city') map.fitBounds(L.latLngBounds(sites.map(site => [site.position.lat,site.position.lon])),{padding:[35,65],animate,duration:.26})
    else { const site = sites.find(site => site.id === selectedId)!; map.setView([site.position.lat,site.position.lon],14,{animate,duration:.26}) }
  }, [command, preset, selectedId, sites])

  return (
    <div className="map-shell">
      <div ref={containerRef} className="atlas-map" role="group" aria-label="Map of Dublin City with derelict site pins. Use the site list to select a site by keyboard." />
    </div>
  )
}
