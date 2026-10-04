import test from 'node:test'
import assert from 'node:assert/strict'
import {cityCameraDistance,FrameQuality} from '../src/sceneControls.ts'

test('city framing expands for portrait and wider geography',()=>{
  const bounds=[-5000,-5000,7000,6000]
  const landscape=cityCameraDistance(bounds,1.8)
  assert.ok(cityCameraDistance(bounds,.6)>landscape)
  assert.ok(cityCameraDistance([-10000,-10000,14000,12000],1.8)>landscape)
  assert.ok(Number.isFinite(cityCameraDistance(bounds,0)))
})
test('idle pauses and first active frames do not lower quality',()=>{
  const quality=new FrameQuality()
  for(let i=0;i<100;i++){
    assert.equal(quality.sample(5,false),false)
    assert.equal(quality.sample(5,true),false)
  }
})
test('sustained active performance below 30fps lowers quality',()=>{
  const quality=new FrameQuality()
  assert.ok(Array.from({length:20},()=>quality.sample(.05,true)).includes(true))
})
test('60fps interaction does not lower quality',()=>{
  const quality=new FrameQuality()
  assert.ok(Array.from({length:180},()=>quality.sample(1/60,true)).every(v=>!v))
})
