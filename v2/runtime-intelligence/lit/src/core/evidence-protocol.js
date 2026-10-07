/**
 * Universal Runtime Evidence Protocol (UREP) v1.1.
 * Framework-neutral, immutable evidence snapshots for runtime intelligence.
 */

const SCHEMA_VERSION = '1.1';

const EvidenceLevel = Object.freeze({
  OBSERVATION: 'observation',
  CORRELATION: 'correlation',
  ATTRIBUTION: 'attribution',
  LIFETIME_VIOLATION: 'lifetime-violation',
  RETAINER_CONFIRMED: 'retainer-confirmed',
  CAUSALITY_CONFIRMED: 'causality-confirmed',
});

const AttributionQuality = Object.freeze({
  DETERMINISTIC: 'deterministic',
  FRAMEWORK_REPORTED: 'framework-reported',
  SOURCE_ATTRIBUTED: 'source-attributed',
  TEMPORAL_INFERENCE: 'temporal-inference',
  HEURISTIC: 'heuristic',
  UNKNOWN: 'unknown',
});

const CapabilitySupport = Object.freeze({
  DETERMINISTIC: 'deterministic',
  FRAMEWORK_REPORTED: 'framework-reported',
  PARTIAL: 'partial',
  INFERRED: 'inferred',
  UNSUPPORTED: 'unsupported',
});

const FrameworkCapability = Object.freeze({
  OWNER_LIFECYCLE: 'owner-lifecycle',
  UPDATE_LIFECYCLE: 'update-lifecycle',
  UPDATE_CAUSE: 'update-cause',
  STATE_CHANGE: 'state-change',
  RENDER_TIMING: 'render-timing',
  SOURCE_LOCATION: 'source-location',
  REACTIVE_DEPENDENCY: 'reactive-dependency',
  RESOURCE_OWNERSHIP: 'resource-ownership',
  EFFECT_LIFECYCLE: 'effect-lifecycle',
});

const RuntimeEventType = Object.freeze({
  OWNER_CREATED: 'owner.created',
  OWNER_DESTROYED: 'owner.destroyed',
  INTERACTION: 'interaction',
  STATE_CHANGED: 'state.changed',
  DEPENDENCY_TRIGGERED: 'dependency.triggered',
  UPDATE_REQUESTED: 'component.update.requested',
  UPDATE_STARTED: 'component.update.started',
  UPDATE_COMPLETED: 'component.update.completed',
  RESOURCE_ACQUIRED: 'resource.acquired',
  RESOURCE_RELEASED: 'resource.released',
  NETWORK_STARTED: 'network.started',
  NETWORK_COMPLETED: 'network.completed',
  BROWSER_FRAME: 'browser.frame',
  NAVIGATION: 'navigation',
  ERROR: 'error',
  DIAGNOSTIC: 'diagnostic',
});

const RuntimeValueCapture = Object.freeze({
  BOUNDED: 'bounded',
  SHAPE_ONLY: 'shape-only',
});

const _evidenceLevels = new Set(Object.values(EvidenceLevel));
const _attributionQualities = new Set(Object.values(AttributionQuality));
const _eventTypes = new Set(Object.values(RuntimeEventType));

function _plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function _cloneSnapshot(value, memo = new WeakMap(), stack = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (stack.has(value)) return '[Circular]';
  if (memo.has(value)) return memo.get(value);

  stack.add(value);
  const out = Array.isArray(value) ? [] : {};
  memo.set(value, out);

  if (Array.isArray(value)) {
    for (const item of value) out.push(_cloneSnapshot(item, memo, stack));
  } else {
    for (const [key, item] of Object.entries(value)) {
      out[key] = _cloneSnapshot(item, memo, stack);
    }
  }

  stack.delete(value);
  return out;
}

function _deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) _deepFreeze(child, seen);
  return Object.freeze(value);
}

/**
 * Bounded runtime value summary. This is NOT a redaction API.
 * BOUNDED retains primitive values (including strings, truncated to maxString).
 * SHAPE_ONLY retains only type/shape metadata and is safer for sensitive contexts.
 */
function summarizeRuntimeValue(value, {
  maxString = 100,
  maxKeys = 5,
  capture = RuntimeValueCapture.BOUNDED,
} = {}) {
  if (value === undefined) return { type: 'undefined', summary: 'undefined' };
  if (value === null) return { type: 'null', summary: 'null' };
  const type = typeof value;
  const shapeOnly = capture === RuntimeValueCapture.SHAPE_ONLY;
  if (type === 'string') {
    return shapeOnly
      ? { type, summary: `String[${value.length}]`, length: value.length, redacted: true }
      : { type, summary: value.length > maxString ? `${value.slice(0, maxString)}…` : value, length: value.length, redacted: false };
  }
  if (type === 'number' || type === 'boolean' || type === 'bigint') {
    return shapeOnly ? { type, summary: `[${type}]`, redacted: true } : { type, summary: String(value), redacted: false };
  }
  if (type === 'symbol') return { type, summary: shapeOnly ? '[symbol]' : String(value), redacted: shapeOnly };
  if (type === 'function') return { type, summary: '[Function]', redacted: true };
  if (Array.isArray(value)) return { type: 'array', summary: `Array[${value.length}]`, length: value.length, redacted: true };
  const allKeys = Object.keys(value);
  const keys = allKeys.slice(0, maxKeys);
  return {
    type: 'object',
    summary: `{${keys.join(',')}${allKeys.length > maxKeys ? ',…' : ''}}`,
    keys,
    redacted: true,
  };
}

function normalizeSource(source) {
  if (!source) return null;
  if (typeof source === 'string') return { file: source, line: null, column: null, functionName: null };
  return {
    file: source.file || source.url || null,
    line: Number.isFinite(source.line) ? source.line : null,
    column: Number.isFinite(source.column) ? source.column : null,
    functionName: source.functionName || source.function || null,
  };
}

function normalizeOwner(owner) {
  if (!owner) return null;
  return {
    id: owner.id || null,
    kind: owner.kind || 'component',
    name: owner.name || owner.label || null,
    instanceId: owner.instanceId || null,
    lifecycleGeneration: Number.isFinite(owner.lifecycleGeneration) ? owner.lifecycleGeneration : null,
    parentId: owner.parentId || null,
  };
}

function createEvidenceEvent(input, context = {}) {
  if (!input || !_eventTypes.has(input.type)) {
    throw new TypeError(`Unknown runtime evidence event type: ${input?.type}`);
  }
  const evidence = _plainObject(input.evidence);
  const level = _evidenceLevels.has(evidence.level) ? evidence.level : EvidenceLevel.OBSERVATION;
  const attribution = _attributionQualities.has(evidence.attribution) ? evidence.attribution : AttributionQuality.UNKNOWN;
  const confidence = Number.isFinite(evidence.confidence) ? Math.max(0, Math.min(1, evidence.confidence)) : null;
  const event = {
    schemaVersion: SCHEMA_VERSION,
    id: input.id || context.id || null,
    sequence: Number.isFinite(input.sequence) ? input.sequence : (context.sequence ?? null),
    timestamp: Number.isFinite(input.timestamp) ? input.timestamp : (context.timestamp ?? Date.now()),
    type: input.type,
    framework: {
      name: input.framework?.name || context.framework?.name || 'unknown',
      version: input.framework?.version || context.framework?.version || null,
      adapterVersion: input.framework?.adapterVersion || context.framework?.adapterVersion || null,
    },
    owner: normalizeOwner(input.owner),
    source: normalizeSource(input.source),
    correlation: {
      traceId: input.correlation?.traceId || null,
      interactionId: input.correlation?.interactionId || null,
      parentEventId: input.correlation?.parentEventId || null,
      causedByEventId: input.correlation?.causedByEventId || null,
    },
    evidence: { level, attribution, confidence },
    payload: _cloneSnapshot(_plainObject(input.payload)),
  };
  return _deepFreeze(event);
}

function validateEvidenceEvent(event, { resolveReference = null } = {}) {
  const errors = [];
  if (!event || event.schemaVersion !== SCHEMA_VERSION) errors.push('schemaVersion');
  if (!event?.id) errors.push('id');
  if (!Number.isFinite(event?.sequence)) errors.push('sequence');
  if (!Number.isFinite(event?.timestamp)) errors.push('timestamp');
  if (!_eventTypes.has(event?.type)) errors.push('type');
  if (!event?.framework?.name) errors.push('framework.name');
  if (!_evidenceLevels.has(event?.evidence?.level)) errors.push('evidence.level');
  if (!_attributionQualities.has(event?.evidence?.attribution)) errors.push('evidence.attribution');
  if (event?.evidence?.confidence != null && (!Number.isFinite(event.evidence.confidence) || event.evidence.confidence < 0 || event.evidence.confidence > 1)) errors.push('evidence.confidence');
  for (const field of ['parentEventId', 'causedByEventId']) {
    const ref = event?.correlation?.[field];
    if (!ref || typeof resolveReference !== 'function') continue;
    const resolved = resolveReference(ref);
    if (resolved?.status === 'present' && Number.isFinite(resolved.sequence) && resolved.sequence >= event.sequence) errors.push(`correlation.${field}.not-earlier`);
    if (resolved?.status === 'unknown') errors.push(`correlation.${field}.unknown`);
  }
  return { valid: errors.length === 0, errors };
}

export {
  SCHEMA_VERSION,
  EvidenceLevel,
  AttributionQuality,
  CapabilitySupport,
  FrameworkCapability,
  RuntimeEventType,
  RuntimeValueCapture,
  summarizeRuntimeValue,
  createEvidenceEvent,
  validateEvidenceEvent,
};
