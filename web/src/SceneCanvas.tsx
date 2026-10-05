import { palette } from './theme'
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as Controls } from 'three-stdlib'
import type { SceneData } from './SpatialViewer'
import type { Site, UseName } from './types'
import { cityCameraDistance, FrameQuality } from './sceneControls'
import { pickSite, nearbySites, isSiteClick } from './sitePicking'
import type { CameraCommand, CameraPreset, LayerVisibility } from './sceneControls'

type Props = { scene: SceneData; sites: Site[]; visibleSiteIds?:string[]; selectedId: string; selectedUse: UseName; selectedGroup: string; mode: 'map' | 'concept'; command: CameraCommand; preset: CameraPreset; layers: LayerVisibility; visible: boolean; onSelect: (id: string) => void; onCandidates: (ids: string[]) => void; onFail: () => void }
function boundaryGeometry(polygons: number[][][][], y: number) {
  const points: number[] = []
  for (const polygon of polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) points.push(ring[i-1][0]/1000,y,ring[i-1][1]/1000,ring[i][0]/1000,y,ring[i][1]/1000)
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
}
function Atlas({ scene, sites, visibleSiteIds, selectedId, selectedGroup, onSelect, onCandidates, layers }: Props) {
  const selected = scene.sites.find(s => s.id === selectedId)!
  const geometry = useMemo(() => {
    const shapes = scene.outline.map(polygon => {
      const shape = new THREE.Shape(polygon[0].map(p => new THREE.Vector2(p[0]/1000,-p[1]/1000)))
      shape.holes = polygon.slice(1).map(ring => new THREE.Path(ring.map(p => new THREE.Vector2(p[0]/1000,-p[1]/1000))))
      return shape
    })
    return { land: new THREE.ExtrudeGeometry(shapes,{ depth:.13, bevelEnabled:false }), areas:boundaryGeometry(scene.areas,.035), coast:boundaryGeometry(scene.outline,.045), bottom:boundaryGeometry(scene.outline,-.14) }
  }, [scene])
  useEffect(() => () => Object.values(geometry).forEach(g => g.dispose()), [geometry])
  const covered = useMemo(() => new Set(sites.filter(site => site.coverage.hasOsm).map(site => site.id)), [sites])
  const visibleSites = useMemo(()=>scene.sites.filter(site=>!visibleSiteIds||visibleSiteIds.includes(site.id)),[scene,visibleSiteIds])
  const groups = useMemo(() => [visibleSites.filter(site => covered.has(site.id)),visibleSites.filter(site => !covered.has(site.id))], [visibleSites,covered])
  const centre = [(scene.bounds[0]+scene.bounds[2])/2000,(scene.bounds[1]+scene.bounds[3])/2000]
  return <>
    <gridHelper args={[40,40,palette.darkLine,palette.surfacePanel]} position={[centre[0],-.18,centre[1]]}/>
    <mesh geometry={geometry.land} rotation={[-Math.PI/2,0,0]} position={[0,-.13,0]}><meshStandardMaterial color={palette.mapBase} emissive={palette.surfaceDeep} emissiveIntensity={.3} transparent opacity={.91} roughness={1}/></mesh>
    {layers.areas && <lineSegments geometry={geometry.areas}><lineBasicMaterial color={palette.mapArea} transparent opacity={.25}/></lineSegments>}
    <lineSegments geometry={geometry.coast}><lineBasicMaterial color={palette.mapLine} transparent opacity={.9}/></lineSegments>
    <lineSegments geometry={geometry.bottom}><lineBasicMaterial color={palette.darkLine} transparent opacity={.45}/></lineSegments>
    <Pins entries={groups[0]} covered/><Pins entries={groups[1]} covered={false}/>
    <SitePicker entries={visibleSites} onSelect={onSelect} onCandidates={onCandidates}/>
    {(!visibleSiteIds||visibleSiteIds.includes(selectedId))&&<><Locator position={selected.position} rings={layers.rings}/>
    {layers.services && <ServicePoints services={selected.services.filter(s => s.groups.includes(selectedGroup))}/>}</>}
  </>
}
function Locator({position,rings}:{position:number[];rings:boolean}) {
  const ref=useRef<THREE.Group>(null)
  const glow=useRef<THREE.MeshBasicMaterial>(null)
  const transition=useRef({start:0,from:.85})
  const {invalidate}=useThree()
  useEffect(()=>{transition.current={start:performance.now(),from:glow.current?.opacity??.85};invalidate()},[position,invalidate])
  useFrame(()=>{
    const t=window.matchMedia('(prefers-reduced-motion: reduce)').matches?1:Math.min(1,(performance.now()-transition.current.start)/240)
    if(glow.current)glow.current.opacity=THREE.MathUtils.lerp(transition.current.from,.85,1-Math.pow(1-t,3))
    if(t<1)invalidate()
  })
  return <group ref={ref} position={[position[0]/1000,.065,position[1]/1000]}>
    {rings && [.4,.8].map(radius=><mesh key={radius} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[radius-.01,radius,96]}/><meshBasicMaterial color={palette.selection} transparent opacity={.6} side={THREE.DoubleSide}/></mesh>)}
    <mesh position={[0,.24,0]}><cylinderGeometry args={[.012,.012,.48,8]}/><meshBasicMaterial color={palette.selection}/></mesh>
    <mesh position={[0,.51,0]}><octahedronGeometry args={[.09,0]}/><meshBasicMaterial color={palette.selection}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.1,.14,40]}/><meshBasicMaterial ref={glow} color={palette.selection} transparent opacity={.85} side={THREE.DoubleSide}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]}><circleGeometry args={[.22,40]}/><meshBasicMaterial color={palette.selection} transparent opacity={.12} depthWrite={false}/></mesh>
  </group>
}
function SitePicker({entries,onSelect,onCandidates}:{entries:SceneData['sites'];onSelect:(id:string)=>void;onCandidates:(ids:string[])=>void}) {
  const {gl,camera}=useThree()
  useEffect(()=>{
    const canvas=gl.domElement
    let down:{x:number;y:number;id:number}|null=null
    let dragged=false
    const projected=(event:PointerEvent)=>{
      const rect=canvas.getBoundingClientRect()
      const markers=entries.map(site=>{
        const point=new THREE.Vector3(site.position[0]/1000,.075,site.position[1]/1000).project(camera)
        return {id:site.id,x:(point.x+1)*rect.width/2,y:(1-point.y)*rect.height/2,depth:point.z}
      })
      return {markers,x:event.clientX-rect.left,y:event.clientY-rect.top,radius:event.pointerType==='touch'?22:14}
    }
    const start=(event:PointerEvent)=>{if(event.button!==0||!event.isPrimary)return;down={x:event.clientX,y:event.clientY,id:event.pointerId};dragged=false}
    const move=(event:PointerEvent)=>{
      if(down&&!isSiteClick(down,{x:event.clientX,y:event.clientY}))dragged=true
      const hit=down?null:projected(event)
      const id=hit?pickSite(hit.markers,hit.x,hit.y,hit.radius):null
      canvas.style.cursor=down?'grabbing':id?'pointer':'grab'
      canvas.title=id?`Select site ${id}`:''
    }
    const end=(event:PointerEvent)=>{
      if(down&&event.pointerId===down.id&&!dragged&&isSiteClick(down,{x:event.clientX,y:event.clientY})){
        const hit=projected(event)
        const ids=nearbySites(hit.markers,hit.x,hit.y,hit.radius)
        if(ids.length>1)onCandidates(ids)
        else if(ids.length===1)onSelect(ids[0])
      }
      down=null;canvas.style.cursor='grab'
    }
    const cancel=()=>{down=null;canvas.title='';canvas.style.cursor='grab'}
    canvas.addEventListener('pointerdown',start)
    canvas.addEventListener('pointermove',move)
    canvas.addEventListener('pointerup',end)
    canvas.addEventListener('pointercancel',cancel)
    return ()=>{canvas.removeEventListener('pointerdown',start);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',cancel);cancel()}
  },[entries,onSelect,onCandidates,gl,camera])
  return null
}
function Pins({ entries, covered }: { entries: SceneData['sites']; covered: boolean }) {
  const ref=useRef<THREE.InstancedMesh>(null)
  const {invalidate}=useThree()
  useEffect(()=>{const dummy=new THREE.Object3D();entries.forEach((s,i)=>{dummy.position.set(s.position[0]/1000,.075,s.position[1]/1000);dummy.rotation.x=-Math.PI/2;dummy.updateMatrix();ref.current!.setMatrixAt(i,dummy.matrix)});ref.current!.instanceMatrix.needsUpdate=true;ref.current!.computeBoundingSphere();invalidate()},[entries,invalidate])
  return <instancedMesh ref={ref} args={[undefined,undefined,entries.length]}><ringGeometry args={[covered?0:.046,.07,20]}/><meshBasicMaterial color={covered?palette.mapLine:palette.mapArea} side={THREE.DoubleSide}/></instancedMesh>
}
function ServicePoints({ services }: { services: SceneData['sites'][number]['services'] }) {
  const geometry=useMemo(()=>new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(services.flatMap(s=>[s.position[0]/1000,.095,s.position[1]/1000]),3)),[services])
  useEffect(()=>()=>geometry.dispose(),[geometry])
  return <points geometry={geometry}><pointsMaterial color={palette.service} size={.055} sizeAttenuation/></points>
}
const cube = new THREE.BoxGeometry(1,1,1)
const cubeEdges = new THREE.EdgesGeometry(cube)
const edgeMaterial = new THREE.LineBasicMaterial({ color: palette.mapLine, transparent: true, opacity: .32 })
const materialCache = new Map<string, THREE.MeshStandardMaterial>()
function Box({ p, s, color = '#e4dcc6' }: { p: [number,number,number]; s: [number,number,number]; color?: string }) {
  if(!materialCache.has(color))materialCache.set(color,new THREE.MeshStandardMaterial({color,roughness:.95}))
  return <mesh position={p} scale={s} geometry={cube} material={materialCache.get(color)} dispose={null}><lineSegments geometry={cubeEdges} material={edgeMaterial} dispose={null}/></mesh>
}
function Table({ x, z, small=false }: { x:number; z:number; small?:boolean }) { return <group position={[x,0,z]}><Box p={[0,small?.45:.8,0]} s={[small?.75:1.2,.12,.7]} color="#bd865f"/>{[-.42,.42].map(a => <Box key={a} p={[a,small?.22:.4,0]} s={[.08,small?.44:.8,.5]} color="#8b7359"/>)}</group> }
function Concept({ use }: { use: UseName }) {
  const model = useRef<THREE.Group>(null)
  const elapsed = useRef(1)
  const { invalidate } = useThree()
  useEffect(() => { elapsed.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0; invalidate() }, [use, invalidate])
  useFrame((_, delta) => { if(elapsed.current >= 1 || !model.current)return; elapsed.current = Math.min(1,elapsed.current + Math.min(delta,.04)/.24); model.current.scale.setScalar(.97+.03*(1-Math.pow(1-elapsed.current,3))); invalidate() })
  return <group ref={model} position={[0,-.5,0]}><mesh rotation={[-Math.PI/2,0,0]} position={[0,-.32,0]}><ringGeometry args={[3.65,3.68,96]}/><meshBasicMaterial color={palette.mapLine} transparent opacity={.5}/></mesh><Box p={[0,-.15,0]} s={[6,.3,4.5]}/><Box p={[0,1.2,-2.1]} s={[6,2.7,.18]}/><Box p={[-2.9,1.2,0]} s={[.18,2.7,4.2]}/><Box p={[0,.025,0]} s={[5.7,.06,4]} color="#aa926e"/>
    {[-1.8,0,1.8].map(x => <group key={x}><Box p={[x,1.65,-1.99]} s={[1.1,1.1,.06]} color={palette.surfacePanel}/><Box p={[x,1.65,-1.94]} s={[.06,1.1,.05]}/><Box p={[x,1.65,-1.94]} s={[1.1,.06,.05]}/></group>)}
    {use === 'Study space' && <><Table x={-.9} z={.4}/><Table x={1.2} z={.4}/>{[-1,0,1].map(y => <Box key={y} p={[-2.5,1+y*.5,-.1]} s={[.5,.08,2.4]} color="#c28a60"/>)}{[0,1,2,3,4,5].map(i => <Box key={i} p={[-2.5,1.2,-1+i*.35]} s={[.35,.35,.17]} color={i%2?palette.surfacePanel:'#b6754e'}/>)}</>}
    {use === 'Childcare' && <><Table x={-.6} z={.1} small/><Box p={[1.3,.08,.6]} s={[1.7,.1,1.7]} color={palette.mapArea}/>{[0,1,2,3].map(i => <Box key={i} p={[.9+(i%2)*.5,.25+Math.floor(i/2)*.2,.4]} s={[.35,.35,.35]} color={i%2?'#b96e47':'#e7c16e'}/>)}</>}
    {use === 'Repair workshop' && <><Table x={0} z={0}/><Box p={[1.9,.6,-.5]} s={[1,1.2,.65]} color={palette.surfaceRaised}/><Box p={[-1.9,1,-.5]} s={[.8,.15,1.8]} color="#b97b53"/>{[-.5,0,.5].map(x => <Box key={x} p={[x,.94,0]} s={[.12,.17,.4]} color={palette.muted}/>)}</>}
    {use === 'Community hub' && <><Table x={0} z={0}/>{[-1.5,1.5].map(x => <group key={x}><Box p={[x,.4,.6]} s={[.7,.5,1.5]} color={palette.mapArea}/><Box p={[x,.85,.6]} s={[.15,.6,1.5]} color={palette.mapArea}/></group>)}</>}
    <pointLight position={[0,2,1]} intensity={3} distance={6} color={use === 'Childcare' ? '#f7cb8b' : use === 'Study space' ? '#ebd9b2' : use === 'Repair workshop' ? '#efad7f' : palette.mapLine}/><Box p={[2.4,.25,1.6]} s={[.45,.5,.45]} color="#b77751"/><mesh position={[2.4,.85,1.6]}><sphereGeometry args={[.42,12,8]}/><meshStandardMaterial color="#426f4d"/></mesh>
  </group>
}
function Rig({ mode, selectedId, scene, command, preset, visible }: Props) {
  const controls=useRef<Controls>(null)
  const {camera,invalidate,setDpr,gl,size}=useThree()
  const dragging=useRef(false)
  const quality=useRef(new FrameQuality())
  const started=useRef(false)
  const transition=useRef<{start:number;from:THREE.Vector3;to:THREE.Vector3;fromTarget:THREE.Vector3;toTarget:THREE.Vector3}|null>(null)
  const maximum=cityCameraDistance(scene.bounds,size.width/size.height)*1.7
  const minimum=mode==='map'?1.3:5
  const move=(target:THREE.Vector3,position:THREE.Vector3)=>{
    if(!controls.current)return
    if(!started.current||window.matchMedia('(prefers-reduced-motion: reduce)').matches){camera.position.copy(position);controls.current.target.copy(target);controls.current.update();transition.current=null}
    else transition.current={start:performance.now(),from:camera.position.clone(),to:position,fromTarget:controls.current.target.clone(),toTarget:target}
    started.current=true;invalidate()
  }
  useEffect(()=>{
    if(!controls.current)return
    const site=scene.sites.find(s=>s.id===selectedId)!.position
    const target=mode==='concept'?new THREE.Vector3(0,.45,0):preset==='city'?new THREE.Vector3((scene.bounds[0]+scene.bounds[2])/2000,0,(scene.bounds[1]+scene.bounds[3])/2000):new THREE.Vector3(site[0]/1000,0,site[1]/1000)
    const distance=mode==='concept'?8.1:preset==='city'?cityCameraDistance(scene.bounds,size.width/size.height):4.4
    const direction=mode==='concept'?new THREE.Vector3(.57,.43,.7):new THREE.Vector3(.12,.83,.55)
    move(target,target.clone().add(direction.normalize().multiplyScalar(distance)))
    // Presets derive from the exported projected bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode,selectedId,preset,scene,size.width,size.height])
  const previousCommand=useRef(command.serial)
  useEffect(()=>{
    if(!controls.current||previousCommand.current===command.serial)return
    previousCommand.current=command.serial
    const target=controls.current.target.clone()
    if(command.kind==='reset'){
      const site=scene.sites.find(s=>s.id===selectedId)!.position
      const centre=mode==='concept'?new THREE.Vector3(0,.45,0):preset==='city'?new THREE.Vector3((scene.bounds[0]+scene.bounds[2])/2000,0,(scene.bounds[1]+scene.bounds[3])/2000):new THREE.Vector3(site[0]/1000,0,site[1]/1000)
      const distance=mode==='concept'?8.1:preset==='city'?cityCameraDistance(scene.bounds,size.width/size.height):4.4
      move(centre,centre.clone().add((mode==='concept'?new THREE.Vector3(.57,.43,.7):new THREE.Vector3(.12,.83,.55)).normalize().multiplyScalar(distance)))
    }else{
      const offset=(transition.current?.to||camera.position).clone().sub(target)
      offset.setLength(THREE.MathUtils.clamp(offset.length()*(command.kind==='in'?.8:1.25),minimum,mode==='concept'?18:maximum))
      move(target,target.clone().add(offset))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[command])
  useFrame((_,delta)=>{
    gl.domElement.dataset.renderFrames=String(Number(gl.domElement.dataset.renderFrames||0)+1)
    const active=!!transition.current||dragging.current
    if(quality.current.sample(delta,active)){setDpr(1);gl.domElement.dataset.quality='reduced'}
    const tween=transition.current
    if(tween&&controls.current){
      const t=Math.min(1,(performance.now()-tween.start)/260),ease=1-Math.pow(1-t,3)
      camera.position.lerpVectors(tween.from,tween.to,ease);controls.current.target.lerpVectors(tween.fromTarget,tween.toTarget,ease);controls.current.update()
      if(t===1){transition.current=null;quality.current.sample(0,false)}
    }
    if(transition.current||dragging.current)invalidate()
    gl.domElement.dataset.cameraPreset=preset
  })
  useEffect(()=>{gl.domElement.style.touchAction='pan-y';gl.domElement.style.cursor='grab';if(visible)invalidate();else{dragging.current=false;quality.current.sample(0,false)}},[visible,gl,invalidate])
  return <OrbitControls ref={controls} makeDefault enabled={visible} enableDamping={false} enableZoom={false} enablePan={false} minDistance={minimum} maxDistance={mode==='concept'?18:maximum} minPolarAngle={.25} maxPolarAngle={Math.PI/2.65} onStart={()=>{transition.current=null;quality.current.sample(0,false);dragging.current=true;invalidate()}} onEnd={()=>{dragging.current=false;quality.current.sample(0,false);invalidate()}} onChange={()=>invalidate()}/>
}
function ContextGuard({onFail}:{onFail:()=>void}) {
  const {gl}=useThree()
  useEffect(()=>{
    const canvas=gl.domElement
    const lost=(event:Event)=>{event.preventDefault();onFail()}
    canvas.addEventListener('webglcontextlost',lost)
    // R3F deliberately loses the context after unmount; that is not a device failure.
    return ()=>canvas.removeEventListener('webglcontextlost',lost)
  },[gl,onFail])
  return null
}
export default function SceneCanvas(props:Props){
  return <Canvas frameloop={props.visible?'demand':'never'} dpr={[1,1.5]} camera={{position:[0,7,7],near:.02,far:150,fov:50}} gl={{antialias:true,alpha:false}} fallback={<span>Use the flat view on this device.</span>} onCreated={({gl})=>gl.setClearColor(palette.surfaceDeep)}><ContextGuard onFail={props.onFail}/><ambientLight intensity={1.5}/><directionalLight position={[5,12,6]} intensity={2}/>{props.mode==='map'?<Atlas {...props}/>:<Concept use={props.selectedUse}/>}<Rig {...props}/></Canvas>
}
