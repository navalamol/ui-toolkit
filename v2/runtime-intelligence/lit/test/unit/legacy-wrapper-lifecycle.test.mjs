import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.window) globalThis.window = {};
window.__LDS_PROP_DEBUG__ = '*';
window.__LDS_RENDER_REASONS__ = {};
window.__LDS_THRASH__ = [];
window.__LDS_CYCLES__ = [];

const { LdsErrorBoundary } = await import('../../src/core/error-boundary.js');
const { LdsPropAudit } = await import('../../src/core/prop-audit.js');
const { LdsCycleDetector } = await import('../../src/core/cycle-detector.js');

class FakeElement {
  constructor() {
    this.tagName = 'X-AUDIT';
    this.value = 2;
  }

  requestUpdate(...args) {
    this.lastRequestArgs = args;
    return 'request-result';
  }

  performUpdate(...args) {
    this.lastPerformArgs = args;
    return 'sync-perform-result';
  }

  updated(...args) {
    this.lastUpdatedArgs = args;
    return 'updated-result';
  }
}

function attachStack(el) {
  LdsErrorBoundary.attach(el);
  LdsPropAudit.attach(el);
  LdsCycleDetector.attach(el);
}

function detachStack(el) {
  LdsCycleDetector.detach(el);
  LdsPropAudit.detach(el);
  LdsErrorBoundary.detach(el);
}

test('legacy wrappers preserve requestUpdate arguments and synchronous performUpdate semantics', () => {
  const el = new FakeElement();
  attachStack(el);

  const options = { hasChanged: 'custom' };
  assert.equal(el.requestUpdate('value', 1, options), 'request-result');
  assert.deepEqual(el.lastRequestArgs, ['value', 1, options]);

  const performResult = el.performUpdate('token');
  assert.equal(performResult, 'sync-perform-result');
  assert.equal(typeof performResult?.then, 'undefined');
  assert.deepEqual(el.lastPerformArgs, ['token']);

  const changed = new Map([['value', 1]]);
  assert.equal(el.updated(changed), 'updated-result');
  assert.deepEqual(el.lastUpdatedArgs, [changed]);

  detachStack(el);
});

test('attach/detach restores prototype methods and reconnect does not stack wrappers', () => {
  const el = new FakeElement();
  const protoRequest = Object.getPrototypeOf(el).requestUpdate;
  const protoPerform = Object.getPrototypeOf(el).performUpdate;
  const protoUpdated = Object.getPrototypeOf(el).updated;

  attachStack(el);
  el.requestUpdate('value', 1, {});
  const firstCount = window.__LDS_RENDER_REASONS__['x-audit'].length;
  detachStack(el);

  assert.equal(Object.prototype.hasOwnProperty.call(el, 'requestUpdate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(el, 'performUpdate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(el, 'updated'), false);
  assert.equal(el.requestUpdate, protoRequest);
  assert.equal(el.performUpdate, protoPerform);
  assert.equal(el.updated, protoUpdated);

  attachStack(el);
  el.requestUpdate('value', 1, {});
  const secondCount = window.__LDS_RENDER_REASONS__['x-audit'].length;
  assert.equal(secondCount, firstCount + 1, 'reconnect must add one audit record, not stacked duplicates');
  detachStack(el);
});
