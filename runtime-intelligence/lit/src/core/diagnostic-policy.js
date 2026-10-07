const POLICY_ENGINE_SCHEMA_VERSION = '1.0';

const RuleKind = Object.freeze({
  BUDGET: 'budget',
});

const BudgetOperator = Object.freeze({
  GT: '>',
  GTE: '>=',
  LT: '<',
  LTE: '<=',
  EQ: '==',
});

const Severity = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
});

const RuleEvaluationStatus = Object.freeze({
  PASS: 'pass',
  VIOLATED: 'violated',
  UNAVAILABLE: 'unavailable',
  DISABLED: 'disabled',
});

const _operators = new Set(Object.values(BudgetOperator));
const _severities = new Set(Object.values(Severity));

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

function _finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function _compare(value, operator, threshold) {
  if (operator === BudgetOperator.GT) return value > threshold;
  if (operator === BudgetOperator.GTE) return value >= threshold;
  if (operator === BudgetOperator.LT) return value < threshold;
  if (operator === BudgetOperator.LTE) return value <= threshold;
  return value === threshold;
}

function _normalizeScope(scope = {}) {
  return {
    framework: scope.framework || null,
    ownerId: scope.ownerId || null,
    workflowId: scope.workflowId || null,
  };
}

function createBudgetRule({
  id,
  metric,
  operator = BudgetOperator.GT,
  threshold,
  severity = Severity.WARNING,
  message = null,
  enabled = true,
  scope = {},
  tags = [],
} = {}) {
  if (!id || typeof id !== 'string') throw new TypeError('Budget rule requires a string id.');
  if (!metric || typeof metric !== 'string') throw new TypeError(`Budget rule ${id} requires a metric.`);
  if (!_operators.has(operator)) throw new TypeError(`Budget rule ${id} has invalid operator: ${operator}`);
  if (!_finite(threshold)) throw new TypeError(`Budget rule ${id} requires a finite threshold.`);
  if (!_severities.has(severity)) throw new TypeError(`Budget rule ${id} has invalid severity: ${severity}`);

  return _deepFreeze({
    schemaVersion: POLICY_ENGINE_SCHEMA_VERSION,
    kind: RuleKind.BUDGET,
    id,
    metric,
    operator,
    threshold,
    severity,
    message: message || `${metric} ${operator} ${threshold}`,
    enabled: enabled !== false,
    scope: _normalizeScope(scope),
    tags: [...new Set((Array.isArray(tags) ? tags : []).map(String))],
  });
}

function createSuppression({
  id,
  ruleId = '*',
  reason,
  expiresAt = null,
  scope = {},
  ticket = null,
} = {}) {
  if (!id || typeof id !== 'string') throw new TypeError('Suppression requires a string id.');
  if (!reason || typeof reason !== 'string') throw new TypeError(`Suppression ${id} requires a reason.`);
  if (expiresAt != null && !_finite(expiresAt)) {
    throw new TypeError(`Suppression ${id} expiresAt must be a finite timestamp or null.`);
  }
  return _deepFreeze({
    schemaVersion: POLICY_ENGINE_SCHEMA_VERSION,
    id,
    ruleId: ruleId || '*',
    reason,
    expiresAt,
    scope: _normalizeScope(scope),
    ticket: ticket || null,
  });
}

function _scopeMatches(scope, context) {
  if (scope.framework && scope.framework !== context.framework) return false;
  if (scope.ownerId && scope.ownerId !== context.ownerId) return false;
  if (scope.workflowId && scope.workflowId !== context.workflowId) return false;
  return true;
}

function _suppressionMatches(suppression, rule, context, now) {
  if (suppression.ruleId !== '*' && suppression.ruleId !== rule.id) return false;
  if (suppression.expiresAt != null && suppression.expiresAt <= now) return false;
  return _scopeMatches(suppression.scope, context);
}

function _evidenceRefs(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter(Boolean)
    .map(event => ({
      id: event.id || null,
      sequence: Number.isFinite(event.sequence) ? event.sequence : null,
      type: event.type || null,
      evidenceLevel: event.evidence?.level || null,
      attribution: event.evidence?.attribution || null,
    }));
}

function evaluateBudgetRule(rule, metrics, {
  context = {},
  suppressions = [],
  evidence = [],
  now = Date.now(),
} = {}) {
  if (!rule?.id || rule.kind !== RuleKind.BUDGET) {
    throw new TypeError('evaluateBudgetRule requires a budget rule.');
  }

  const normalizedContext = _normalizeScope(context);
  if (!rule.enabled) {
    return _deepFreeze({
      ruleId: rule.id,
      status: RuleEvaluationStatus.DISABLED,
      actionable: false,
      suppressed: false,
      severity: rule.severity,
      metric: rule.metric,
      value: null,
      threshold: rule.threshold,
      operator: rule.operator,
      context: normalizedContext,
      evidence: _evidenceRefs(evidence),
    });
  }

  if (!_scopeMatches(rule.scope, normalizedContext)) {
    return null;
  }

  const value = metrics?.[rule.metric];
  if (!_finite(value)) {
    return _deepFreeze({
      ruleId: rule.id,
      status: RuleEvaluationStatus.UNAVAILABLE,
      actionable: false,
      suppressed: false,
      severity: rule.severity,
      metric: rule.metric,
      value: null,
      threshold: rule.threshold,
      operator: rule.operator,
      context: normalizedContext,
      evidence: _evidenceRefs(evidence),
    });
  }

  const violated = _compare(value, rule.operator, rule.threshold);
  if (!violated) {
    return _deepFreeze({
      ruleId: rule.id,
      status: RuleEvaluationStatus.PASS,
      actionable: false,
      suppressed: false,
      severity: rule.severity,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      operator: rule.operator,
      context: normalizedContext,
      evidence: _evidenceRefs(evidence),
    });
  }

  const suppression = suppressions.find(item => _suppressionMatches(item, rule, normalizedContext, now)) || null;
  return _deepFreeze({
    ruleId: rule.id,
    status: RuleEvaluationStatus.VIOLATED,
    actionable: !suppression,
    suppressed: !!suppression,
    suppression: suppression ? {
      id: suppression.id,
      reason: suppression.reason,
      expiresAt: suppression.expiresAt,
      ticket: suppression.ticket,
    } : null,
    severity: rule.severity,
    metric: rule.metric,
    value,
    threshold: rule.threshold,
    operator: rule.operator,
    message: rule.message,
    context: normalizedContext,
    evidence: _evidenceRefs(evidence),
  });
}

function createEventCountMetrics(events = []) {
  const metrics = {};
  for (const event of events || []) {
    if (!event?.type) continue;
    const typeKey = `count:event:${event.type}`;
    metrics[typeKey] = (metrics[typeKey] || 0) + 1;
    const level = event.evidence?.level;
    if (level) {
      const levelKey = `count:evidence:${level}`;
      metrics[levelKey] = (metrics[levelKey] || 0) + 1;
    }
  }
  metrics['count:event:total'] = Array.isArray(events) ? events.length : 0;
  return Object.freeze(metrics);
}

class DiagnosticPolicyEngine {
  #rules = new Map();
  #suppressions = new Map();
  #history = [];
  #sequence = 0;
  #maxFindings;
  #clock;

  constructor({
    rules = [],
    suppressions = [],
    maxFindings = 500,
    clock = () => Date.now(),
  } = {}) {
    this.#maxFindings = Number.isFinite(maxFindings)
      ? Math.max(1, Math.floor(maxFindings))
      : 500;
    this.#clock = clock;
    for (const rule of rules) this.addRule(rule);
    for (const suppression of suppressions) this.addSuppression(suppression);
  }

  addRule(rule) {
    if (!rule?.id) throw new TypeError('Rule requires id.');
    if (this.#rules.has(rule.id)) throw new TypeError(`Duplicate rule id: ${rule.id}`);
    this.#rules.set(rule.id, rule);
    return this;
  }

  removeRule(id) {
    return this.#rules.delete(id);
  }

  addSuppression(suppression) {
    if (!suppression?.id) throw new TypeError('Suppression requires id.');
    if (this.#suppressions.has(suppression.id)) {
      throw new TypeError(`Duplicate suppression id: ${suppression.id}`);
    }
    this.#suppressions.set(suppression.id, suppression);
    return this;
  }

  removeSuppression(id) {
    return this.#suppressions.delete(id);
  }

  evaluate(metrics = {}, {
    context = {},
    evidence = [],
    now = this.#clock(),
    includePassing = false,
    recordUnavailable = false,
  } = {}) {
    const evaluations = [];
    for (const rule of this.#rules.values()) {
      const result = evaluateBudgetRule(rule, metrics, {
        context,
        suppressions: [...this.#suppressions.values()],
        evidence,
        now,
      });
      if (!result) continue;
      const shouldReturn = result.status === RuleEvaluationStatus.VIOLATED
        || (includePassing && result.status === RuleEvaluationStatus.PASS)
        || (recordUnavailable && result.status === RuleEvaluationStatus.UNAVAILABLE)
        || result.status === RuleEvaluationStatus.DISABLED;
      if (!shouldReturn) continue;

      const finding = _deepFreeze({
        schemaVersion: POLICY_ENGINE_SCHEMA_VERSION,
        id: `policy-finding-${++this.#sequence}`,
        evaluatedAt: now,
        ..._clone(result),
      });
      evaluations.push(finding);
      if (finding.status === RuleEvaluationStatus.VIOLATED) this.#remember(finding);
    }
    return Object.freeze(evaluations);
  }

  evaluateEvents(events = [], options = {}) {
    return this.evaluate(createEventCountMetrics(events), {
      ...options,
      evidence: options.evidence || events,
    });
  }

  #remember(finding) {
    this.#history.push(finding);
    while (this.#history.length > this.#maxFindings) this.#history.shift();
  }

  findings({
    includeSuppressed = true,
    severity = null,
    ruleId = null,
  } = {}) {
    return Object.freeze(this.#history.filter(finding =>
      (includeSuppressed || !finding.suppressed)
      && (!severity || finding.severity === severity)
      && (!ruleId || finding.ruleId === ruleId)
    ));
  }

  actionableFindings() {
    return this.findings({ includeSuppressed: false });
  }

  rules() {
    return Object.freeze([...this.#rules.values()]);
  }

  suppressions({ now = this.#clock(), includeExpired = false } = {}) {
    return Object.freeze([...this.#suppressions.values()].filter(item =>
      includeExpired || item.expiresAt == null || item.expiresAt > now
    ));
  }

  clearFindings() {
    this.#history = [];
    return this;
  }

  toEvidenceInput(finding) {
    if (!finding?.id || finding.status !== RuleEvaluationStatus.VIOLATED) {
      throw new TypeError('toEvidenceInput requires a violated policy finding.');
    }
    return _deepFreeze({
      type: 'diagnostic',
      framework: { name: finding.context?.framework || 'generic' },
      owner: finding.context?.ownerId ? { id: finding.context.ownerId } : null,
      evidence: {
        level: 'observation',
        attribution: 'deterministic',
        confidence: 1,
      },
      payload: {
        diagnosticKind: 'policy-budget-violation',
        findingId: finding.id,
        ruleId: finding.ruleId,
        metric: finding.metric,
        value: finding.value,
        operator: finding.operator,
        threshold: finding.threshold,
        severity: finding.severity,
        actionable: finding.actionable,
        suppressed: finding.suppressed,
        suppressionId: finding.suppression?.id || null,
        sourceEventIds: finding.evidence.map(item => item.id).filter(Boolean),
      },
    });
  }
}

export {
  POLICY_ENGINE_SCHEMA_VERSION,
  RuleKind,
  BudgetOperator,
  Severity,
  RuleEvaluationStatus,
  createBudgetRule,
  createSuppression,
  createEventCountMetrics,
  evaluateBudgetRule,
  DiagnosticPolicyEngine,
};
