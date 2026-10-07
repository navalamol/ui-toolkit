import {
  AttributionQuality,
  CapabilitySupport,
  EvidenceLevel,
  FrameworkCapability,
  RuntimeEventType,
} from './evidence-protocol.js';
import { sanitizeSourceFile } from './source-resolver.js';

const RESOURCE_LEDGER_SCHEMA_VERSION = '2.0';

const ResourceStatus = Object.freeze({
  ACTIVE: 'active',
  RELEASED: 'released',
  VIOLATION_CONFIRMED: 'violation-confirmed',
  VIOLATION_SUSPECTED: 'violation-suspected',
  RELEASED_AFTER_OWNER_DESTROYED: 'released-after-owner-destroyed',
});

const ResourceFindingKind = Object.freeze({
  LIFETIME_VIOLATION: 'resource-lifetime-violation',
  SUSPECTED_LIFETIME_VIOLATION: 'resource-lifetime-suspected',
});

const RuntimeResourceKind = Object.freeze({
  EVENT_LISTENER: 'event-listener',
  TIMEOUT: 'timeout',
  INTERVAL: 'interval',
  ANIMATION_FRAME: 'animation-frame',
  RESIZE_OBSERVER: 'resize-observer',
  MUTATION_OBSERVER: 'mutation-observer',
  INTERSECTION_OBSERVER: 'intersection-observer',
  ABORT_CONTROLLER: 'abort-controller',
  FETCH: 'fetch',
  WEBSOCKET: 'websocket',
  WORKER: 'worker',
  SUBSCRIPTION: 'subscription',
});

const _supportRank = Object.freeze({
  [CapabilitySupport.UNSUPPORTED]: 0,
  [CapabilitySupport.INFERRED]: 1,
  [CapabilitySupport.PARTIAL]: 2,
  [CapabilitySupport.FRAMEWORK_REPORTED]: 3,
  [CapabilitySupport.DETERMINISTIC]: 4,
});
const _validSupport = new Set(Object.values(CapabilitySupport));

function _positiveInt(value, fallback) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function _resourceStillActive(status) {
  return status === ResourceStatus.ACTIVE
    || status === ResourceStatus.VIOLATION_CONFIRMED
    || status === ResourceStatus.VIOLATION_SUSPECTED;
}

function _deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) _deepFreeze(child, seen);
  return Object.freeze(value);
}

function _clone(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(_clone);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, _clone(child)]));
}

function _sourceSnapshot(source) {
  if (!source) return null;
  return {
    file: sanitizeSourceFile(source.file || source.url || null),
    line: Number.isFinite(source.line) ? source.line : null,
    column: Number.isFinite(source.column) ? source.column : null,
    functionName: source.functionName || source.function || null,
  };
}

function _ownerSnapshot(owner) {
  if (!owner) return null;
  return {
    id: owner.id || null,
    kind: owner.kind || 'component',
    name: owner.name || null,
    instanceId: owner.instanceId ?? null,
    lifecycleGeneration: Number.isFinite(owner.lifecycleGeneration) ? owner.lifecycleGeneration : null,
    parentId: owner.parentId || null,
  };
}

function _ownerKey(owner) {
  if (!owner?.id) return null;
  const generation = Number.isFinite(owner.lifecycleGeneration) ? owner.lifecycleGeneration : 'unknown';
  return `${owner.id}#${generation}`;
}

function _resourceId(event) {
  return event?.payload?.resourceId || event?.payload?.resource?.id || null;
}

function _resourceType(event) {
  return event?.payload?.resourceType || event?.payload?.resource?.type || 'unknown';
}

function _frameworkName(event) {
  return event?.framework?.name || 'unknown';
}

function _resourceKey(event, resourceId = _resourceId(event), ownerKey = _ownerKey(event?.owner)) {
  return resourceId && ownerKey ? `${_frameworkName(event)}:${ownerKey}:${resourceId}` : null;
}

function _supportFromAttribution(attribution) {
  if (attribution === AttributionQuality.DETERMINISTIC) return CapabilitySupport.DETERMINISTIC;
  if (attribution === AttributionQuality.FRAMEWORK_REPORTED) return CapabilitySupport.FRAMEWORK_REPORTED;
  if (attribution === AttributionQuality.SOURCE_ATTRIBUTED) return CapabilitySupport.PARTIAL;
  if (attribution === AttributionQuality.TEMPORAL_INFERENCE || attribution === AttributionQuality.HEURISTIC) {
    return CapabilitySupport.INFERRED;
  }
  return CapabilitySupport.UNSUPPORTED;
}

function _weakerSupport(a, b) {
  return (_supportRank[a] ?? 0) <= (_supportRank[b] ?? 0) ? a : b;
}

function _attributionForSupport(support) {
  if (support === CapabilitySupport.DETERMINISTIC) return AttributionQuality.DETERMINISTIC;
  if (support === CapabilitySupport.FRAMEWORK_REPORTED) return AttributionQuality.FRAMEWORK_REPORTED;
  if (support === CapabilitySupport.PARTIAL) return AttributionQuality.HEURISTIC;
  if (support === CapabilitySupport.INFERRED) return AttributionQuality.TEMPORAL_INFERENCE;
  return AttributionQuality.UNKNOWN;
}

function _confidence(event, fallback) {
  return Number.isFinite(event?.evidence?.confidence)
    ? Math.max(0, Math.min(1, event.evidence.confidence))
    : fallback;
}

class RuntimeResourceOwnershipLedger {
  #store;
  #unsubscribe = null;
  #records = new Map();
  #ownerResources = new Map();
  #ownerState = new Map();
  #findings = [];
  #maxRecords;
  #maxFindings;
  #capabilityResolver;
  #onFinding;
  #replayExisting;
  #didReplay = false;
  #processedIds = new Set();
  #processedOrder = [];
  #droppedActive = 0;
  #findingSequence = 0;
  #reacquiredActive = 0;
  #untracked = 0;
  #releaseMismatches = 0;

  constructor({
    store = null,
    maxRecords = 1000,
    maxFindings = 500,
    capabilityResolver = null,
    onFinding = null,
    replayExisting = true,
    start = true,
  } = {}) {
    if (store && typeof store.subscribe !== 'function') {
      throw new TypeError('RuntimeResourceOwnershipLedger store must expose subscribe().');
    }
    if (capabilityResolver != null && typeof capabilityResolver !== 'function') {
      throw new TypeError('capabilityResolver must be a function when provided.');
    }
    if (onFinding != null && typeof onFinding !== 'function') {
      throw new TypeError('onFinding must be a function when provided.');
    }
    this.#store = store;
    this.#maxRecords = _positiveInt(maxRecords, 1000);
    this.#maxFindings = _positiveInt(maxFindings, 500);
    this.#capabilityResolver = capabilityResolver;
    this.#onFinding = onFinding;
    this.#replayExisting = replayExisting;
    if (start && store) this.start();
  }

  start() {
    if (!this.#store || this.#unsubscribe) return this;
    if (this.#replayExisting && !this.#didReplay && typeof this.#store.snapshot === 'function') {
      this.#didReplay = true;
      for (const event of this.#store.snapshot()) this.ingest(event);
    }
    this.#unsubscribe = this.#store.subscribe(event => this.ingest(event));
    return this;
  }

  stop() {
    if (this.#unsubscribe) this.#unsubscribe();
    this.#unsubscribe = null;
    return this;
  }

  ingest(event) {
    if (!event?.type) return Object.freeze([]);
    if (event.id && this.#processedIds.has(event.id)) return Object.freeze([]);
    if (event.id) this.#rememberProcessed(event.id);

    let findings = [];
    if (event.type === RuntimeEventType.OWNER_CREATED) {
      this.#recordOwnerCreated(event);
    } else if (event.type === RuntimeEventType.OWNER_DESTROYED) {
      findings = this.#recordOwnerDestroyed(event);
    } else if (event.type === RuntimeEventType.RESOURCE_ACQUIRED) {
      findings = this.#recordAcquired(event);
    } else if (event.type === RuntimeEventType.RESOURCE_RELEASED) {
      this.#recordReleased(event);
    }
    return Object.freeze(findings.filter(Boolean));
  }

  #recordOwnerCreated(event) {
    const key = _ownerKey(event.owner);
    if (!key) return;
    this.#ownerState.set(key, {
      state: 'active',
      owner: _ownerSnapshot(event.owner),
      eventId: event.id || null,
      sequence: event.sequence ?? null,
      framework: _frameworkName(event),
      timestamp: event.timestamp ?? null,
      attribution: event.evidence?.attribution || AttributionQuality.UNKNOWN,
      confidence: _confidence(event, null),
    });
    this.#pruneOwners();
  }

  #recordOwnerDestroyed(event) {
    const key = _ownerKey(event.owner);
    if (!key) return [];
    this.#ownerState.set(key, {
      state: 'destroyed',
      owner: _ownerSnapshot(event.owner),
      eventId: event.id || null,
      sequence: event.sequence ?? null,
      framework: _frameworkName(event),
      timestamp: event.timestamp ?? null,
      attribution: event.evidence?.attribution || AttributionQuality.UNKNOWN,
      confidence: _confidence(event, null),
    });

    const findings = [];
    for (const resourceKey of [...(this.#ownerResources.get(key) || [])]) {
      const record = this.#records.get(resourceKey);
      if (!record || record.status !== ResourceStatus.ACTIVE) continue;
      findings.push(this.#markOwnerDestroyed(record, event));
    }
    this.#pruneOwners();
    return findings;
  }

  #recordAcquired(event) {
    const resourceId = _resourceId(event);
    const ownerKey = _ownerKey(event.owner);
    const key = _resourceKey(event, resourceId, ownerKey);
    if (!resourceId || !ownerKey || !key) {
      this.#untracked += 1;
      return [];
    }

    const previous = this.#records.get(key);
    if (previous && _resourceStillActive(previous.status)) this.#reacquiredActive += 1;
    if (previous) this.#removeOwnerIndex(previous.ownerKey, key);

    const record = {
      schemaVersion: RESOURCE_LEDGER_SCHEMA_VERSION,
      key,
      resourceId,
      resourceType: _resourceType(event),
      framework: _frameworkName(event),
      ownerKey,
      owner: _ownerSnapshot(event.owner),
      status: ResourceStatus.ACTIVE,
      acquiredEventId: event.id || null,
      acquiredSequence: event.sequence ?? null,
      acquiredAt: event.timestamp ?? null,
      acquiredSource: _sourceSnapshot(event.source || null),
      acquisitionAttribution: event.evidence?.attribution || AttributionQuality.UNKNOWN,
      acquisitionConfidence: _confidence(event, null),
      releasedEventId: null,
      releasedAt: null,
      ownerDestroyedEventId: null,
      ownerDestroyedAt: null,
      findingId: null,
    };
    this.#records.set(key, record);
    if (!this.#ownerResources.has(ownerKey)) this.#ownerResources.set(ownerKey, new Set());
    this.#ownerResources.get(ownerKey).add(key);

    const ownerState = this.#ownerState.get(ownerKey);
    const findings = [];
    if (ownerState?.state === 'destroyed') {
      const syntheticDestroy = {
        id: ownerState.eventId,
        sequence: ownerState.sequence,
        timestamp: ownerState.timestamp,
        framework: { name: ownerState.framework },
        owner: ownerState.owner,
        evidence: { attribution: ownerState.attribution, confidence: ownerState.confidence },
      };
      findings.push(this.#markOwnerDestroyed(record, syntheticDestroy, 'acquired-after-owner-destroyed'));
    }

    this.#pruneRecords();
    return findings;
  }

  #recordReleased(event) {
    const resourceId = _resourceId(event);
    if (!resourceId) {
      this.#untracked += 1;
      return;
    }

    const framework = _frameworkName(event);
    const releaseOwnerKey = _ownerKey(event.owner);
    let key = _resourceKey(event, resourceId, releaseOwnerKey);
    let record = key ? this.#records.get(key) : null;

    if (!record && !releaseOwnerKey) {
      const matches = [...this.#records.entries()].filter(([, item]) =>
        item.framework === framework
        && item.resourceId === resourceId
        && _resourceStillActive(item.status)
      );
      if (matches.length === 1) [key, record] = matches[0];
      else {
        this.#untracked += 1;
        return;
      }
    }

    if (!record && releaseOwnerKey) {
      const belongsElsewhere = [...this.#records.values()].some(item =>
        item.framework === framework
        && item.resourceId === resourceId
        && _resourceStillActive(item.status)
      );
      if (belongsElsewhere) this.#releaseMismatches += 1;
      else this.#untracked += 1;
      return;
    }

    record.releasedEventId = event.id || null;
    record.releasedAt = event.timestamp ?? null;
    record.status = record.ownerDestroyedEventId
      ? ResourceStatus.RELEASED_AFTER_OWNER_DESTROYED
      : ResourceStatus.RELEASED;
    this.#removeOwnerIndex(record.ownerKey, key);
    this.#pruneRecords();
  }

  #markOwnerDestroyed(record, destroyEvent, reason = 'resource-active-after-owner-destroyed') {
    if (record.findingId) {
      return this.#findings.find(item => item.id === record.findingId) || null;
    }

    const ownershipSupport = this.#supportFor(
      record.framework,
      FrameworkCapability.RESOURCE_OWNERSHIP,
      record.acquisitionAttribution,
      { record, event: null },
    );
    const lifecycleSupport = this.#supportFor(
      _frameworkName(destroyEvent),
      FrameworkCapability.OWNER_LIFECYCLE,
      destroyEvent?.evidence?.attribution || AttributionQuality.UNKNOWN,
      { record, event: destroyEvent },
    );
    const effectiveSupport = _weakerSupport(ownershipSupport, lifecycleSupport);
    const confirmed = (_supportRank[ownershipSupport] ?? 0) >= _supportRank[CapabilitySupport.FRAMEWORK_REPORTED]
      && (_supportRank[lifecycleSupport] ?? 0) >= _supportRank[CapabilitySupport.FRAMEWORK_REPORTED];

    const acquisitionConfidence = Number.isFinite(record.acquisitionConfidence)
      ? record.acquisitionConfidence : 0.5;
    const lifecycleConfidence = _confidence(destroyEvent, 0.5);
    const confidence = Math.min(acquisitionConfidence, lifecycleConfidence, confirmed ? 1 : 0.75);
    const id = `resource-finding-${++this.#findingSequence}-${record.resourceId}`;
    const finding = _deepFreeze({
      schemaVersion: RESOURCE_LEDGER_SCHEMA_VERSION,
      id,
      kind: confirmed
        ? ResourceFindingKind.LIFETIME_VIOLATION
        : ResourceFindingKind.SUSPECTED_LIFETIME_VIOLATION,
      confirmed,
      reason,
      framework: record.framework,
      resource: {
        id: record.resourceId,
        type: record.resourceType,
        acquiredEventId: record.acquiredEventId,
        acquiredSequence: record.acquiredSequence,
        acquiredAt: record.acquiredAt,
      },
      owner: _clone(record.owner),
      ownerDestroyedEventId: destroyEvent?.id || null,
      ownerDestroyedSequence: destroyEvent?.sequence ?? null,
      evidence: {
        level: confirmed ? EvidenceLevel.LIFETIME_VIOLATION : EvidenceLevel.CORRELATION,
        attribution: _attributionForSupport(effectiveSupport),
        confidence,
      },
      capability: {
        resourceOwnership: ownershipSupport,
        ownerLifecycle: lifecycleSupport,
      },
      source: _sourceSnapshot(record.acquiredSource),
    });

    record.ownerDestroyedEventId = destroyEvent?.id || null;
    record.ownerDestroyedAt = destroyEvent?.timestamp ?? null;
    record.findingId = id;
    record.status = confirmed ? ResourceStatus.VIOLATION_CONFIRMED : ResourceStatus.VIOLATION_SUSPECTED;
    this.#findings.push(finding);
    while (this.#findings.length > this.#maxFindings) this.#findings.shift();
    if (this.#onFinding) {
      try { this.#onFinding(finding, this); } catch { /* diagnostics must not break the host runtime */ }
    }
    return finding;
  }

  #supportFor(framework, capability, attribution, context) {
    let support = _supportFromAttribution(attribution);
    if (!this.#capabilityResolver) return support;
    try {
      const resolved = this.#capabilityResolver(framework, capability, context);
      if (!_validSupport.has(resolved)) return CapabilitySupport.UNSUPPORTED;
      return _weakerSupport(support, resolved);
    } catch {
      return CapabilitySupport.UNSUPPORTED;
    }
  }

  toEvidenceInput(finding) {
    if (!finding || !Object.values(ResourceFindingKind).includes(finding.kind)) {
      throw new TypeError('toEvidenceInput requires a resource lifetime finding.');
    }
    return _deepFreeze({
      type: RuntimeEventType.DIAGNOSTIC,
      framework: { name: finding.framework || 'unknown' },
      owner: _clone(finding.owner),
      source: _clone(finding.source),
      correlation: { parentEventId: finding.ownerDestroyedEventId || null },
      evidence: _clone(finding.evidence),
      payload: {
        diagnostic: finding.kind,
        confirmed: finding.confirmed,
        resourceId: finding.resource.id,
        resourceType: finding.resource.type,
        acquisitionEventId: finding.resource.acquiredEventId,
        ownerDestroyedEventId: finding.ownerDestroyedEventId,
        resourceOwnershipSupport: finding.capability.resourceOwnership,
        ownerLifecycleSupport: finding.capability.ownerLifecycle,
      },
    });
  }

  resource(resourceId, framework = null, owner = null) {
    if (!resourceId) return null;
    const ownerKey = typeof owner === 'string' ? owner : _ownerKey(owner);
    for (const record of this.#records.values()) {
      if (record.resourceId !== resourceId) continue;
      if (framework && record.framework !== framework) continue;
      if (ownerKey && record.ownerKey !== ownerKey) continue;
      return this.#snapshotRecord(record);
    }
    return null;
  }

  activeResources({ ownerId = null, resourceType = null } = {}) {
    return Object.freeze([...this.#records.values()]
      .filter(record => _resourceStillActive(record.status))
      .filter(record => !ownerId || record.owner?.id === ownerId)
      .filter(record => !resourceType || record.resourceType === resourceType)
      .map(record => this.#snapshotRecord(record)));
  }

  findings({ confirmed = null } = {}) {
    return Object.freeze(this.#findings.filter(item => confirmed == null || item.confirmed === confirmed));
  }

  snapshot() {
    return Object.freeze([...this.#records.values()].map(record => this.#snapshotRecord(record)));
  }

  summary() {
    const counts = {};
    for (const status of Object.values(ResourceStatus)) counts[status] = 0;
    for (const record of this.#records.values()) counts[record.status] = (counts[record.status] || 0) + 1;
    return _deepFreeze({
      schemaVersion: RESOURCE_LEDGER_SCHEMA_VERSION,
      trackedResources: this.#records.size,
      findings: this.#findings.length,
      confirmedFindings: this.#findings.filter(item => item.confirmed).length,
      suspectedFindings: this.#findings.filter(item => !item.confirmed).length,
      droppedActiveResources: this.#droppedActive,
      untrackedEvents: this.#untracked,
      releaseOwnerMismatches: this.#releaseMismatches,
      activeResourceReacquisitions: this.#reacquiredActive,
      statusCounts: counts,
    });
  }

  clear() {
    this.#records.clear();
    this.#ownerResources.clear();
    this.#ownerState.clear();
    this.#findings = [];
    this.#processedIds.clear();
    this.#processedOrder = [];
    this.#droppedActive = 0;
    this.#findingSequence = 0;
    this.#reacquiredActive = 0;
    this.#untracked = 0;
    this.#releaseMismatches = 0;
    this.#didReplay = false;
    return this;
  }

  #snapshotRecord(record) {
    return record ? _deepFreeze(_clone(record)) : null;
  }

  #rememberProcessed(id) {
    this.#processedIds.add(id);
    this.#processedOrder.push(id);
    const limit = Math.max(100, this.#maxRecords * 4);
    while (this.#processedOrder.length > limit) {
      this.#processedIds.delete(this.#processedOrder.shift());
    }
  }

  #removeOwnerIndex(ownerKey, resourceKey) {
    const resources = this.#ownerResources.get(ownerKey);
    if (!resources) return;
    resources.delete(resourceKey);
    if (!resources.size) this.#ownerResources.delete(ownerKey);
  }

  #pruneRecords() {
    while (this.#records.size > this.#maxRecords) {
      let candidate = null;
      for (const [key, record] of this.#records) {
        if (!_resourceStillActive(record.status)) {
          candidate = [key, record];
          break;
        }
      }
      if (!candidate) candidate = this.#records.entries().next().value;
      if (!candidate) break;
      const [key, record] = candidate;
      if (_resourceStillActive(record.status)) this.#droppedActive += 1;
      this.#removeOwnerIndex(record.ownerKey, key);
      this.#records.delete(key);
    }
  }

  #pruneOwners() {
    const limit = Math.max(10, this.#maxRecords);
    while (this.#ownerState.size > limit) {
      let keyToDelete = null;
      for (const [key, state] of this.#ownerState) {
        if (state.state === 'destroyed') {
          keyToDelete = key;
          break;
        }
      }
      if (!keyToDelete) keyToDelete = this.#ownerState.keys().next().value;
      this.#ownerState.delete(keyToDelete);
    }
  }
}

export {
  RESOURCE_LEDGER_SCHEMA_VERSION,
  ResourceStatus,
  ResourceFindingKind,
  RuntimeResourceKind,
  RuntimeResourceOwnershipLedger,
};
