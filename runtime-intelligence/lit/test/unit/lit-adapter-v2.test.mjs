import test from 'node:test'; import assert from 'node:assert/strict';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { LitAdapter } from '../../src/adapter/lit/LitAdapter.js';
function fakeLit(){return {localName:'product-editor',value:{id:2},requestUpdate(){},async performUpdate(){},updateComplete:Promise.resolve(),constructor:{properties:{value:{type:Object}}},updated(){}};}

test('Lit lifecycle ids are unique per connection while physical instance id is stable',()=>{
  const store=new EvidenceStore(); const adapter=new LitAdapter({store}); const el=fakeLit();
  const first=adapter.connect(el); adapter.disconnect(el); const second=adapter.connect(el);
  assert.notEqual(first.id,second.id); assert.equal(first.instanceId,second.instanceId); assert.equal(first.lifecycleGeneration,1); assert.equal(second.lifecycleGeneration,2);
});

test('Lit adapter preserves causal update order',()=>{
  const store=new EvidenceStore(); const adapter=new LitAdapter({store}); const el=fakeLit(); adapter.connect(el);
  adapter.recordUpdateRequested(el,'value',{id:1}); adapter.recordUpdateStarted(el); adapter.recordUpdateCompleted(el);
  const events=store.snapshot(); const state=events.find(e=>e.type===RuntimeEventType.STATE_CHANGED); const req=events.find(e=>e.type===RuntimeEventType.UPDATE_REQUESTED); const start=events.find(e=>e.type===RuntimeEventType.UPDATE_STARTED); const done=events.find(e=>e.type===RuntimeEventType.UPDATE_COMPLETED);
  assert.equal(req.correlation.causedByEventId,state.id); assert.equal(start.correlation.parentEventId,req.id); assert.equal(done.correlation.parentEventId,start.id);
});

test('disconnect clears unfinished correlation state',()=>{
  const store=new EvidenceStore(); const adapter=new LitAdapter({store}); const el=fakeLit(); adapter.connect(el); adapter.recordUpdateRequested(el,'value',{id:1}); adapter.recordUpdateStarted(el); adapter.disconnect(el); adapter.connect(el);
  const completed=adapter.recordUpdateCompleted(el); assert.equal(completed.correlation.causedByEventId,null); assert.equal(completed.payload.durationMs,null);
});
