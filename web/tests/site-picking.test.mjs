import test from 'node:test'
import assert from 'node:assert/strict'
import {pickSite,nearbySites,isSiteClick} from '../src/sitePicking.ts'
const sites=[{id:'A',x:100,y:100,depth:0},{id:'B',x:120,y:100,depth:0}]
test('hollow centre and nearby clicks select a marker',()=>{
  assert.equal(pickSite(sites,100,100),'A')
  assert.equal(pickSite(sites,100,112),'A')
  assert.equal(pickSite(sites,100,120),null)
})
test('overlapping targets choose nearest with stable ties',()=>{
  assert.equal(pickSite(sites,114,100),'B')
  assert.equal(pickSite([...sites].reverse(),110,100),'A')
})
test('clipped markers are excluded and touch targets expand',()=>{
  assert.equal(pickSite([{...sites[0],depth:2}],100,100),null)
  assert.equal(pickSite(sites,100,120,22),'A')
})
test('click tolerates jitter but does not select while orbiting',()=>{
  assert.equal(isSiteClick({x:0,y:0},{x:3,y:4}),true)
  assert.equal(isSiteClick({x:0,y:0},{x:7,y:0}),false)
})
test('overlapping addresses remain available in a site chooser',()=>{
  const close=[{id:'DS2073',x:101,y:102,depth:0},{id:'DS2071',x:100,y:100,depth:0},{id:'DS2072',x:101,y:101,depth:0}]
  assert.deepEqual(nearbySites(close,100,100,14),['DS2071','DS2072','DS2073'])
  assert.deepEqual(nearbySites([{...close[0],depth:2}],100,100,14),[])
})
