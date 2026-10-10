import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { IdleSchedulingAdvisor } from '../../src/core/idle-scheduling-advisor.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';

function makeStore() { return new EvidenceStore({ maxEntries: 200 }); }

function emitUpdate(store, ownerId, ownerName, durationMs, timestamp) {
    store.emit({
        type: RuntimeEventType.UPDATE_COMPLETED,
        owner: { id: ownerId, name: ownerName },
        timestamp,
        evidence: { level: 'attribution', attribution: 'framework_reported', confidence: 0.9 },
        payload: { durationMs },
    });
}

function emitStateChanged(store, timestamp) {
    store.emit({
        type: RuntimeEventType.STATE_CHANGED,
        owner: null,
        timestamp,
        evidence: { level: 'observation', attribution: 'heuristic', confidence: 0.6 },
        payload: {},
    });
}

test('UPDATE_COMPLETED durationMs < 16 → no DIAGNOSTIC', () => {
    const store = makeStore();
    const advisor = new IdleSchedulingAdvisor({ store });
    advisor.start();
    emitUpdate(store, 'x', 'x-thing', 10, 1000);
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.idleOpportunity);
    assert.equal(diags.length, 0);
});

test('UPDATE_COMPLETED durationMs >= 16 + prior STATE_CHANGED in window → no DIAGNOSTIC', () => {
    const store = makeStore();
    const advisor = new IdleSchedulingAdvisor({ store, lookbackWindowMs: 500 });
    advisor.start();
    emitStateChanged(store, 900);
    emitUpdate(store, 'a', 'x-widget', 50, 1000);
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.idleOpportunity);
    assert.equal(diags.length, 0);
});

test('UPDATE_COMPLETED durationMs >= 32 + no prior STATE_CHANGED → emits idleOpportunity', () => {
    const store = makeStore();
    const advisor = new IdleSchedulingAdvisor({ store });
    advisor.start();
    emitUpdate(store, 'a', 'x-analytics', 32, 5000);
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.idleOpportunity);
    assert.ok(diags.length > 0);
    assert.equal(diags[0].payload.ownerTag, 'x-analytics');
    assert.equal(diags[0].payload.trigger, 'non-urgent');
});

test('5 periodic updates (gap >= 2000ms) → trigger:periodic', () => {
    const store = makeStore();
    const advisor = new IdleSchedulingAdvisor({
        store,
        periodicCountThreshold: 5,
        periodicMinIntervalMs: 2000,
    });
    advisor.start();
    for (let i = 0; i < 5; i++) {
        emitUpdate(store, 'p', 'x-refresh', 20, 10000 + i * 3000);
    }
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.idleOpportunity && e.payload?.trigger === 'periodic');
    assert.ok(diags.length > 0);
    assert.ok(diags[diags.length - 1].payload.updateCountInWindow >= 5);
});

test('stop() → no DIAGNOSTIC after stop', () => {
    const store = makeStore();
    const advisor = new IdleSchedulingAdvisor({ store });
    advisor.start();
    advisor.stop();
    emitUpdate(store, 'b', 'x-timer', 100, 9000);
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.idleOpportunity);
    assert.equal(diags.length, 0);
});
