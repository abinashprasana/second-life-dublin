import test from 'node:test'
import assert from 'node:assert/strict'
import {AssistantSession} from '../src/assistantSession.ts'
test('site change or cancellation invalidates a late answer',()=>{
  const session=new AssistantSession(), request=session.begin()
  session.cancel()
  assert.equal(request.signal.aborted,true)
  assert.equal(request.current(),false)
})
test('superseded answers cannot replace the current result',()=>{
  const session=new AssistantSession(), old=session.begin(), current=session.begin()
  assert.equal(old.current(),false)
  assert.equal(current.current(),true)
})
