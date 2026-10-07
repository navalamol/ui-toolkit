import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceLevel } from '../../src/core/evidence-protocol.js';
import {
  MetricDirection,
  VerificationOutcome,
  createWorkflowRun,
  createWorkflowBaseline,
  compareWorkflowRuns,
  verifyFix,
} from '../../src/core/workflow-verification.js';

const evt = (id, sequence, type, payload = {}, owner = 'Grid') => Object.freeze({
  id, sequence, timestamp: sequence * 10, type,
  framework: Object.freeze({ name: 'lit' }),
  owner: Object.freeze({ id: `owner-${owner}`, name: owner }),
  payload: Object.freeze(payload),
});

test('workflow run builds deterministic counts and declarative custom metrics', () => {
  const run = createWorkflowRun([
    evt('a', 1, 'component.update.completed', { durationMs: 20 }),
    evt('b', 2, 'component.update.completed', { durationMs: 40 }),
    evt('c', 3, 'error'),
  ], {
    workflowId: 'edit-product', runId: 'run-1', capturedAt: 1,
    metrics: [{ id: 'render.avgMs', type: 'component.update.completed', payloadPath: 'durationMs', aggregate: 'avg' }],
  });
  assert.equal(run.metrics['count:component.update.completed'], 2);
  assert.equal(run.metrics['count:error'], 1);
  assert.equal(run.metrics['render.avgMs'], 30);
  assert.equal(run.durationMs, 20);
  assert.equal(Object.isFrozen(run), true);
});

test('healthy baseline and comparison remain measurement-only', () => {
  const before = createWorkflowRun([evt('a',1,'error'), evt('b',2,'error')], { workflowId:'save', runId:'before' });
  const baseline = createWorkflowBaseline(before, { baselineId:'healthy-save' });
  const after = createWorkflowRun([], { workflowId:'save', runId:'after' });
  const comparison = compareWorkflowRuns(baseline, after);
  assert.equal(comparison.sameWorkflow, true);
  assert.equal(comparison.metrics['count:error'].before, 2);
  assert.equal(comparison.metrics['count:error'].after, 0);
  assert.equal(comparison.metrics['count:error'].delta, -2);
  assert.equal('outcome' in comparison, false);
});

test('verification confirms causality only after applied intervention and meaningful replay improvement', () => {
  const before = createWorkflowRun([
    evt('a',1,'component.update.completed'), evt('b',2,'component.update.completed'), evt('c',3,'component.update.completed'), evt('d',4,'component.update.completed'),
  ], { workflowId:'edit', runId:'before' });
  const after = createWorkflowRun([evt('e',1,'component.update.completed')], { workflowId:'edit', runId:'after' });
  const result = verifyFix({
    before, after,
    intervention:{ id:'fix-123', applied:true, description:'dedupe update propagation' },
    target:{ metricId:'count:component.update.completed', direction:MetricDirection.DECREASE, minimumRelativeImprovement:.5 },
    verifiedAt: 10,
  });
  assert.equal(result.outcome, VerificationOutcome.CONFIRMED);
  assert.equal(result.confirmed, true);
  assert.equal(result.evidenceLevel, EvidenceLevel.CAUSALITY_CONFIRMED);
  assert.equal(result.improvement, 3);
  assert.equal(result.relativeImprovement, .75);
});

test('metric improvement without confirmed intervention remains inconclusive correlation', () => {
  const before = createWorkflowRun([evt('a',1,'error')], { workflowId:'x', runId:'before' });
  const after = createWorkflowRun([], { workflowId:'x', runId:'after' });
  const result = verifyFix({
    before, after, intervention:{ applied:false },
    target:{ metricId:'count:error', direction:MetricDirection.DECREASE },
  });
  assert.equal(result.outcome, VerificationOutcome.INCONCLUSIVE);
  assert.equal(result.evidenceLevel, EvidenceLevel.CORRELATION);
  assert.equal(result.confirmed, false);
});

test('verification rejects different workflow or same run as causal proof', () => {
  const a = createWorkflowRun([evt('a',1,'error')], { workflowId:'a', runId:'one' });
  const b = createWorkflowRun([], { workflowId:'b', runId:'two' });
  const mismatch = verifyFix({ before:a, after:b, intervention:{applied:true}, target:{metricId:'count:error',direction:MetricDirection.DECREASE} });
  assert.equal(mismatch.reason, 'workflow-mismatch');
  const same = verifyFix({ before:a, after:a, intervention:{applied:true}, target:{metricId:'count:error',direction:MetricDirection.DECREASE} });
  assert.equal(same.reason, 'same-run');
});

test('below-threshold improvement is not confirmed and regression is explicit', () => {
  const before = createWorkflowRun(Array.from({length:10},(_,i)=>evt(`b${i}`,i+1,'component.update.completed')), { workflowId:'x', runId:'before' });
  const little = createWorkflowRun(Array.from({length:9},(_,i)=>evt(`a${i}`,i+1,'component.update.completed')), { workflowId:'x', runId:'little' });
  const notConfirmed = verifyFix({ before, after:little, intervention:{applied:true}, target:{metricId:'count:component.update.completed',direction:MetricDirection.DECREASE,minimumRelativeImprovement:.2} });
  assert.equal(notConfirmed.outcome, VerificationOutcome.NOT_CONFIRMED);
  const worse = createWorkflowRun(Array.from({length:12},(_,i)=>evt(`w${i}`,i+1,'component.update.completed')), { workflowId:'x', runId:'worse' });
  const regressed = verifyFix({ before, after:worse, intervention:{applied:true}, target:{metricId:'count:component.update.completed',direction:MetricDirection.DECREASE} });
  assert.equal(regressed.outcome, VerificationOutcome.REGRESSED);
});

test('custom metrics cannot overwrite built-in verification metrics', () => {
  assert.throws(() => createWorkflowRun([], {
    workflowId:'x', runId:'r', metrics:[{id:'count:error',aggregate:'count'}],
  }), /collides with existing metric/);
});

test('incident snapshot can flow through compare, verify and Evidence Capsule inputs without mutating evidence', () => {
  const beforeIncident = { events:[evt('u1',1,'component.update.completed'),evt('u2',2,'component.update.completed'),evt('u3',3,'component.update.completed')] };
  const afterIncident = { events:[evt('u4',1,'component.update.completed')] };
  const before = createWorkflowRun(beforeIncident,{workflowId:'edit',runId:'incident-before'});
  const after = createWorkflowRun(afterIncident,{workflowId:'edit',runId:'replay-after'});
  const verification = verifyFix({before,after,intervention:{id:'fix',applied:true},target:{metricId:'count:component.update.completed',direction:MetricDirection.DECREASE}});
  assert.equal(verification.confirmed,true);
  assert.equal(beforeIncident.events[0].type,'component.update.completed');
});
