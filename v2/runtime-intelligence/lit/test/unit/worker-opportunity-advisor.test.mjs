import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { WorkerOpportunityAdvisor } from '../../src/core/worker-opportunity-advisor.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';

function makeStore() { return new EvidenceStore({ maxEntries: 200 }); }

function makeWindow(opts = {}) {
    let _ltCallback = null;
    const timeOrigin = opts.timeOrigin ?? 1000000;
    return {
        performance: {
            timeOrigin,
            now: () => 0,
        },
        location: { origin: 'https://app.example.com' },
        PerformanceObserver: class {
            constructor(cb) { _ltCallback = cb; }
            observe() {}
            disconnect() {}
        },
        get _ltCb() { return _ltCallback; },
    };
}

function fireLongTask(win, duration, startTime = 0, containerSrc = '') {
    win._ltCb?.({ getEntries: () => [{
        duration,
        startTime,
        attribution: containerSrc ? [{ containerSrc }] : [],
    }] });
}

test('long task < threshold → no DIAGNOSTIC', () => {
    const store = makeStore();
    const win = makeWindow();
    const advisor = new WorkerOpportunityAdvisor({ store, windowTarget: win, longTaskThresholdMs: 80 });
    advisor.start();
    fireLongTask(win, 50, 0);
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.workerOpportunity);
    assert.equal(diags.length, 0);
});

test('long task >= threshold → emits workerOpportunity:true', () => {
    const store = makeStore();
    const win = makeWindow();
    const advisor = new WorkerOpportunityAdvisor({ store, windowTarget: win, longTaskThresholdMs: 80 });
    advisor.start();
    fireLongTask(win, 120, 0);
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.workerOpportunity);
    assert.ok(diags.length > 0);
    assert.equal(diags[0].payload.durationMs, 120);
    assert.equal(diags[0].payload.trigger, 'longtask-only');
});

test('long task + matching NETWORK_COMPLETED → large-network-response trigger', () => {
    const store = makeStore();
    const win = makeWindow({ timeOrigin: 0 });
    const advisor = new WorkerOpportunityAdvisor({
        store,
        windowTarget: win,
        longTaskThresholdMs: 80,
        networkSizeThresholdBytes: 100000,
        correlationWindowMs: 500,
        dedupeWindowMs: 1,
    });
    advisor.start();

    // Emit a large network event
    store.emit({
        type: RuntimeEventType.NETWORK_COMPLETED,
        owner: null,
        evidence: { level: 'observation', attribution: 'deterministic', confidence: 1 },
        payload: { url: 'api/data', responseSize: 200000 },
    });

    // Fire longtask with startTime within correlationWindowMs of "now"
    fireLongTask(win, 120, 100, 'https://app.example.com/app.js');
    advisor.stop();

    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.workerOpportunity);
    assert.ok(diags.length > 0);
    assert.equal(diags[0].payload.trigger, 'large-network-response');
    assert.ok(diags[0].payload.networkResponseKB > 0);
});

test('same scriptUrl within dedupeWindowMs → only one DIAGNOSTIC', () => {
    const store = makeStore();
    const win = makeWindow();
    const advisor = new WorkerOpportunityAdvisor({
        store,
        windowTarget: win,
        longTaskThresholdMs: 80,
        dedupeWindowMs: 60000,
    });
    advisor.start();
    fireLongTask(win, 120, 0, 'https://app.example.com/worker-code.js');
    fireLongTask(win, 130, 200, 'https://app.example.com/worker-code.js');
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.workerOpportunity);
    assert.equal(diags.length, 1);
});

test('stop() → no DIAGNOSTIC after stop', () => {
    const store = makeStore();
    const win = makeWindow();
    const advisor = new WorkerOpportunityAdvisor({ store, windowTarget: win, longTaskThresholdMs: 80 });
    advisor.start();
    advisor.stop();
    fireLongTask(win, 200, 0);
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.workerOpportunity);
    assert.equal(diags.length, 0);
});
