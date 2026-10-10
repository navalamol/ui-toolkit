import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { PaintAdvisor } from '../../src/core/paint-advisor.js';

function makeStore() { return new EvidenceStore({ maxEntries: 50 }); }

function makeWindow(opts = {}) {
    const { computedStyles = {}, elements = [], paintCallback = null } = opts;
    let _paintCallback = null;
    return {
        requestIdleCallback: (fn) => { setTimeout(fn, 0); return 0; },
        getComputedStyle: (el) => {
            const styles = computedStyles[el.localName] || {};
            return {
                filter: styles.filter ?? 'none',
                backdropFilter: styles.backdropFilter ?? 'none',
                boxShadow: styles.boxShadow ?? 'none',
                webkitFilter: styles.webkitFilter ?? 'none',
            };
        },
        PerformanceObserver: class {
            constructor(cb) { _paintCallback = cb; }
            observe() { if (paintCallback) paintCallback(_paintCallback); }
            disconnect() {}
        },
        document: { querySelectorAll: () => elements },
        get _paintCb() { return _paintCallback; },
    };
}

test('scanExpensiveCss() with no expensive CSS → no expensivePaint DIAGNOSTIC', async () => {
    const store = makeStore();
    const els = Array.from({ length: 15 }, (_, i) => ({ localName: `x-item-${i}` }));
    const win = makeWindow({ elements: els });
    const advisor = new PaintAdvisor({ store, windowTarget: win });
    advisor.start();
    await new Promise(r => setTimeout(r, 20));
    advisor.scanExpensiveCss();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.expensivePaint);
    assert.equal(diags.length, 0);
});

test('scanExpensiveCss() with >= threshold elements having filter → emits expensivePaint', async () => {
    const store = makeStore();
    const els = Array.from({ length: 10 }, (_, i) => ({ localName: 'x-card' }));
    const win = makeWindow({
        elements: els,
        computedStyles: { 'x-card': { filter: 'blur(4px)' } },
    });
    const advisor = new PaintAdvisor({ store, windowTarget: win, cssExpensiveThreshold: 10 });
    advisor.start();
    await new Promise(r => setTimeout(r, 20));
    advisor.scanExpensiveCss();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.expensivePaint);
    assert.ok(diags.length > 0);
    assert.equal(diags[0].payload.property, 'filter');
    assert.equal(diags[0].payload.elementCount, 10);
});

test('paint observer callback → emits paintTiming', () => {
    const store = makeStore();
    let capturedCb = null;
    const win = {
        requestIdleCallback: (fn) => { setTimeout(fn, 0); return 0; },
        getComputedStyle: () => ({ filter: 'none', backdropFilter: 'none', boxShadow: 'none', webkitFilter: 'none' }),
        PerformanceObserver: class {
            constructor(cb) { capturedCb = cb; }
            observe() {}
            disconnect() {}
        },
        document: { querySelectorAll: () => [] },
    };
    const advisor = new PaintAdvisor({ store, windowTarget: win });
    advisor.start();
    capturedCb({ getEntries: () => [{ name: 'first-contentful-paint', startTime: 1240 }] });
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.paintTiming);
    assert.equal(diags.length, 1);
    assert.equal(diags[0].payload.metric, 'first-contentful-paint');
    assert.equal(diags[0].payload.valueMs, 1240);
});

test('paintTiming emits only once per metric', () => {
    const store = makeStore();
    let capturedCb = null;
    const win = {
        requestIdleCallback: (fn) => { setTimeout(fn, 0); return 0; },
        getComputedStyle: () => ({ filter: 'none', backdropFilter: 'none', boxShadow: 'none', webkitFilter: 'none' }),
        PerformanceObserver: class {
            constructor(cb) { capturedCb = cb; }
            observe() {}
            disconnect() {}
        },
        document: { querySelectorAll: () => [] },
    };
    const advisor = new PaintAdvisor({ store, windowTarget: win });
    advisor.start();
    capturedCb({ getEntries: () => [{ name: 'first-paint', startTime: 800 }] });
    capturedCb({ getEntries: () => [{ name: 'first-paint', startTime: 900 }] });
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.paintTiming && e.payload?.metric === 'first-paint');
    assert.equal(diags.length, 1);
});

test('stop() → no further DIAGNOSTICs', () => {
    const store = makeStore();
    const els = Array.from({ length: 15 }, () => ({ localName: 'x-item' }));
    // Use a window WITHOUT requestIdleCallback so setTimeout is used and clearTimeout works
    const win = {
        getComputedStyle: (el) => ({
            filter: 'blur(4px)',
            backdropFilter: 'none',
            boxShadow: 'none',
            webkitFilter: 'none',
        }),
        PerformanceObserver: class {
            constructor() {}
            observe() {}
            disconnect() {}
        },
        document: { querySelectorAll: () => els },
    };
    const advisor = new PaintAdvisor({ store, windowTarget: win, cssExpensiveThreshold: 10 });
    advisor.start();
    advisor.stop();
    advisor.scanExpensiveCss();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.expensivePaint);
    assert.equal(diags.length, 0);
});
