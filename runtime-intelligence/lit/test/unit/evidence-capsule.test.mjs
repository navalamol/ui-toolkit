import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceCapsule, MAX_EXPORTED_EVIDENCE_REFERENCES } from '../../src/core/evidence-capsule.js';

const incident = Object.freeze({
  triggerEventId:'err', triggerSequence:2, reason:'runtime-error',
  events:Object.freeze([
    Object.freeze({ id:'s', sequence:1, timestamp:10, type:'state.changed', owner:Object.freeze({id:'o1',name:'Editor'}), evidence:Object.freeze({level:'attribution',attribution:'framework-reported',confidence:.9}), correlation:Object.freeze({traceId:'t',interactionId:'i',parentEventId:null,causedByEventId:null}), payload:Object.freeze({secret:'must-not-export'}) }),
    Object.freeze({ id:'err', sequence:2, timestamp:20, type:'error', owner:Object.freeze({id:'o2',name:'Grid'}), evidence:Object.freeze({level:'observation',attribution:'unknown',confidence:null}), correlation:Object.freeze({traceId:'t',interactionId:'i',parentEventId:null,causedByEventId:'s'}), payload:Object.freeze({token:'also-secret'}) }),
  ]),
});

test('Evidence Capsule is portable, immutable and omits raw runtime payloads', () => {
  const capsule = createEvidenceCapsule({
    id:'capsule-1', createdAt:100,
    problem:{summary:'edit causes render storm'},
    incident,
    owner:{name:'Editor'},
    source:{file:'http://localhost/src/Editor.js?token=secret#x',line:10,column:2,attributionQuality:'source-attributed',confidence:.9},
    rootCause:{id:'cluster-1',strength:'attributed',rootEventId:'s',rootLabel:'Editor.value',score:12,symptoms:[{type:'error',count:1}],candidates:[]},
    causalChain:[{fromEventId:'s',toEventId:'err',relation:'causes',evidence:{level:'observation'}}],
    verification:{outcome:'confirmed',evidenceLevel:'causality-confirmed'},
    environment:{framework:'lit'},
  });
  assert.equal(capsule.schema, 'RUF Evidence Capsule');
  assert.equal(capsule.evidence.eventCount, 2);
  assert.equal(capsule.evidence.payloadsIncluded, false);
  assert.equal('payload' in capsule.evidence.references[0], false);
  assert.equal(JSON.stringify(capsule).includes('must-not-export'), false);
  assert.equal(JSON.stringify(capsule).includes('also-secret'), false);
  assert.equal(JSON.stringify(capsule).includes('token=secret'), false);
  assert.equal(JSON.stringify(capsule).includes('traceId'), false);
  assert.equal(capsule.evidence.references[0].correlation.hasTraceContext, true);
  assert.equal(Object.isFrozen(capsule), true);
  assert.equal(Object.isFrozen(capsule.evidence.references), true);
  assert.doesNotThrow(() => JSON.stringify(capsule));
});

test('Evidence Capsule prompt preserves evidence-honesty instruction', () => {
  const capsule = createEvidenceCapsule({ id:'c', problem:{title:'slow edit'}, incident });
  assert.match(capsule.aiPrompt, /do not promote correlation to causality/i);
  assert.equal(capsule.trigger.eventId, 'err');
});

test('Evidence Capsule bounds duplicated forensic references while preserving total event count', () => {
  const events = Object.freeze(Array.from({ length: 100 }, (_, index) => Object.freeze({
    id: `e-${index + 1}`,
    sequence: index + 1,
    timestamp: index + 1,
    type: 'diagnostic',
    owner: Object.freeze({ id: 'owner-1', name: 'Grid' }),
    evidence: Object.freeze({ level: 'observation', attribution: 'unknown', confidence: null }),
    correlation: Object.freeze({ traceId: null, interactionId: null, parentEventId: null, causedByEventId: null }),
    payload: Object.freeze({ large: 'not-exported' }),
  })));
  const largeIncident = Object.freeze({
    triggerEventId: 'e-100',
    triggerSequence: 100,
    reason: 'runtime-error',
    events,
  });

  const capsule = createEvidenceCapsule({ id:'bounded', problem:{title:'bounded'}, incident:largeIncident });
  assert.equal(capsule.evidence.eventCount, 100);
  assert.equal(capsule.evidence.references.length, MAX_EXPORTED_EVIDENCE_REFERENCES);
  assert.equal(capsule.evidence.eventIds.length, MAX_EXPORTED_EVIDENCE_REFERENCES);
  assert.equal(capsule.evidence.omittedReferences, 100 - MAX_EXPORTED_EVIDENCE_REFERENCES);
  assert.equal(capsule.evidence.eventIds.at(-1), 'e-100');
});
