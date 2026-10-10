import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { VirtualizationAdvisor } from '../../src/core/virtualization-advisor.js';

function makeStore() { return new EvidenceStore({ maxEntries: 50 }); }

function makeEl(localName, parentElement, rect = { top: -100, bottom: -50, left: 0, right: 100 }) {
    return {
        localName,
        parentElement,
        getBoundingClientRect: () => rect,
    };
}

function makeWindow(elements, vH = 800, vW = 1200) {
    return {
        MutationObserver: class { observe() {} disconnect() {} },
        innerHeight: vH,
        innerWidth: vW,
        document: { querySelectorAll: () => elements },
    };
}

test('< minChildren siblings → no DIAGNOSTIC', () => {
    const store = makeStore();
    const parent = { localName: 'x-list', parentElement: null };
    const els = Array.from({ length: 30 }, () => makeEl('x-card', parent));
    const win = makeWindow([parent, ...els]);
    const advisor = new VirtualizationAdvisor({ store, windowTarget: win, minChildren: 50 });
    advisor.start();
    advisor.scan();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.virtualizationOpportunity);
    assert.equal(diags.length, 0);
});

test('>= minChildren + offScreenRatio >= threshold → emits correct payload', () => {
    const store = makeStore();
    const parent = { localName: 'x-product-grid', parentElement: null };
    const offRect = { top: -200, bottom: -100, left: 0, right: 100 };
    const onRect = { top: 100, bottom: 200, left: 0, right: 100 };
    const children = [
        ...Array.from({ length: 55 }, () => makeEl('x-card', parent, offRect)),
        ...Array.from({ length: 5 }, () => makeEl('x-card', parent, onRect)),
    ];
    const win = makeWindow([parent, ...children]);
    const advisor = new VirtualizationAdvisor({ store, windowTarget: win, minChildren: 50 });
    advisor.start();
    advisor.scan();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.virtualizationOpportunity);
    assert.ok(diags.length > 0);
    const p = diags[0].payload;
    assert.equal(p.virtualizationOpportunity, true);
    assert.equal(p.childTag, 'x-card');
    assert.equal(p.childCount, 60);
    assert.ok(p.offScreenRatio >= 0.9);
});

test('offScreenRatio < threshold → no DIAGNOSTIC even with many children', () => {
    const store = makeStore();
    const parent = { localName: 'x-list', parentElement: null };
    const offRect = { top: -200, bottom: -100, left: 0, right: 100 };
    const onRect = { top: 100, bottom: 200, left: 0, right: 100 };
    const children = [
        ...Array.from({ length: 40 }, () => makeEl('x-item', parent, offRect)),
        ...Array.from({ length: 60 }, () => makeEl('x-item', parent, onRect)),
    ];
    const win = makeWindow([parent, ...children]);
    const advisor = new VirtualizationAdvisor({ store, windowTarget: win, minChildren: 50, offScreenThreshold: 0.7 });
    advisor.start();
    advisor.scan();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.virtualizationOpportunity);
    assert.equal(diags.length, 0);
});

test('custom thresholds respected', () => {
    const store = makeStore();
    const parent = { localName: 'x-wrapper', parentElement: null };
    const offRect = { top: -200, bottom: -100, left: 0, right: 100 };
    const onRect = { top: 100, bottom: 200, left: 0, right: 100 };
    const children = [
        ...Array.from({ length: 7 }, () => makeEl('x-row', parent, offRect)),
        ...Array.from({ length: 5 }, () => makeEl('x-row', parent, onRect)),
    ];
    const win = makeWindow([parent, ...children]);
    const advisor = new VirtualizationAdvisor({ store, windowTarget: win, minChildren: 10, offScreenThreshold: 0.5 });
    advisor.start();
    advisor.scan();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.virtualizationOpportunity);
    assert.ok(diags.length > 0);
    assert.equal(diags[0].payload.childCount, 12);
});

test('stop() → scan() after stop emits no additional DIAGNOSTICs', () => {
    const store = makeStore();
    const parent = { localName: 'x-list', parentElement: null };
    const offRect = { top: -200, bottom: -100, left: 0, right: 100 };
    const children = Array.from({ length: 60 }, () => makeEl('x-card', parent, offRect));
    const win = makeWindow([parent, ...children]);
    const advisor = new VirtualizationAdvisor({ store, windowTarget: win, minChildren: 50 });
    advisor.start();
    advisor.stop();
    const countAfterStop = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.virtualizationOpportunity).length;
    advisor.scan();
    const countAfterScan = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.virtualizationOpportunity).length;
    assert.equal(countAfterScan, countAfterStop);
});
