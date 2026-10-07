import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AttributionQuality,
  CapabilitySupport,
  EvidenceLevel,
  FrameworkCapability,
  RuntimeEventType,
} from '../../src/core/evidence-protocol.js';
import {
  ResourceFindingKind,
  ResourceStatus,
  RuntimeResourceOwnershipLedger,
} from '../../src/core/resource-ownership-ledger.js';

const owner = (generation = 1, id = 'cmp') => ({
  id,
  name: 'ProductGrid',
  kind: 'component',
  instanceId: 1,
  lifecycleGeneration: generation,
});

function event(id, sequence, type, {
  owner: eventOwner = owner(),
  resourceId = null,
  resourceType = 'event-listener',
  attribution = AttributionQuality.DETERMINISTIC,
  confidence = 1,
  source = null,
} = {}) {
  return Object.freeze({
    id,
    sequence,
    timestamp: sequence * 10,
    type,
    framework: Object.freeze({ name: 'lit' }),
    owner: eventOwner ? Object.freeze({ ...eventOwner }) : null,
    source,
    evidence: Object.freeze({ level: EvidenceLevel.OBSERVATION, attribution, confidence }),
    payload: Object.freeze(resourceId ? { resourceId, resourceType } : {}),
  });
}

test('confirms a lifetime violation only with strong ownership and lifecycle evidence', () => {
  const ledger = new RuntimeResourceOwnershipLedger();
  ledger.ingest(event('create', 1, RuntimeEventType.OWNER_CREATED));
  ledger.ingest(event('acquire', 2, RuntimeEventType.RESOURCE_ACQUIRED, {
    resourceId: 'listener-1',
    source: { file: 'http://localhost/app.js?token=secret#x', line: 12, column: 4 },
  }));
  const [finding] = ledger.ingest(event('destroy', 3, RuntimeEventType.OWNER_DESTROYED));

  assert.equal(finding.kind, ResourceFindingKind.LIFETIME_VIOLATION);
  assert.equal(finding.confirmed, true);
  assert.equal(finding.evidence.level, EvidenceLevel.LIFETIME_VIOLATION);
  assert.equal(finding.evidence.attribution, AttributionQuality.DETERMINISTIC);
  assert.equal(finding.source.file, 'http://localhost/app.js');
  assert.equal(ledger.activeResources().length, 1, 'violating resource remains physically active');
});

test('release before owner destruction prevents a false violation', () => {
  const ledger = new RuntimeResourceOwnershipLedger();
  ledger.ingest(event('create', 1, RuntimeEventType.OWNER_CREATED));
  ledger.ingest(event('acquire', 2, RuntimeEventType.RESOURCE_ACQUIRED, { resourceId: 'timer-1', resourceType: 'timeout' }));
  ledger.ingest(event('release', 3, RuntimeEventType.RESOURCE_RELEASED, { resourceId: 'timer-1', resourceType: 'timeout' }));
  const findings = ledger.ingest(event('destroy', 4, RuntimeEventType.OWNER_DESTROYED));

  assert.equal(findings.length, 0);
  assert.equal(ledger.resource('timer-1').status, ResourceStatus.RELEASED);
});

test('framework capability caps deterministic-looking evidence to suspected when ownership is partial', () => {
  const ledger = new RuntimeResourceOwnershipLedger({
    capabilityResolver(_framework, capability) {
      if (capability === FrameworkCapability.RESOURCE_OWNERSHIP) return CapabilitySupport.PARTIAL;
      return CapabilitySupport.DETERMINISTIC;
    },
  });
  ledger.ingest(event('create', 1, RuntimeEventType.OWNER_CREATED));
  ledger.ingest(event('acquire', 2, RuntimeEventType.RESOURCE_ACQUIRED, { resourceId: 'sub-1', resourceType: 'subscription' }));
  const [finding] = ledger.ingest(event('destroy', 3, RuntimeEventType.OWNER_DESTROYED));

  assert.equal(finding.kind, ResourceFindingKind.SUSPECTED_LIFETIME_VIOLATION);
  assert.equal(finding.confirmed, false);
  assert.equal(finding.evidence.level, EvidenceLevel.CORRELATION);
  assert.equal(finding.capability.resourceOwnership, CapabilitySupport.PARTIAL);
});

test('weak owner-lifecycle support also prevents a confirmed lifetime violation', () => {
  const ledger = new RuntimeResourceOwnershipLedger({
    capabilityResolver(_framework, capability) {
      if (capability === FrameworkCapability.OWNER_LIFECYCLE) return CapabilitySupport.PARTIAL;
      return CapabilitySupport.DETERMINISTIC;
    },
  });
  ledger.ingest(event('create', 1, RuntimeEventType.OWNER_CREATED));
  ledger.ingest(event('acquire', 2, RuntimeEventType.RESOURCE_ACQUIRED, { resourceId: 'listener-partial-life' }));
  const [finding] = ledger.ingest(event('destroy', 3, RuntimeEventType.OWNER_DESTROYED));

  assert.equal(finding.confirmed, false);
  assert.equal(finding.evidence.level, EvidenceLevel.CORRELATION);
  assert.equal(finding.capability.ownerLifecycle, CapabilitySupport.PARTIAL);
});

test('lifecycle generations are isolated even when the physical owner id is reused', () => {
  const ledger = new RuntimeResourceOwnershipLedger();
  ledger.ingest(event('create-1', 1, RuntimeEventType.OWNER_CREATED, { owner: owner(1) }));
  ledger.ingest(event('acquire-1', 2, RuntimeEventType.RESOURCE_ACQUIRED, { owner: owner(1), resourceId: 'socket-1', resourceType: 'websocket' }));
  ledger.ingest(event('create-2', 3, RuntimeEventType.OWNER_CREATED, { owner: owner(2) }));

  assert.equal(ledger.ingest(event('destroy-2', 4, RuntimeEventType.OWNER_DESTROYED, { owner: owner(2) })).length, 0);
  assert.equal(ledger.ingest(event('destroy-1', 5, RuntimeEventType.OWNER_DESTROYED, { owner: owner(1) })).length, 1);
});

test('a release from a different lifecycle owner cannot clear another owner resource', () => {
  const ledger = new RuntimeResourceOwnershipLedger();
  ledger.ingest(event('create', 1, RuntimeEventType.OWNER_CREATED, { owner: owner(1) }));
  ledger.ingest(event('acquire', 2, RuntimeEventType.RESOURCE_ACQUIRED, { owner: owner(1), resourceId: 'interval-1', resourceType: 'interval' }));
  ledger.ingest(event('bad-release', 3, RuntimeEventType.RESOURCE_RELEASED, { owner: owner(2), resourceId: 'interval-1', resourceType: 'interval' }));

  assert.equal(ledger.resource('interval-1').status, ResourceStatus.ACTIVE);
  assert.equal(ledger.summary().releaseOwnerMismatches, 1);
  assert.equal(ledger.ingest(event('destroy', 4, RuntimeEventType.OWNER_DESTROYED, { owner: owner(1) })).length, 1);
});

test('late cleanup preserves historical finding but marks the resource released', () => {
  const ledger = new RuntimeResourceOwnershipLedger();
  ledger.ingest(event('create', 1, RuntimeEventType.OWNER_CREATED));
  ledger.ingest(event('acquire', 2, RuntimeEventType.RESOURCE_ACQUIRED, { resourceId: 'observer-1', resourceType: 'resize-observer' }));
  ledger.ingest(event('destroy', 3, RuntimeEventType.OWNER_DESTROYED));
  ledger.ingest(event('release', 4, RuntimeEventType.RESOURCE_RELEASED, { resourceId: 'observer-1', resourceType: 'resize-observer' }));

  assert.equal(ledger.resource('observer-1').status, ResourceStatus.RELEASED_AFTER_OWNER_DESTROYED);
  assert.equal(ledger.findings().length, 1);
  assert.equal(ledger.activeResources().length, 0);
});

test('converts a finding into UREP diagnostic input without raw resource payloads', () => {
  const ledger = new RuntimeResourceOwnershipLedger();
  ledger.ingest(event('create', 1, RuntimeEventType.OWNER_CREATED));
  ledger.ingest(event('acquire', 2, RuntimeEventType.RESOURCE_ACQUIRED, { resourceId: 'worker-1', resourceType: 'worker' }));
  const [finding] = ledger.ingest(event('destroy', 3, RuntimeEventType.OWNER_DESTROYED));
  const evidence = ledger.toEvidenceInput(finding);

  assert.equal(evidence.type, RuntimeEventType.DIAGNOSTIC);
  assert.equal(evidence.evidence.level, EvidenceLevel.LIFETIME_VIOLATION);
  assert.equal(evidence.correlation.parentEventId, 'destroy');
  assert.deepEqual(Object.keys(evidence.payload).sort(), [
    'acquisitionEventId', 'confirmed', 'diagnostic', 'ownerDestroyedEventId',
    'ownerLifecycleSupport', 'resourceId', 'resourceOwnershipSupport', 'resourceType',
  ].sort());
});

test('ledger bounds its own memory and reports when active evidence had to be dropped', () => {
  const ledger = new RuntimeResourceOwnershipLedger({ maxRecords: 2 });
  ledger.ingest(event('a1', 1, RuntimeEventType.RESOURCE_ACQUIRED, { resourceId: 'r1' }));
  ledger.ingest(event('a2', 2, RuntimeEventType.RESOURCE_ACQUIRED, { resourceId: 'r2' }));
  ledger.ingest(event('a3', 3, RuntimeEventType.RESOURCE_ACQUIRED, { resourceId: 'r3' }));

  assert.equal(ledger.snapshot().length, 2);
  assert.equal(ledger.resource('r1'), null);
  assert.equal(ledger.summary().droppedActiveResources, 1);
});

class Store {
  constructor(events = []) { this.events = [...events]; this.subscribers = new Set(); }
  snapshot() { return [...this.events]; }
  subscribe(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }
  emit(item) { this.events.push(item); for (const fn of this.subscribers) fn(item); }
}

test('can replay existing evidence and continue incrementally from an EvidenceStore-compatible source', () => {
  const store = new Store([
    event('create', 1, RuntimeEventType.OWNER_CREATED),
    event('acquire', 2, RuntimeEventType.RESOURCE_ACQUIRED, { resourceId: 'listener-2' }),
  ]);
  const ledger = new RuntimeResourceOwnershipLedger({ store });
  store.emit(event('destroy', 3, RuntimeEventType.OWNER_DESTROYED));

  assert.equal(ledger.findings().length, 1);
  assert.equal(ledger.findings()[0].confirmed, true);
});
