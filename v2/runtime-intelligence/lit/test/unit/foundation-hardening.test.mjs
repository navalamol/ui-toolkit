import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceEvent, RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { EvidenceStore } from '../../src/core/evidence-store.js';

test('snapshot preserves repeated shared references without mislabeling them circular', () => {
  const shared={value:7};
  const event=createEvidenceEvent({
    type:RuntimeEventType.DIAGNOSTIC,
    framework:{name:'plain'},
    payload:{left:shared,right:shared},
  },{id:'shared',sequence:1,timestamp:1});
  assert.equal(event.payload.left.value,7);
  assert.equal(event.payload.right.value,7);
  assert.notEqual(event.payload.right,'[Circular]');
  assert.equal(event.payload.left,event.payload.right);
});

test('snapshot converts actual cycles to a safe marker', () => {
  const cyclic={name:'root'}; cyclic.self=cyclic;
  const event=createEvidenceEvent({
    type:RuntimeEventType.DIAGNOSTIC,
    framework:{name:'plain'},
    payload:{cyclic},
  },{id:'cyclic',sequence:1,timestamp:1});
  assert.equal(event.payload.cyclic.self,'[Circular]');
});

test('store rejects duplicate ids while id is retained or tombstoned', () => {
  const store=new EvidenceStore({maxEntries:50});
  store.emit({id:'stable-id',type:RuntimeEventType.DIAGNOSTIC,framework:{name:'plain'}});
  assert.throws(()=>store.emit({id:'stable-id',type:RuntimeEventType.DIAGNOSTIC,framework:{name:'plain'}}),/Duplicate runtime evidence id/);
  for(let i=0;i<50;i++) store.emit({type:RuntimeEventType.DIAGNOSTIC,framework:{name:'plain'},payload:{i}});
  assert.equal(store.resolveReference('stable-id').status,'evicted');
  assert.throws(()=>store.emit({id:'stable-id',type:RuntimeEventType.DIAGNOSTIC,framework:{name:'plain'}}),/Duplicate runtime evidence id/);
});
