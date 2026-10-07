import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AttributionQuality,
  EvidenceLevel,
  RuntimeEventType,
} from '../../src/core/evidence-protocol.js';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { EdgeRelation, EvidenceGraph } from '../../src/core/evidence-graph.js';
import { RootCauseGrouper } from '../../src/core/root-cause.js';
import { IncidentFlightRecorder, RecorderState } from '../../src/core/incident-flight-recorder.js';
// DEFERRED — RuntimeResourceOwnershipLedger moved to src/future/; full tests in test/unit/future/
// import { RuntimeResourceOwnershipLedger } from '../../src/core/resource-ownership-ledger.js';
import { _toolEnabled } from '../../src/core/gate.js';

function graphEvent(id, sequence, type, {
  ownerId = 'owner-a',
  parentEventId = null,
  level = EvidenceLevel.OBSERVATION,
} = {}) {
  return Object.freeze({
    id,
    sequence,
    timestamp: sequence,
    type,
    framework: Object.freeze({ name: 'test' }),
    owner: Object.freeze({ id: ownerId, name: ownerId, lifecycleGeneration: 1 }),
    source: null,
    correlation: Object.freeze(parentEventId ? { parentEventId } : {}),
    evidence: Object.freeze({
      level,
      attribution: AttributionQuality.DETERMINISTIC,
      confidence: 1,
    }),
    payload: Object.freeze({}),
  });
}

test('structural parent edges never upgrade cluster evidence strength', () => {
  const parent = graphEvent('p', 1, RuntimeEventType.INTERACTION);
  const child = graphEvent('c', 2, RuntimeEventType.UPDATE_COMPLETED, {
    parentEventId: 'p',
    level: EvidenceLevel.ATTRIBUTION,
  });
  const graph = new EvidenceGraph([parent, child], { includeContextEdges: false });
  const edge = graph.edges()[0];
  assert.equal(edge.relation, EdgeRelation.PARENT);
  assert.equal(edge.evidence.level, EvidenceLevel.CORRELATION);
  assert.equal(new RootCauseGrouper().group(graph)[0].strength, 'correlated');
});

test('context-only edges do not inflate root-cause reachability', () => {
  const interaction = Object.freeze({
    ...graphEvent('i', 1, RuntimeEventType.INTERACTION),
    correlation: Object.freeze({ interactionId: 'edit' }),
  });
  const state = Object.freeze({
    ...graphEvent('s', 2, RuntimeEventType.STATE_CHANGED, { level: EvidenceLevel.ATTRIBUTION }),
    correlation: Object.freeze({ interactionId: 'edit', causedByEventId: 'i' }),
    payload: Object.freeze({ property: 'value' }),
  });
  const request = Object.freeze({
    ...graphEvent('r', 3, RuntimeEventType.UPDATE_REQUESTED, { level: EvidenceLevel.ATTRIBUTION }),
    correlation: Object.freeze({ interactionId: 'edit', causedByEventId: 's' }),
  });
  const symptomA = Object.freeze({
    ...graphEvent('n1', 4, RuntimeEventType.NETWORK_COMPLETED),
    correlation: Object.freeze({ interactionId: 'edit' }),
  });
  const symptomB = Object.freeze({
    ...graphEvent('n2', 5, RuntimeEventType.BROWSER_FRAME),
    correlation: Object.freeze({ interactionId: 'edit' }),
  });

  const cluster = new RootCauseGrouper().group(
    new EvidenceGraph([interaction, state, request, symptomA, symptomB]),
  )[0];

  assert.equal(cluster.rootEventId, 's');
});

test('diagnostic gate is SSR-safe and does not force-enable tools', () => {
  const previousWindow = globalThis.window;
  try {
    delete globalThis.window;
    assert.equal(_toolEnabled('perf'), false);

    globalThis.window = {};
    assert.equal(_toolEnabled('perf'), false);
    assert.equal(globalThis.window.__LDS_PERF_ENABLED__, undefined);
    assert.equal(globalThis.window.__LDS_PROP_DEBUG__, undefined);
    assert.equal(globalThis.window.__LDS_RESOURCE_TRACKER__, undefined);

    globalThis.window.__LDS_NETWORK_ENABLED__ = true;
    assert.equal(_toolEnabled('network'), true);
    assert.equal(_toolEnabled('perf'), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('EvidenceStore keeps a finite default bound when maxEntries is NaN', () => {
  const store = new EvidenceStore({ maxEntries: Number.NaN, privacyPolicy: false, clock: () => 1 });
  for (let i = 0; i < 1005; i += 1) {
    store.emit({
      type: RuntimeEventType.DIAGNOSTIC,
      framework: { name: 'test' },
      evidence: {
        level: EvidenceLevel.OBSERVATION,
        attribution: AttributionQuality.DETERMINISTIC,
        confidence: 1,
      },
      payload: { index: i },
    });
  }
  assert.equal(store.size(), 1000);
  assert.equal(store.resolveReference('evt-1').status, 'evicted');
});

class Store {
  subscribers = new Set();
  subscribe(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }
  emit(event) { for (const fn of this.subscribers) fn(event); }
}

test('IncidentFlightRecorder fails safe for NaN bounds and post-trigger counts', () => {
  const store = new Store();
  const recorder = new IncidentFlightRecorder({ store, maxEvents: Number.NaN, clock: () => 10 });
  store.emit({ id: 'e1', sequence: 1, timestamp: 1 });
  const incident = recorder.freeze({ postTriggerEvents: Number.NaN });
  assert.equal(recorder.state(), RecorderState.FROZEN);
  assert.equal(incident.eventCount, 1);
});

// DEFERRED — resource ledger tests moved to test/unit/future/resource-ownership-ledger.test.mjs
// function owner(id, generation = 1) { ... }
// function resourceEvent(...) { ... }
// test('resource identity is isolated by owner lifecycle even when resource ids collide', ...)
// test('resource ledger normalizes NaN memory bounds instead of disabling pruning', ...)

test('causality-confirmed edge produces confirmed cluster strength', () => {
  // Edge evidence level is derived from the TARGET event (the one with causedByEventId).
  // So e2 must carry CAUSALITY_CONFIRMED to make the CAUSES edge confirmed.
  const store = new EvidenceStore({ maxEntries: 20, privacyPolicy: false, clock: () => 1 });
  const e1 = store.emit({
    type: RuntimeEventType.STATE_CHANGED,
    framework: { name: 'test' },
    owner: { id: 'o1', name: 'Alpha', lifecycleGeneration: 1 },
    evidence: { level: EvidenceLevel.OBSERVATION, attribution: AttributionQuality.DETERMINISTIC, confidence: 1 },
    payload: { property: 'value' },
  });
  store.emit({
    type: RuntimeEventType.UPDATE_COMPLETED,
    framework: { name: 'test' },
    owner: { id: 'o1', name: 'Alpha', lifecycleGeneration: 1 },
    evidence: { level: EvidenceLevel.CAUSALITY_CONFIRMED, attribution: AttributionQuality.DETERMINISTIC, confidence: 1 },
    correlation: { causedByEventId: e1.id },
    payload: { durationMs: 600 },
  });
  const graph = new EvidenceGraph([...store.snapshot()]);
  const clusters = new RootCauseGrouper({ minClusterSize: 2 }).group(graph);
  assert.ok(clusters.length > 0, 'should produce at least one cluster');
  assert.equal(clusters[0].strength, 'confirmed', `expected confirmed but got ${clusters[0].strength}`);
});
