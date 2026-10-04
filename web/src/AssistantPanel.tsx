import { useEffect, useRef, useState } from 'react'
import type { Atlas, Site, UseName } from './types'
import { AssistantSession } from './assistantSession'
import './assistant.css'

const uses: UseName[] = ['Childcare','Study space','Repair workshop','Community hub']
type Action = 'auto'|'explain'|'compare'|'missing'|'search'
type Reference = {id:string;label:string;text:string;section:string;source:string;url:string;retrieved:string;value:number|string|null}
type Answer = {siteId:string;snapshotBuild:string;kind:string;blocks:{kind:string;text:string;evidenceIds:string[]}[];references:Reference[];filterLabels:string[];matchingSiteIds:string[];facts:{label:string;value:number;referenceId:string}[];elapsedMs:number}
type Status = {ready:boolean;message:string;model:string}
type Message = {question:string;answer:Answer}

export default function AssistantPanel({site,atlas,selectedUse,onApply}:{site:Site;atlas:Atlas;selectedUse:UseName;onApply:(ids:string[],labels:string[])=>void}) {
  const [open,setOpen] = useState(false)
  const [status,setStatus] = useState<Status|null>(null)
  const [question,setQuestion] = useState('')
  const [first,setFirst] = useState<UseName>(selectedUse)
  const [second,setSecond] = useState<UseName>(uses.find(u=>u!==selectedUse)!)
  const [messages,setMessages] = useState<Message[]>([])
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const session = useRef(new AssistantSession())
  const form = useRef<HTMLTextAreaElement>(null)
  const statusRequest = useRef<AbortController|null>(null)
  useEffect(()=>()=>{session.current.cancel();statusRequest.current?.abort()},[])
  async function refreshStatus() {
    statusRequest.current?.abort()
    const controller = new AbortController(); statusRequest.current=controller
    try {
      const response=await fetch('/api/assistant/status',{signal:controller.signal})
      if(!response.ok || !response.headers.get('content-type')?.includes('application/json'))throw Error()
      const value=await response.json() as Status
      if(!controller.signal.aborted)setStatus(value)
    } catch {if(!controller.signal.aborted)setStatus({ready:false,model:'qwen3:4b',message:'The local assistant service is not available. Open Second Life through the local assistant launcher; the atlas still works here.'})}
  }
  useEffect(()=>{if(open)void refreshStatus()},[open])
  async function ask(text:string, action:Action='auto') {
    if(!text.trim()||busy)return
    const request=session.current.begin()
    setBusy(true);setError('');setQuestion(text)
    const chosen = action==='compare'?[first,second]:[selectedUse]
    const history=messages.slice(-3).flatMap(m=>[{role:'user',content:m.question},{role:'assistant',content:[...m.answer.blocks.map(b=>b.text),...m.answer.filterLabels].join(' ').slice(0,1200)}])
    const timeout=setTimeout(()=>{if(request.current()){session.current.cancel();setBusy(false);setError('The local assistant timed out. Try a shorter question.')}},62000)
    try {
      const response=await fetch('/api/assistant/query',{method:'POST',headers:{'Content-Type':'application/json'},signal:request.signal,
        body:JSON.stringify({question:text,siteId:site.id,selectedUses:chosen,snapshotVersion:atlas.metadata.schemaVersion,snapshotBuild:atlas.metadata.generatedAt,history,action})})
      const result=await response.json()
      if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'The local assistant could not answer that question.')
      if(result.siteId!==site.id||result.snapshotBuild!==atlas.metadata.generatedAt||!Array.isArray(result.blocks)||!Array.isArray(result.references)||!Array.isArray(result.matchingSiteIds))throw Error('The answer did not match this evidence snapshot. Reload and try again.')
      const ids=new Set(atlas.sites.map(s=>s.id))
      if(result.matchingSiteIds.some((id:unknown)=>typeof id!=='string'||!ids.has(id)))throw Error('The search contained an unknown site. No filters were applied.')
      if(request.current()){setMessages(prev=>[...prev.slice(-4),{question:text,answer:result as Answer}]);setQuestion('')}
    } catch(cause) {
      if(request.current())setError(cause instanceof Error?cause.message:'The local assistant is unavailable.')
    } finally {clearTimeout(timeout);if(request.current())setBusy(false)}
  }
  function cancel(){session.current.cancel();setBusy(false);setError('Question cancelled. Your evidence and map are unchanged.')}
  return <section className="assistant" aria-label="Local evidence assistant">
    <button className="assistant-toggle" aria-expanded={open} aria-controls="assistant-content" onClick={()=>setOpen(v=>!v)}><span><small>LOCAL EVIDENCE ASSISTANT</small><strong>Ask about this place</strong></span><span aria-hidden="true">{open?'−':'+'}</span></button>
    {open&&<div id="assistant-content" className="assistant-content">
      <p className="assistant-intro">Explore the evidence for {site.id}. Questions stay on this computer. Answers use this saved snapshot.</p>
      <div className="assistant-status" role="status"><span>{status?.message||'Checking the local model…'}</span>{!status?.ready&&<button onClick={()=>void refreshStatus()}>Check again</button>}</div>
      <div className="assistant-starters">
        <button disabled={busy||!status?.ready} onClick={()=>void ask(`Explain ${selectedUse} for this site.`,'explain')}>Explain this use</button>
        <button disabled={busy||!status?.ready} onClick={()=>void ask(`Compare ${first} and ${second} for this site.`,'compare')}>Compare two uses</button>
        <button disabled={busy||!status?.ready} onClick={()=>void ask('What evidence is missing for this site?','missing')}>What evidence is missing?</button>
        <button disabled={busy||!status?.ready} onClick={()=>{setQuestion('Show sites with cached evidence, ordered by study space score.');form.current?.focus()}}>Find matching sites</button>
      </div>
      <div className="assistant-compare"><label>First use<select value={first} onChange={e=>{const value=e.target.value as UseName;setFirst(value);if(value===second)setSecond(uses.find(u=>u!==value)!)}}>{uses.map(u=><option key={u}>{u}</option>)}</select></label><label>Compare with<select value={second} onChange={e=>setSecond(e.target.value as UseName)}>{uses.filter(u=>u!==first).map(u=><option key={u}>{u}</option>)}</select></label></div>
      <div className="assistant-messages" aria-live="polite" aria-busy={busy}>
        {messages.map((message,i)=><article className="assistant-answer" key={i}><h3>{message.question}</h3><span className="assistant-label">LOCAL AI EXPLANATION · VERIFIED SNAPSHOT FACTS</span>
          {message.answer.facts.length>0&&<dl className="assistant-facts">{message.answer.facts.map(f=><div key={f.referenceId}><dt>{f.label}</dt><dd>{f.referenceId.startsWith('use.')?`${f.value.toFixed(1)} / 100`:f.referenceId.includes('share')?`${(f.value*100).toFixed(1)}%`:f.value.toLocaleString('en-IE')}</dd></div>)}</dl>}
          {message.answer.blocks.map((block,j)=><div className={`assistant-block assistant-block--${block.kind}`} key={j}><small>{block.kind==='uncertainty'?'WHAT THIS DOES NOT ESTABLISH':block.kind==='next_checks'?'NEXT QUESTIONS':'SUPPORTING EVIDENCE'}</small><p>{block.text}</p><div className="assistant-citations">{block.evidenceIds.map(id=><a key={id} onClick={event=>{const target=document.getElementById(event.currentTarget.hash.slice(1));const details=target?.closest('details');if(details)details.open=true}} href={`#assistant-ref-${i}-${id.replaceAll('.','-')}`}>{message.answer.references.find(r=>r.id===id)?.label||id}</a>)}</div></div>)}
          {message.answer.kind==='search'&&<div className="assistant-results"><div className="assistant-chips">{message.answer.filterLabels.map(label=><span key={label}>{label}</span>)}</div><ol>{message.answer.matchingSiteIds.slice(0,5).map(id=><li key={id}>{id} · {atlas.sites.find(s=>s.id===id)?.title}</li>)}</ol><p>{message.answer.matchingSiteIds.length} matching sites{message.answer.matchingSiteIds.length>5?' · first five shown':''}</p><button onClick={()=>onApply(message.answer.matchingSiteIds,message.answer.filterLabels)}>Show on map</button></div>}
          {message.answer.references.length>0&&<details><summary>Sources and evidence ({message.answer.references.length})</summary>{message.answer.references.map(ref=><div className="assistant-reference" id={`assistant-ref-${i}-${ref.id.replaceAll('.','-')}`} key={ref.id}><strong>{ref.label}</strong><p>{ref.text}</p><a href={ref.url} target="_blank" rel="noreferrer">{ref.source} ↗</a><small>Retrieved {ref.retrieved}</small></div>)}</details>}
        </article>)}
      </div>
      <form onSubmit={event=>{event.preventDefault();void ask(question)}}><label htmlFor="assistant-question">Your question<textarea id="assistant-question" ref={form} value={question} maxLength={1200} rows={3} onChange={e=>setQuestion(e.target.value)} placeholder="Why does this use appear, or which sites match my criteria?"/></label><div className="assistant-submit"><button disabled={busy||!status?.ready||!question.trim()} type="submit">Ask locally ↗</button>{busy&&<button type="button" onClick={cancel}>Cancel</button>}</div></form>
      {busy&&<p role="status">Reading the local evidence… This can take up to a minute.</p>}{error&&<p className="assistant-error" role="alert">{error}</p>}
      <small className="assistant-note">AI selects relevant evidence; figures and source links come from the snapshot. Check the interpreted filters before applying them. This is not planning or ownership advice.</small>
    </div>}
  </section>
}

