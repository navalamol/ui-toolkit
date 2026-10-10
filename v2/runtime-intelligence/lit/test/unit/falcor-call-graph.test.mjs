import test from 'node:test';
import assert from 'node:assert/strict';
import { FalcorCallGraph } from '../../src/core/falcor-call-graph.js';

// Minimal mock of LdsNetwork
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

function makeFalcorEntry(overrides = {}) {
    return {
        url: '/model.json',
        method: 'GET',
        status: 200,
        durationMs: 100,
        ts: new Date(Date.now()).toISOString(),
        type: 'fetch',
        decoded: { protocol: 'falcor', paths: [['products', '123', 'name']] },
        callStack: 'Error\n    at loadData (product.js:42:8)\n    at _renderList (list.js:15:4)\n    at HTMLElement.update (element.js:5:2)',
        ...overrides,
    };
}

test('two Falcor entries within 200ms form one BurstGroup with 2 paths', async () => {
    const network = makeMockNetwork();
    const graph = new FalcorCallGraph({ network });
    graph.start();

    const now = Date.now();
    network.push(makeFalcorEntry({ ts: new Date(now).toISOString(), durationMs: 80 }));
    network.push(makeFalcorEntry({
        ts: new Date(now + 100).toISOString(),
        durationMs: 90,
        decoded: { protocol: 'falcor', paths: [['products', '456', 'price']] },
    }));

    // Wait for the 300ms flush timeout
    await new Promise(r => setTimeout(r, 400));

    const bursts = graph.getBursts();
    assert.equal(bursts.length, 1);
    assert.equal(bursts[0].callCount, 2);
    assert.equal(bursts[0].paths.length, 2);

    graph.stop();
});

test('two pairs of entries separated by >200ms gap form two separate BurstGroups', async () => {
    const network = makeMockNetwork();
    const graph = new FalcorCallGraph({ network });
    graph.start();

    const now = Date.now();
    // Burst 1: two calls within 80ms of each other
    network.push(makeFalcorEntry({ ts: new Date(now).toISOString(), durationMs: 50 }));
    network.push(makeFalcorEntry({ ts: new Date(now + 80).toISOString(), durationMs: 50 }));

    // Wait >300ms for burst 1 to finalize
    await new Promise(r => setTimeout(r, 400));

    // Burst 2: two more calls — startTs is >200ms after burst 1's last endTs
    const t2 = Date.now();
    network.push(makeFalcorEntry({ ts: new Date(t2).toISOString(), durationMs: 50 }));
    network.push(makeFalcorEntry({ ts: new Date(t2 + 80).toISOString(), durationMs: 50 }));
    await new Promise(r => setTimeout(r, 400));

    const bursts = graph.getBursts();
    assert.ok(bursts.length >= 2, `expected 2 separate burst groups, got ${bursts.length}`);

    graph.stop();
});

test('three entries with shared stack frame → originatorFn correctly parsed', async () => {
    const network = makeMockNetwork();
    const graph = new FalcorCallGraph({ network });
    graph.start();

    const sharedStack = 'Error\n    at loadProducts (product-loader.js:87:5)\n    at initialize (app.js:12:3)';
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
        network.push(makeFalcorEntry({
            ts: new Date(now + i * 80).toISOString(),
            durationMs: 70,
            callStack: sharedStack,
        }));
    }
    await new Promise(r => setTimeout(r, 400));

    const bursts = graph.getBursts();
    assert.equal(bursts.length, 1);
    assert.equal(bursts[0].callCount, 3);
    assert.equal(bursts[0].originatorFn, 'loadProducts', `expected loadProducts, got ${bursts[0].originatorFn}`);
    assert.ok(bursts[0].originatorFile.includes('product-loader.js'), 'file should include product-loader.js');
    assert.equal(bursts[0].originatorLine, '87');

    graph.stop();
});

test('three entries with NO shared stack frame → originatorFn is "unknown"', async () => {
    const network = makeMockNetwork();
    const graph = new FalcorCallGraph({ network });
    graph.start();

    const now = Date.now();
    network.push(makeFalcorEntry({ ts: new Date(now).toISOString(),       durationMs: 70, callStack: 'Error\n    at fnA (a.js:1:1)' }));
    network.push(makeFalcorEntry({ ts: new Date(now + 80).toISOString(),  durationMs: 70, callStack: 'Error\n    at fnB (b.js:2:2)' }));
    network.push(makeFalcorEntry({ ts: new Date(now + 160).toISOString(), durationMs: 70, callStack: 'Error\n    at fnC (c.js:3:3)' }));
    await new Promise(r => setTimeout(r, 400));

    const bursts = graph.getBursts();
    assert.equal(bursts.length, 1);
    assert.equal(bursts[0].originatorFn, 'unknown');

    graph.stop();
});

test('stop() prevents new bursts from forming after stop', async () => {
    const network = makeMockNetwork();
    const graph = new FalcorCallGraph({ network });
    graph.start();
    graph.stop();

    const now = Date.now();
    network.push(makeFalcorEntry({ ts: new Date(now).toISOString(),      durationMs: 50 }));
    network.push(makeFalcorEntry({ ts: new Date(now + 80).toISOString(), durationMs: 50 }));
    await new Promise(r => setTimeout(r, 400));

    assert.equal(graph.getBursts().length, 0, 'no bursts after stop');
});

test('non-Falcor entries are ignored', async () => {
    const network = makeMockNetwork();
    const graph = new FalcorCallGraph({ network });
    graph.start();

    const now = Date.now();
    network.push({ url: '/api/data', durationMs: 50, ts: new Date(now).toISOString(), decoded: { protocol: 'rest' } });
    network.push({ url: '/api/other', durationMs: 50, ts: new Date(now + 80).toISOString(), decoded: null });
    await new Promise(r => setTimeout(r, 400));

    assert.equal(graph.getBursts().length, 0);
    graph.stop();
});
