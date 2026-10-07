import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceLevel, AttributionQuality, RuntimeEventType, createEvidenceEvent } from '../../src/core/evidence-protocol.js';
import { EdgeRelation, EvidenceGraph } from '../../src/core/evidence-graph.js';
import { RootCauseGrouper } from '../../src/core/root-cause.js';

function event(id, sequence, type, { owner='ProductEditor', correlation={}, payload={}, level=EvidenceLevel.OBSERVATION, attribution=AttributionQuality.DETERMINISTIC } = {}) {
  return createEvidenceEvent({
    type,
    framework:{name:'lit'},
    owner:{id:`owner-${owner}`,name:owner},
    correlation,
    evidence:{level,attribution,confidence:.95},
    payload,
  },{id,sequence,timestamp:sequence});
}

test('graph preserves explicit causality and structural lineage without upgrading context correlation', () => {
  const interaction=event('i',1,RuntimeEventType.INTERACTION,{correlation:{interactionId:'click-1'}});
  const state=event('s',2,RuntimeEventType.STATE_CHANGED,{correlation:{interactionId:'click-1',causedByEventId:'i'},payload:{property:'value'},level:EvidenceLevel.ATTRIBUTION,attribution:AttributionQuality.FRAMEWORK_REPORTED});
  const requested=event('r',3,RuntimeEventType.UPDATE_REQUESTED,{correlation:{interactionId:'click-1',causedByEventId:'s',parentEventId:'s'},level:EvidenceLevel.ATTRIBUTION,attribution:AttributionQuality.FRAMEWORK_REPORTED});
  const completed=event('c',4,RuntimeEventType.UPDATE_COMPLETED,{correlation:{interactionId:'click-1',parentEventId:'r'}});
  const network=event('n',5,RuntimeEventType.NETWORK_COMPLETED,{correlation:{interactionId:'click-1'}});
  const graph=new EvidenceGraph([interaction,state,requested,completed,network]);
  assert.equal(graph.edges().some(edge=>edge.fromEventId==='s'&&edge.toEventId==='r'&&edge.relation===EdgeRelation.CAUSES),true);
  assert.equal(graph.edges().some(edge=>edge.fromEventId==='r'&&edge.toEventId==='c'&&edge.relation===EdgeRelation.PARENT),true);
  const inferred=graph.edges().find(edge=>edge.toEventId==='n');
  assert.equal(inferred.relation,EdgeRelation.INTERACTION_CONTEXT);
  assert.equal(inferred.evidence.level,EvidenceLevel.CORRELATION);
  assert.equal(inferred.inferred,true);
});

test('graph never accepts future explicit cause as an edge', () => {
  const a=event('a',1,RuntimeEventType.STATE_CHANGED,{correlation:{causedByEventId:'b'}});
  const b=event('b',2,RuntimeEventType.UPDATE_REQUESTED);
  const graph=new EvidenceGraph([a,b]);
  assert.equal(graph.edges().some(edge=>edge.fromEventId==='b'&&edge.toEventId==='a'),false);
});

test('context edges are always chronological even when interaction marker arrives late', () => {
  const frame=event('f',1,RuntimeEventType.BROWSER_FRAME,{correlation:{interactionId:'late'}});
  const state=event('s',2,RuntimeEventType.STATE_CHANGED,{correlation:{interactionId:'late'}});
  const interaction=event('i',3,RuntimeEventType.INTERACTION,{correlation:{interactionId:'late'}});
  const graph=new EvidenceGraph([frame,state,interaction]);
  for (const edge of graph.edges()) {
    assert.equal(graph.node(edge.fromEventId).sequence < graph.node(edge.toEventId).sequence,true);
  }
  assert.equal(graph.edges().some(edge=>edge.fromEventId==='i'&&(edge.toEventId==='f'||edge.toEventId==='s')),false);
});

test('root-cause grouping collapses downstream symptoms under the earliest attributed state change', () => {
  const interaction=event('i',1,RuntimeEventType.INTERACTION,{correlation:{interactionId:'edit'}});
  const state=event('s',2,RuntimeEventType.STATE_CHANGED,{correlation:{interactionId:'edit',causedByEventId:'i'},payload:{property:'value'},level:EvidenceLevel.ATTRIBUTION,attribution:AttributionQuality.FRAMEWORK_REPORTED});
  const request=event('r',3,RuntimeEventType.UPDATE_REQUESTED,{correlation:{interactionId:'edit',causedByEventId:'s'},level:EvidenceLevel.ATTRIBUTION,attribution:AttributionQuality.FRAMEWORK_REPORTED});
  const render=event('u',4,RuntimeEventType.UPDATE_COMPLETED,{owner:'ProductGrid',correlation:{interactionId:'edit',causedByEventId:'r'}});
  const network1=event('n1',5,RuntimeEventType.NETWORK_COMPLETED,{owner:'ProductGrid',correlation:{interactionId:'edit'}});
  const network2=event('n2',6,RuntimeEventType.NETWORK_COMPLETED,{owner:'ProductGrid',correlation:{interactionId:'edit'}});
  const frame=event('f',7,RuntimeEventType.BROWSER_FRAME,{owner:'ProductGrid',correlation:{interactionId:'edit'}});
  const graph=new EvidenceGraph([interaction,state,request,render,network1,network2,frame]);
  const clusters=new RootCauseGrouper().group(graph);
  assert.equal(clusters.length,1);
  assert.equal(clusters[0].rootEventId,'s');
  assert.equal(clusters[0].rootLabel,'ProductEditor.value');
  assert.equal(clusters[0].strength,'attributed');
  assert.deepEqual(clusters[0].symptoms.find(item=>item.type===RuntimeEventType.NETWORK_COMPLETED),{type:RuntimeEventType.NETWORK_COMPLETED,count:2});
});

test('correlation-only cluster remains correlated rather than attributed', () => {
  const interaction=event('i',1,RuntimeEventType.INTERACTION,{correlation:{interactionId:'x'}});
  const frame=event('f',2,RuntimeEventType.BROWSER_FRAME,{correlation:{interactionId:'x'},level:EvidenceLevel.OBSERVATION});
  const cluster=new RootCauseGrouper().group(new EvidenceGraph([interaction,frame]))[0];
  assert.equal(cluster.strength,'correlated');
});

test('explicit causal-shaped edge does not upgrade cluster without attribution-grade evidence', () => {
  const interaction=event('i',1,RuntimeEventType.INTERACTION);
  const state=event('s',2,RuntimeEventType.STATE_CHANGED,{correlation:{causedByEventId:'i'},payload:{property:'value'},level:EvidenceLevel.OBSERVATION,attribution:AttributionQuality.UNKNOWN});
  const cluster=new RootCauseGrouper().group(new EvidenceGraph([interaction,state]))[0];
  assert.equal(cluster.strength,'correlated');
});
