// Local Vite verification page; not an entry in the production build.
import { createRoot } from 'react-dom/client'
import { useRef, useState } from 'react'
import ProductApp from './ProductApp'
import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import '@fontsource/newsreader/500.css'
import 'leaflet/dist/leaflet.css'

const params = new URLSearchParams(location.search)
if(params.has('reducedMotion')) {
  const matchMedia = window.matchMedia.bind(window)
  window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? { ...matchMedia(query), matches:true } as MediaQueryList : matchMedia(query)
}
if(params.has('slowFrames')) {
  const requestFrame = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = callback => requestFrame(time => { setTimeout(() => callback(time),45) })
}
const originalFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if(new URL(url,location.href).origin !== location.origin) return Promise.reject(Error('External request blocked during verification'))
  if(params.has('missingScene') && url.includes('dublin_scene.json'))return Promise.resolve(new Response('',{status:404}))
  return originalFetch(input,init)
}
if(params.has('noWebGL')) {
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
    if(String(args[0]).startsWith('webgl'))return null
    return getContext.apply(this,args)
  } as typeof getContext
}
function Recording() {
  const recorder = useRef<MediaRecorder | null>(null)
  const [recording,setRecording] = useState(false)
  const [url,setUrl] = useState('')
  const [encoded,setEncoded] = useState('')
  return <><button onClick={() => {
    if(recording){recorder.current?.stop();setRecording(false);return}
    const canvas=document.querySelector('.spatial-stage canvas') as HTMLCanvasElement | null
    if(!canvas)return
    const stream=canvas.captureStream(30), chunks:Blob[]=[]
    recorder.current=new MediaRecorder(stream,{mimeType:'video/webm'})
    recorder.current.ondataavailable=event=>chunks.push(event.data)
    recorder.current.onstop=()=>{setUrl(URL.createObjectURL(new Blob(chunks,{type:'video/webm'})));stream.getTracks().forEach(track=>track.stop())}
    recorder.current.start();setRecording(true)
  }}>{recording?'Stop recording':'Record scene'}</button>{url&&<><a href={url} download="second-life-interaction.webm">Download recording</a><button onClick={async()=>{
    const reader=new FileReader();reader.onload=()=>setEncoded(String(reader.result));reader.readAsDataURL(await (await fetch(url)).blob())
  }}>Export recording bytes</button></>}{encoded&&<textarea aria-label="Recording data" readOnly value={encoded}/>}</>
}
createRoot(document.getElementById('verification')!).render(<div style={{padding:12,background:'#fff'}}><strong>Local verification</strong> <Recording/> <button onClick={() => {
  const canvas = document.querySelector('.spatial-stage canvas') as HTMLCanvasElement | null
  canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
}}>Lose WebGL context</button> <a href="?noWebGL=1">Unavailable WebGL</a> · <a href="?missingScene=1">Missing scene</a></div>)
createRoot(document.getElementById('root')!).render(<ProductApp/> )
