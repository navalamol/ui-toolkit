import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BudgetOperator,
  Severity,
  RuleEvaluationStatus,
  createBudgetRule,
  createSuppression,
  createEventCountMetrics,
  evaluateBudgetRule,
  DiagnosticPolicyEngine,
} from '../../src/core/diagnostic-policy.js';

const updateEvents = [
  {id:'e1',sequence:1,type:'component.update.completed',evidence:{level:'observation',attribution:'framework-reported'}},
  {id:'e2',sequence:2,type:'component.update.completed',evidence:{level:'correlation',attribution:'unknown'}},
  {id:'e3',sequence:3,type:'error',evidence:{level:'observation',attribution:'unknown'}},
];

test('event metrics deterministically count type and evidence levels', () => {
  const metrics=createEventCountMetrics(updateEvents);
  assert.equal(metrics['count:event:component.update.completed'],2);
  assert.equal(metrics['count:event:error'],1);
  assert.equal(metrics['count:event:total'],3);
  assert.equal(metrics['count:evidence:observation'],2);
});

test('budget violation is deterministic and preserves declared severity', () => {
  const rule=createBudgetRule({id:'updates',metric:'updates',operator:BudgetOperator.GT,threshold:10,severity:Severity.ERROR});
  const result=evaluateBudgetRule(rule,{updates:11});
  assert.equal(result.status,RuleEvaluationStatus.VIOLATED);
  assert.equal(result.severity,Severity.ERROR);
  assert.equal(result.actionable,true);
});

test('budget pass is not actionable', () => {
  const rule=createBudgetRule({id:'updates',metric:'updates',threshold:10});
  const result=evaluateBudgetRule(rule,{updates:10});
  assert.equal(result.status,RuleEvaluationStatus.PASS);
  assert.equal(result.actionable,false);
});

test('missing metric is unavailable rather than implicitly passing or failing', () => {
  const rule=createBudgetRule({id:'latency',metric:'latency',threshold:100});
  const result=evaluateBudgetRule(rule,{});
  assert.equal(result.status,RuleEvaluationStatus.UNAVAILABLE);
});

test('active rule suppression keeps violation in history but removes actionability', () => {
  const rule=createBudgetRule({id:'updates',metric:'updates',threshold:1});
  const suppression=createSuppression({id:'known',ruleId:'updates',reason:'known issue',expiresAt:200});
  const engine=new DiagnosticPolicyEngine({rules:[rule],suppressions:[suppression],clock:()=>100});
  const [finding]=engine.evaluate({updates:2});
  assert.equal(finding.status,RuleEvaluationStatus.VIOLATED);
  assert.equal(finding.suppressed,true);
  assert.equal(finding.actionable,false);
  assert.equal(engine.findings().length,1);
  assert.equal(engine.actionableFindings().length,0);
});

test('expired suppression cannot hide a new violation', () => {
  const rule=createBudgetRule({id:'updates',metric:'updates',threshold:1});
  const suppression=createSuppression({id:'old',ruleId:'updates',reason:'expired',expiresAt:99});
  const [finding]=new DiagnosticPolicyEngine({rules:[rule],suppressions:[suppression],clock:()=>100}).evaluate({updates:2});
  assert.equal(finding.suppressed,false);
  assert.equal(finding.actionable,true);
});

test('suppression scope must match framework/owner/workflow', () => {
  const rule=createBudgetRule({id:'updates',metric:'updates',threshold:1});
  const suppression=createSuppression({id:'react-only',ruleId:'updates',reason:'migration',scope:{framework:'react',ownerId:'Editor'}});
  const engine=new DiagnosticPolicyEngine({rules:[rule],suppressions:[suppression]});
  const [lit]=engine.evaluate({updates:2},{context:{framework:'lit',ownerId:'Editor'},now:10});
  const [react]=engine.evaluate({updates:2},{context:{framework:'react',ownerId:'Editor'},now:10});
  assert.equal(lit.suppressed,false);
  assert.equal(react.suppressed,true);
});

test('rule scope prevents evaluation outside its declared target', () => {
  const rule=createBudgetRule({id:'editor',metric:'updates',threshold:1,scope:{ownerId:'Editor'}});
  const engine=new DiagnosticPolicyEngine({rules:[rule]});
  assert.equal(engine.evaluate({updates:2},{context:{ownerId:'Grid'}}).length,0);
  assert.equal(engine.evaluate({updates:2},{context:{ownerId:'Editor'}}).length,1);
});

test('rules never mutate or upgrade underlying evidence semantics', () => {
  const evidence=Object.freeze({id:'e1',sequence:1,type:'error',evidence:Object.freeze({level:'correlation',attribution:'heuristic'})});
  const rule=createBudgetRule({id:'errors',metric:'errors',threshold:0});
  const engine=new DiagnosticPolicyEngine({rules:[rule]});
  const [finding]=engine.evaluate({errors:1},{evidence:[evidence]});
  assert.equal(evidence.evidence.level,'correlation');
  assert.equal(finding.evidence[0].evidenceLevel,'correlation');
  const diagnostic=engine.toEvidenceInput(finding);
  assert.equal(diagnostic.evidence.level,'observation');
  assert.equal(diagnostic.evidence.attribution,'deterministic');
  assert.equal('causedByEventId' in (diagnostic.correlation||{}),false);
});

test('policy diagnostic carries source event ids structurally without causal claims', () => {
  const rule=createBudgetRule({id:'updates',metric:'updates',threshold:1});
  const engine=new DiagnosticPolicyEngine({rules:[rule]});
  const [finding]=engine.evaluate({updates:2},{evidence:updateEvents});
  const input=engine.toEvidenceInput(finding);
  assert.deepEqual(input.payload.sourceEventIds,['e1','e2','e3']);
  assert.equal(input.payload.diagnosticKind,'policy-budget-violation');
});

test('finding history is bounded and keeps newest violations', () => {
  const rule=createBudgetRule({id:'updates',metric:'updates',threshold:0});
  const engine=new DiagnosticPolicyEngine({rules:[rule],maxFindings:2});
  engine.evaluate({updates:1},{now:1});
  engine.evaluate({updates:2},{now:2});
  engine.evaluate({updates:3},{now:3});
  const history=engine.findings();
  assert.equal(history.length,2);
  assert.equal(history[0].evaluatedAt,2);
  assert.equal(history[1].evaluatedAt,3);
});

test('duplicate rules and suppressions are rejected', () => {
  const rule=createBudgetRule({id:'r',metric:'m',threshold:1});
  const suppression=createSuppression({id:'s',reason:'known'});
  const engine=new DiagnosticPolicyEngine({rules:[rule],suppressions:[suppression]});
  assert.throws(()=>engine.addRule(rule),/Duplicate rule id/);
  assert.throws(()=>engine.addSuppression(suppression),/Duplicate suppression id/);
});

test('evaluateEvents bridges UREP event counts into budget rules', () => {
  const rule=createBudgetRule({id:'update-count',metric:'count:event:component.update.completed',threshold:1});
  const [finding]=new DiagnosticPolicyEngine({rules:[rule]}).evaluateEvents(updateEvents);
  assert.equal(finding.value,2);
  assert.equal(finding.status,RuleEvaluationStatus.VIOLATED);
});
