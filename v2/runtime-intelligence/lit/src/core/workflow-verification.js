import { EvidenceLevel, RuntimeEventType } from './evidence-protocol.js';

const WORKFLOW_SCHEMA_VERSION = '1.0';

const MetricDirection = Object.freeze({
  DECREASE: 'decrease',
  INCREASE: 'increase',
});

const VerificationOutcome = Object.freeze({
  CONFIRMED: 'confirmed',
  NOT_CONFIRMED: 'not-confirmed',
  REGRESSED: 'regressed',
  INCONCLUSIVE: 'inconclusive',
});

function _deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) _deepFreeze(child, seen);
  return Object.freeze(value);
}

function _events(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.events)) return input.events;
  throw new TypeError('Workflow run requires an event array or object with events.');
}

function _readPath(value, path) {
  if (!path) return value;
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

function _matches(event, definition) {
  const types = Array.isArray(definition.type) ? definition.type : (definition.type ? [definition.type] : null);
  if (types && !types.includes(event.type)) return false;
  if (definition.ownerId && event.owner?.id !== definition.ownerId) return false;
  if (definition.ownerName && event.owner?.name !== definition.ownerName) return false;
  return true;
}

function _customMetric(events, definition) {
  if (!definition?.id) throw new TypeError('Metric definition requires id.');
  const aggregate = definition.aggregate || (definition.payloadPath ? 'avg' : 'count');
  const matched = events.filter(event => _matches(event, definition));
  if (aggregate === 'count') return matched.length;

  const values = matched
    .map(event => _readPath(event.payload, definition.payloadPath))
    .filter(Number.isFinite);
  if (!values.length) return null;
  if (aggregate === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (aggregate === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregate === 'max') return Math.max(...values);
  if (aggregate === 'min') return Math.min(...values);
  throw new TypeError(`Unsupported metric aggregate: ${aggregate}`);
}

function _sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
}

function createWorkflowRun(input, {
  workflowId,
  runId,
  label = null,
  capturedAt = Date.now(),
  metrics = [],
} = {}) {
  if (!workflowId) throw new TypeError('workflowId is required.');
  if (!runId) throw new TypeError('runId is required.');
  const events = [..._events(input)]
    .filter(Boolean)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  const eventCounts = new Map(Object.values(RuntimeEventType).map(type => [type, 0]));
  const ownerCounts = new Map();
  const frameworks = new Set();

  for (const event of events) {
    eventCounts.set(event.type, (eventCounts.get(event.type) || 0) + 1);
    const ownerKey = event.owner?.id || event.owner?.name || null;
    if (ownerKey) ownerCounts.set(ownerKey, (ownerCounts.get(ownerKey) || 0) + 1);
    if (event.framework?.name) frameworks.add(event.framework.name);
  }

  const computedMetrics = new Map([['events.total', events.length]]);
  for (const [type, count] of eventCounts) computedMetrics.set(`count:${type}`, count);
  for (const definition of metrics) {
    if (computedMetrics.has(definition?.id)) throw new TypeError(`Metric id collides with existing metric: ${definition?.id}`);
    computedMetrics.set(definition.id, _customMetric(events, definition));
  }

  const firstTimestamp = events[0]?.timestamp ?? null;
  const lastTimestamp = events.at(-1)?.timestamp ?? null;
  const durationMs = Number.isFinite(firstTimestamp) && Number.isFinite(lastTimestamp)
    ? Math.max(0, lastTimestamp - firstTimestamp)
    : null;

  return _deepFreeze({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    kind: 'workflow-run',
    workflowId,
    runId,
    label,
    capturedAt,
    eventCount: events.length,
    firstTimestamp,
    lastTimestamp,
    durationMs,
    frameworks: [...frameworks].sort(),
    eventCounts: _sortedObject(eventCounts.entries()),
    ownerCounts: _sortedObject(ownerCounts.entries()),
    metrics: _sortedObject(computedMetrics.entries()),
  });
}

function createWorkflowBaseline(run, {
  baselineId,
  label = 'healthy',
  createdAt = Date.now(),
} = {}) {
  if (run?.kind !== 'workflow-run') throw new TypeError('Workflow baseline requires a workflow run snapshot.');
  if (!baselineId) throw new TypeError('baselineId is required.');
  return _deepFreeze({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    kind: 'workflow-baseline',
    baselineId,
    workflowId: run.workflowId,
    sourceRunId: run.runId,
    label,
    createdAt,
    run,
  });
}

function _asRun(value) {
  if (value?.kind === 'workflow-baseline') return value.run;
  if (value?.kind === 'workflow-run') return value;
  throw new TypeError('Comparison requires workflow run/baseline snapshots.');
}

function compareWorkflowRuns(reference, candidate) {
  const before = _asRun(reference);
  const after = _asRun(candidate);
  const ids = new Set([...Object.keys(before.metrics), ...Object.keys(after.metrics)]);
  const metrics = {};

  for (const id of [...ids].sort()) {
    const beforeValue = before.metrics[id] ?? (id.startsWith('count:') ? 0 : null);
    const afterValue = after.metrics[id] ?? (id.startsWith('count:') ? 0 : null);
    const comparable = Number.isFinite(beforeValue) && Number.isFinite(afterValue);
    const delta = comparable ? afterValue - beforeValue : null;
    metrics[id] = Object.freeze({
      before: beforeValue,
      after: afterValue,
      delta,
      relativeDelta: comparable && beforeValue !== 0 ? delta / Math.abs(beforeValue) : null,
    });
  }

  return _deepFreeze({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    kind: 'workflow-comparison',
    workflowId: before.workflowId,
    sameWorkflow: before.workflowId === after.workflowId,
    distinctRuns: before.runId !== after.runId,
    referenceRunId: before.runId,
    candidateRunId: after.runId,
    metrics,
  });
}

function verifyFix({
  before,
  after,
  intervention,
  target,
  verifiedAt = Date.now(),
} = {}) {
  if (!target?.metricId) throw new TypeError('Verification target requires metricId.');
  if (!Object.values(MetricDirection).includes(target.direction)) {
    throw new TypeError('Verification target direction must be decrease or increase.');
  }

  const comparison = compareWorkflowRuns(before, after);
  const metric = comparison.metrics[target.metricId];
  const minAbsolute = Number.isFinite(target.minimumAbsoluteImprovement)
    ? Math.max(0, target.minimumAbsoluteImprovement) : 0;
  const minRelative = Number.isFinite(target.minimumRelativeImprovement)
    ? Math.max(0, target.minimumRelativeImprovement) : 0;

  const base = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    kind: 'fix-verification',
    verifiedAt,
    workflowId: comparison.workflowId,
    referenceRunId: comparison.referenceRunId,
    candidateRunId: comparison.candidateRunId,
    intervention: intervention ? { id: intervention.id || null, description: intervention.description || null, applied: intervention.applied === true } : null,
    target: {
      metricId: target.metricId,
      direction: target.direction,
      minimumAbsoluteImprovement: minAbsolute,
      minimumRelativeImprovement: minRelative,
    },
    metric: metric || null,
  };

  const inconclusive = reason => _deepFreeze({
    ...base,
    outcome: VerificationOutcome.INCONCLUSIVE,
    evidenceLevel: EvidenceLevel.CORRELATION,
    confirmed: false,
    improvement: null,
    relativeImprovement: null,
    reason,
  });

  if (!comparison.sameWorkflow) return inconclusive('workflow-mismatch');
  if (!comparison.distinctRuns) return inconclusive('same-run');
  if (intervention?.applied !== true) return inconclusive('intervention-not-confirmed-applied');
  if (!metric || !Number.isFinite(metric.before) || !Number.isFinite(metric.after)) return inconclusive('target-metric-unavailable');

  const improvement = target.direction === MetricDirection.DECREASE
    ? metric.before - metric.after
    : metric.after - metric.before;
  const relativeImprovement = metric.before !== 0 ? improvement / Math.abs(metric.before) : null;
  const meetsAbsolute = improvement >= minAbsolute;
  const meetsRelative = minRelative === 0 || (relativeImprovement != null && relativeImprovement >= minRelative);
  const meaningful = improvement > 0 && meetsAbsolute && meetsRelative;

  if (improvement < 0) {
    return _deepFreeze({
      ...base,
      outcome: VerificationOutcome.REGRESSED,
      evidenceLevel: EvidenceLevel.CORRELATION,
      confirmed: false,
      improvement,
      relativeImprovement,
      reason: 'target-regressed-after-intervention',
    });
  }

  if (!meaningful) {
    return _deepFreeze({
      ...base,
      outcome: VerificationOutcome.NOT_CONFIRMED,
      evidenceLevel: EvidenceLevel.CORRELATION,
      confirmed: false,
      improvement,
      relativeImprovement,
      reason: improvement === 0 ? 'no-target-improvement' : 'improvement-below-threshold',
    });
  }

  return _deepFreeze({
    ...base,
    outcome: VerificationOutcome.CONFIRMED,
    evidenceLevel: EvidenceLevel.CAUSALITY_CONFIRMED,
    confirmed: true,
    improvement,
    relativeImprovement,
    reason: 'applied-intervention-followed-by-meaningful-improvement-on-replayed-workflow',
  });
}

export {
  WORKFLOW_SCHEMA_VERSION,
  MetricDirection,
  VerificationOutcome,
  createWorkflowRun,
  createWorkflowBaseline,
  compareWorkflowRuns,
  verifyFix,
};
