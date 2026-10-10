import test from 'node:test';
import assert from 'node:assert/strict';
import { SequentialApiDetector } from '../../src/core/sequential-api-detector.js';

function makeMockNetwork() {
    let _subscriber = null;
    return {
        subscribe(fn) {
            _subscriber = fn;
            return () => { _subscriber = null; };
        },
        push(entry) { _subscriber?.(entry); },
    };
}

// Build a completed network entry where startTs = ts - durationMs
function makeEntry({ startOffset = 0, duration = 150, url = '/api/data', callStack = '' } = {}) {
    const endTs = Date.now() + startOffset + duration;
    return {
        url,
        durationMs: duration,
        ts: new Date(endTs).toISOString(),
        callStack,
    };
}

// Push N sequential entries: each starts just after the previous ends (+10ms gap)
function pushSequential(network, n, { duration = 150, sharedStack = '' } = {}) {
    let offset = 0;
    for (let i = 0; i < n; i++) {
        network.push(makeEntry({ startOffset: offset, duration, url: `/api/item${i}`, callStack: sharedStack }));
        offset += duration + 10; // 10ms gap between end[i] and start[i+1]
    }
}

test('3 sequential calls produce 1 opportunity with callCount=3', async () => {
    const network = makeMockNetwork();
    const opps = [];
    const d = new SequentialApiDetector({ network, onOpportunity: opp => opps.push(opp) });
    d.start();

    pushSequential(network, 3, { duration: 100 });
    await new Promise(r => setTimeout(r, 400));

    assert.equal(opps.length, 1);
    assert.equal(opps[0].callCount, 3);
    assert.equal(opps[0].urls.length, 3);

    d.stop();
});

test('3 parallel calls (all start within 50ms) produce no opportunity', async () => {
    const network = makeMockNetwork();
    const opps = [];
    const d = new SequentialApiDetector({ network, onOpportunity: opp => opps.push(opp) });
    d.start();

    const now = Date.now();
    // All start within 20ms of each other (well under PARALLEL_MS=50)
    for (let i = 0; i < 3; i++) {
        const duration = 200;
        const endTs = now + i * 10 + duration; // starts: now, now+10, now+20
        network.push({ url: `/api/p${i}`, durationMs: duration, ts: new Date(endTs).toISOString(), callStack: '' });
    }
    await new Promise(r => setTimeout(r, 400));

    assert.equal(opps.length, 0, 'parallel calls should not be flagged');
    d.stop();
});

test('only 2 calls produce no opportunity (below minCalls=3)', async () => {
    const network = makeMockNetwork();
    const opps = [];
    const d = new SequentialApiDetector({ network, onOpportunity: opp => opps.push(opp), minCalls: 3 });
    d.start();

    pushSequential(network, 2, { duration: 100 });
    await new Promise(r => setTimeout(r, 400));

    assert.equal(opps.length, 0);
    d.stop();
});

test('4 sequential calls with shared stack frame → callerFn parsed correctly', async () => {
    const network = makeMockNetwork();
    const opps = [];
    const sharedStack = 'Error\n    at loadPageData (page-loader.js:87:5)\n    at connectedCallback (my-page.js:12:3)';
    const d = new SequentialApiDetector({ network, onOpportunity: opp => opps.push(opp) });
    d.start();

    pushSequential(network, 4, { duration: 120, sharedStack });
    await new Promise(r => setTimeout(r, 400));

    assert.equal(opps.length, 1);
    assert.equal(opps[0].callCount, 4);
    assert.equal(opps[0].callerFn, 'loadPageData', `expected loadPageData, got ${opps[0].callerFn}`);
    assert.ok(opps[0].callerFile.includes('page-loader.js'));
    assert.equal(opps[0].callerLine, '87');

    d.stop();
});

test('estimatedSavingsMs = sum(durations) - max(duration) ± 5ms', async () => {
    const network = makeMockNetwork();
    const opps = [];
    const d = new SequentialApiDetector({ network, onOpportunity: opp => opps.push(opp) });
    d.start();

    // 3 calls of 100ms each: total=300, max=100, savings=200
    pushSequential(network, 3, { duration: 100 });
    await new Promise(r => setTimeout(r, 400));

    assert.equal(opps.length, 1);
    const savings = opps[0].estimatedSavingsMs;
    const expected = 200;
    assert.ok(
        Math.abs(savings - expected) <= 5,
        `savings ${savings} should be ~${expected} (±5ms)`
    );

    d.stop();
});

test('stop() then pushing entries adds no new opportunities', async () => {
    const network = makeMockNetwork();
    const opps = [];
    const d = new SequentialApiDetector({ network, onOpportunity: opp => opps.push(opp) });
    d.start();
    d.stop();

    pushSequential(network, 4, { duration: 100 });
    await new Promise(r => setTimeout(r, 400));

    assert.equal(opps.length, 0, 'no opportunities after stop');
    assert.equal(d.getOpportunities().length, 0);
});

test('getOpportunities() returns a copy (mutations do not affect internal state)', async () => {
    const network = makeMockNetwork();
    const d = new SequentialApiDetector({ network });
    d.start();

    pushSequential(network, 3, { duration: 100 });
    await new Promise(r => setTimeout(r, 400));

    const copy = d.getOpportunities();
    copy.push({ fake: true });
    assert.ok(d.getOpportunities().length < copy.length, 'internal list should be unaffected');

    d.stop();
});
