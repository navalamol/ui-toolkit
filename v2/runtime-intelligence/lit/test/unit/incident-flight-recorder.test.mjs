import test from 'node:test';
import assert from 'node:assert/strict';
import { IncidentFlightRecorder, RecorderState } from '../../src/core/incident-flight-recorder.js';

class Store {
  constructor() { this.subscribers = new Set(); }
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
  emit(event) {
    const immutable = Object.freeze({ ...event });
    for (const subscriber of this.subscribers) subscriber(immutable);
  }
}

const event = (id, sequence, timestamp = sequence * 100) => Object.freeze({
  id,
  sequence,
  timestamp,
  type: 'diagnostic',
  payload: Object.freeze({}),
});

test('keeps only bounded latest events', () => {
  const store = new Store();
  const recorder = new IncidentFlightRecorder({ store, maxEvents: 3, maxAgeMs: 99_999 });
  for (let index = 1; index <= 5; index += 1) store.emit(event(`e${index}`, index));
  assert.deepEqual(recorder.snapshot().map(item => item.id), ['e3', 'e4', 'e5']);
});

test('trims by age relative to latest evidence timestamp', () => {
  const store = new Store();
  const recorder = new IncidentFlightRecorder({ store, maxEvents: 10, maxAgeMs: 150 });
  store.emit(event('a', 1, 100));
  store.emit(event('b', 2, 200));
  store.emit(event('c', 3, 300));
  assert.deepEqual(recorder.snapshot().map(item => item.id), ['b', 'c']);
});

test('manual freeze is immutable and stops recording', () => {
  const store = new Store();
  const recorder = new IncidentFlightRecorder({ store, clock: () => 999 });
  store.emit(event('a', 1));
  const incident = recorder.freeze({ reason: 'manual-check' });
  store.emit(event('b', 2));
  assert.equal(recorder.state(), RecorderState.FROZEN);
  assert.equal(incident.reason, 'manual-check');
  assert.deepEqual(incident.events.map(item => item.id), ['a']);
  assert.equal(Object.isFrozen(incident), true);
  assert.equal(Object.isFrozen(incident.events), true);
});

test('post-trigger budget captures exact subsequent events', () => {
  const store = new Store();
  const recorder = new IncidentFlightRecorder({ store });
  store.emit(event('a', 1));
  store.emit(event('trigger', 2));
  assert.equal(recorder.freeze({ triggerEventId: 'trigger', postTriggerEvents: 2 }), null);
  assert.equal(recorder.state(), RecorderState.PENDING_FREEZE);
  store.emit(event('p1', 3));
  assert.equal(recorder.incident(), null);
  store.emit(event('p2', 4));
  assert.equal(recorder.state(), RecorderState.FROZEN);
  assert.equal(recorder.incident().triggerEventId, 'trigger');
  assert.deepEqual(recorder.incident().events.map(item => item.id), ['a', 'trigger', 'p1', 'p2']);
});

test('auto-freeze can request bounded post-trigger evidence', () => {
  const store = new Store();
  const recorder = new IncidentFlightRecorder({
    store,
    autoFreeze: item => item.type === 'error'
      ? { reason: 'runtime-error', postTriggerEvents: 1 }
      : false,
  });
  store.emit({ ...event('a', 1), type: 'diagnostic' });
  store.emit({ ...event('err', 2), type: 'error' });
  assert.equal(recorder.state(), RecorderState.PENDING_FREEZE);
  store.emit({ ...event('tail', 3), type: 'diagnostic' });
  assert.equal(recorder.incident().reason, 'runtime-error');
  assert.deepEqual(recorder.incident().events.map(item => item.id), ['a', 'err', 'tail']);
});

test('auto-freeze predicate failures never break application runtime', () => {
  const store = new Store();
  const recorder = new IncidentFlightRecorder({
    store,
    autoFreeze: () => { throw new Error('diagnostic predicate failure'); },
  });
  assert.doesNotThrow(() => store.emit(event('a', 1)));
  assert.equal(recorder.state(), RecorderState.RUNNING);
  assert.deepEqual(recorder.snapshot().map(item => item.id), ['a']);
});

test('resume clears frozen capture and records a new window', () => {
  const store = new Store();
  const recorder = new IncidentFlightRecorder({ store });
  store.emit(event('a', 1));
  recorder.freeze();
  recorder.resume();
  store.emit(event('b', 2));
  assert.equal(recorder.incident(), null);
  assert.equal(recorder.state(), RecorderState.RUNNING);
  assert.deepEqual(recorder.snapshot().map(item => item.id), ['b']);
});

test('stop unsubscribes without corrupting an existing frozen incident', () => {
  const store = new Store();
  const recorder = new IncidentFlightRecorder({ store });
  store.emit(event('a', 1));
  const incident = recorder.freeze();
  recorder.stop();
  store.emit(event('b', 2));
  assert.equal(recorder.incident(), incident);
  assert.deepEqual(incident.events.map(item => item.id), ['a']);
});
