import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PrivacyAction, ENTERPRISE_SAFE_PRIVACY_POLICY, createPrivacyPolicy,
  maskUrlQuery, sanitizeHeaders, applyPrivacyPolicyToEvidenceInput, sanitizeForExport,
} from '../../src/core/enterprise-privacy.js';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { createEvidenceCapsule } from '../../src/core/evidence-capsule.js';

test('masks URL query values and drops fragments while retaining parameter names', () => {
  assert.equal(maskUrlQuery('https://api.example.test/items?account=123&mode=full#section'),
    'https://api.example.test/items?account=[REDACTED]&mode=[REDACTED]');
});

test('redacts sensitive and unknown header values but keeps safe protocol headers', () => {
  const headers = sanitizeHeaders({
    Authorization:'Bearer abc.def.secret', Cookie:'sid=secret',
    Accept:'application/json', 'Content-Type':'application/json',
    'X-Note':'owner=user@example.com', 'X-Customer-Account':'12345',
  });
  assert.equal(headers.Authorization,'[REDACTED]');
  assert.equal(headers.Cookie,'[REDACTED]');
  assert.equal(headers.Accept,'application/json');
  assert.equal(headers['Content-Type'],'application/json');
  assert.equal(headers['X-Note'],'[REDACTED]');
  assert.equal(headers['X-Customer-Account'],'[REDACTED]');
});

test('supports Headers-like iterable objects without silently losing header names',()=>{
  const fakeHeaders={entries(){return [['Accept','application/json'],['X-Trace','secret-opaque']][Symbol.iterator]();}};
  const headers=sanitizeHeaders(fakeHeaders);
  assert.equal(headers.Accept,'application/json');
  assert.equal(headers['X-Trace'],'[REDACTED]');
});

test('default EvidenceStore applies enterprise privacy before immutable capture', () => {
  const store=new EvidenceStore({clock:()=>100});
  const event=store.emit({
    type:RuntimeEventType.NETWORK_STARTED,
    owner:{id:'o1',name:'user@example.com'},
    source:{file:'https://host/Editor.js?session=abc#x',functionName:'render-user@example.com'},
    correlation:{traceId:'trace-1'},
    evidence:{level:'attribution',attribution:'framework-reported',confidence:.9},
    payload:{
      url:'https://service.test/data?token=abc&user=42#x',
      headers:{Authorization:'Bearer top-secret',Accept:'application/json','X-User':'Jane Doe'},
      requestBody:{email:'person@example.com',password:'secret'},
    }
  });
  assert.equal(event.payload.url,'https://service.test/data?token=[REDACTED]&user=[REDACTED]');
  assert.equal(event.payload.headers.Authorization,'[REDACTED]');
  assert.equal(event.payload.headers['X-User'],'[REDACTED]');
  assert.deepEqual(event.payload.requestBody,{type:'object',keys:['email'],redacted:true});
  assert.equal(event.owner.name,'[REDACTED_EMAIL]');
  assert.equal(event.source.file,'https://host/Editor.js?session=[REDACTED]');
  assert.equal(event.source.functionName,'[REDACTED_EMAIL]');
  assert.equal(event.evidence.level,'attribution');
  assert.equal(event.evidence.attribution,'framework-reported');
  assert.equal(event.correlation.traceId,'trace-1');
  assert.equal(event.privacy.enforced,true);
  assert.equal(Object.isFrozen(event),true);
});

test('state/update values become shape-only but structural property names remain', () => {
  const result=applyPrivacyPolicyToEvidenceInput({
    type:RuntimeEventType.STATE_CHANGED,
    payload:{property:'profile',oldValue:{type:'string',summary:'alice@example.com',length:17,redacted:false},newValue:{type:'object',summary:'{name,token}',keys:['name','token'],redacted:true}},
  });
  assert.equal(result.input.payload.property,'profile');
  assert.deepEqual(result.input.payload.oldValue,{type:'string',summary:'[string]',length:17,redacted:true});
  assert.deepEqual(result.input.payload.newValue,{type:'object',summary:'[object]',keys:['name'],redacted:true});
});

test('DOM text is shape-only by default',()=>{
  const result=applyPrivacyPolicyToEvidenceInput({type:RuntimeEventType.DIAGNOSTIC,payload:{domText:'Customer Jane Doe account 12345'}});
  assert.deepEqual(result.input.payload.domText,{type:'string',length:31,redacted:true});
});

test('trusted custom policy can keep state DOM and unknown headers while secrets stay redacted',()=>{
  const policy=createPrivacyPolicy({id:'trusted-local',stateValues:PrivacyAction.KEEP,domText:PrivacyAction.KEEP,headerValues:PrivacyAction.KEEP});
  const result=applyPrivacyPolicyToEvidenceInput({
    type:RuntimeEventType.STATE_CHANGED,
    payload:{oldValue:{name:'Alice',accessToken:'abc'},domText:'hello',headers:{'X-Note':'user@example.com',Authorization:'Bearer raw'}}
  },policy);
  assert.equal(result.input.payload.oldValue.name,'Alice');
  assert.equal(result.input.payload.oldValue.accessToken,'[REDACTED]');
  assert.equal(result.input.payload.domText,'hello');
  assert.equal(result.input.payload.headers['X-Note'],'[REDACTED_EMAIL]');
  assert.equal(result.input.payload.headers.Authorization,'[REDACTED]');
});

test('export sanitizer removes raw correlation identifiers and redacts PII/sensitive fields',()=>{
  const out=sanitizeForExport({traceId:'trace-secret',interactionId:'interaction-secret',contact:'Email jane@example.com or call +91 98765 43210',nested:{refreshToken:'token-secret'}});
  assert.equal('traceId' in out,false);
  assert.equal('interactionId' in out,false);
  assert.match(out.contact,/\[REDACTED_EMAIL\]/);
  assert.match(out.contact,/\[REDACTED_PHONE\]/);
  assert.equal(out.nested.refreshToken,'[REDACTED]');
});

test('Evidence Capsule enforces export policy over caller supplied fields',()=>{
  const capsule=createEvidenceCapsule({
    id:'capsule-private',
    problem:{summary:'Failure for jane@example.com',token:'secret'},
    environment:{url:'https://app.test/editor?customer=42&session=abc',headers:{Cookie:'sid=abc',Accept:'application/json','X-Customer':'Jane'},requestBody:{account:42,password:'x'},traceId:'raw-trace'},
  });
  const json=JSON.stringify(capsule);
  assert.equal(json.includes('jane@example.com'),false);
  assert.equal(json.includes('"token":"secret"'),false);
  assert.equal(json.includes('raw-trace'),false);
  assert.equal(json.includes('session=abc'),false);
  assert.equal(json.includes('"X-Customer":"Jane"'),false);
  assert.equal(capsule.privacy.enforced,true);
  assert.equal(capsule.privacy.boundary,'export');
});

test('privacy can be explicitly disabled only at the store boundary',()=>{
  const store=new EvidenceStore({privacyPolicy:false});
  const event=store.emit({type:RuntimeEventType.DIAGNOSTIC,payload:{token:'trusted-local-secret'}});
  assert.equal(event.payload.token,'trusted-local-secret');
  assert.equal('privacy' in event,false);
});

test('privacy transformation never mutates producer input',()=>{
  const input={type:RuntimeEventType.NETWORK_STARTED,owner:{name:'user@example.com'},payload:{url:'https://service.test?q=secret',headers:{Authorization:'Bearer secret'}}};
  const original=JSON.stringify(input);
  applyPrivacyPolicyToEvidenceInput(input,ENTERPRISE_SAFE_PRIVACY_POLICY);
  assert.equal(JSON.stringify(input),original);
});

test('audit does not include sensitive values and reflects header redaction',()=>{
  const result=applyPrivacyPolicyToEvidenceInput({type:RuntimeEventType.NETWORK_STARTED,payload:{headers:{'X-Account':'customer-123'}}});
  const json=JSON.stringify(result.audit);
  assert.equal(json.includes('customer-123'),false);
  assert.ok(result.audit.redacted>=1);
});
