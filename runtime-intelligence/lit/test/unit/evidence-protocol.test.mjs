import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AttributionQuality, CapabilitySupport, EvidenceLevel, FrameworkCapability,
  RuntimeEventType, RuntimeValueCapture, createEvidenceEvent,
  summarizeRuntimeValue, validateEvidenceEvent,
} from '../../src/core/evidence-protocol.js';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { FrameworkAdapter } from '../../src/adapter/FrameworkAdapter.js';

test('event snapshots are deeply immutable and detached from input objects', () => {
  const payload={nested:{count:1},items:[{x:1}]};
  const event=createEvidenceEvent({type:RuntimeEventType.DIAGNOSTIC,framework:{name:'plain'},payload},{id:'evt-1',sequence:1,timestamp:1});
  payload.nested.count=99; payload.items[0].x=99;
  assert.equal(event.payload.nested.count,1); assert.equal(event.payload.items[0].x,1);
  assert.equal(Object.isFrozen(event),true); assert.equal(Object.isFrozen(event.payload),true); assert.equal(Object.isFrozen(event.payload.nested),true);
});

test('bounded values are explicit about privacy and shape-only mode hides primitive content', () => {
  const bounded=summarizeRuntimeValue('person@example.com');
  assert.equal(bounded.summary,'person@example.com'); assert.equal(bounded.redacted,false);
  const safe=summarizeRuntimeValue('person@example.com',{capture:RuntimeValueCapture.SHAPE_ONLY});
  assert.equal(safe.summary,'String[18]'); assert.equal(safe.redacted,true);
});

test('bounded store tracks present, evicted, and unknown correlation references', () => {
  let now=0; const store=new EvidenceStore({maxEntries:50,clock:()=>++now});
  const first=store.emit({type:RuntimeEventType.INTERACTION,framework:{name:'plain'}});
  for(let i=0;i<50;i++) store.emit({type:RuntimeEventType.DIAGNOSTIC,framework:{name:'plain'},payload:{i}});
  assert.equal(store.resolveReference(first.id).status,'evicted');
  assert.equal(store.resolveReference('never-seen').status,'unknown');
});

test('store rejects causal references to unknown events', () => {
  const store=new EvidenceStore();
  assert.throws(()=>store.emit({type:RuntimeEventType.DIAGNOSTIC,framework:{name:'plain'},correlation:{causedByEventId:'missing'}}),/unknown/);
  const a=store.emit({type:RuntimeEventType.INTERACTION,framework:{name:'plain'}});
  const b=store.emit({type:RuntimeEventType.STATE_CHANGED,framework:{name:'plain'},correlation:{causedByEventId:a.id}});
  assert.equal(b.correlation.causedByEventId,a.id);
});

test('protocol fixtures represent React Vue Angular and Svelte without framework-specific event names', () => {
  const fixtures=[
    createEvidenceEvent({type:RuntimeEventType.UPDATE_COMPLETED,framework:{name:'react'},owner:{id:'r1',name:'Grid'},evidence:{level:EvidenceLevel.CORRELATION,attribution:AttributionQuality.FRAMEWORK_REPORTED,confidence:.8},payload:{durationMs:12}},{id:'r',sequence:1,timestamp:1}),
    createEvidenceEvent({type:RuntimeEventType.DEPENDENCY_TRIGGERED,framework:{name:'vue'},owner:{id:'v1',name:'Grid'},evidence:{level:EvidenceLevel.ATTRIBUTION,attribution:AttributionQuality.FRAMEWORK_REPORTED,confidence:.98},payload:{key:'filters.status',operation:'set'}},{id:'v',sequence:2,timestamp:2}),
    createEvidenceEvent({type:RuntimeEventType.UPDATE_STARTED,framework:{name:'angular'},owner:{id:'a1',name:'Grid'},evidence:{level:EvidenceLevel.OBSERVATION,attribution:AttributionQuality.FRAMEWORK_REPORTED,confidence:.95},payload:{phase:'change-detection'}},{id:'a',sequence:3,timestamp:3}),
    createEvidenceEvent({type:RuntimeEventType.DEPENDENCY_TRIGGERED,framework:{name:'svelte'},owner:{id:'s1',name:'Grid'},evidence:{level:EvidenceLevel.ATTRIBUTION,attribution:AttributionQuality.FRAMEWORK_REPORTED,confidence:.95},payload:{kind:'effect-trace'}},{id:'s',sequence:4,timestamp:4}),
  ];
  for(const event of fixtures) assert.deepEqual(validateEvidenceEvent(event),{valid:true,errors:[]});
});

test('capability minimum checks accept stronger support but reject weaker support', () => {
  const adapter=new FrameworkAdapter({framework:'lit',store:new EvidenceStore(),capabilities:{
    [FrameworkCapability.OWNER_LIFECYCLE]:CapabilitySupport.DETERMINISTIC,
    [FrameworkCapability.UPDATE_CAUSE]:CapabilitySupport.FRAMEWORK_REPORTED,
    [FrameworkCapability.SOURCE_LOCATION]:CapabilitySupport.PARTIAL,
    [FrameworkCapability.RESOURCE_OWNERSHIP]:CapabilitySupport.INFERRED,
  }});
  assert.equal(adapter.supports(FrameworkCapability.OWNER_LIFECYCLE,CapabilitySupport.PARTIAL),true);
  assert.equal(adapter.supports(FrameworkCapability.UPDATE_CAUSE,CapabilitySupport.PARTIAL),true);
  assert.equal(adapter.supports(FrameworkCapability.SOURCE_LOCATION,CapabilitySupport.FRAMEWORK_REPORTED),false);
});
