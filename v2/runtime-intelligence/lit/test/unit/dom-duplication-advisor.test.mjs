import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { DomDuplicationAdvisor } from '../../src/core/dom-duplication-advisor.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';

function makeStore() { return new EvidenceStore({ maxEntries: 50 }); }

function makeEl(localName, attrs = {}, innerHTML = '', parentElement = null) {
    return {
        localName,
        getAttribute: (k) => attrs[k] ?? null,
        innerHTML,
        parentElement,
        getRootNode: () => ({ nodeType: 9 }),
        contains: (el) => false,
    };
}

function makeWindow(elements = []) {
    return {
        MutationObserver: class { observe() {} disconnect() {} },
        document: {
            querySelectorAll: () => elements,
        },
    };
}

test('no singleton-pattern elements → no DIAGNOSTIC', () => {
    const store = makeStore();
    const el = makeEl('div');
    const win = makeWindow([el]);
    const advisor = new DomDuplicationAdvisor({ store, windowTarget: win });
    advisor.start();
    advisor.scan();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.domDuplication);
    assert.equal(diags.length, 0);
});

test('< minInstances → no DIAGNOSTIC', () => {
    const store = makeStore();
    const parent = makeEl('div');
    parent.contains = () => true;
    const els = [makeEl('x-modal', {}, '', parent), makeEl('x-modal', {}, '', parent)];
    const win = makeWindow(els);
    const advisor = new DomDuplicationAdvisor({ store, windowTarget: win, minInstances: 3 });
    advisor.start();
    advisor.scan();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.domDuplication);
    assert.equal(diags.length, 0);
});

test('>= minInstances → emits domDuplication:true with correct payload', () => {
    const store = makeStore();
    const parent = makeEl('x-product-grid');
    parent.contains = () => true;
    const els = Array.from({ length: 5 }, () => makeEl('x-tooltip', {}, 'tip', parent));
    const win = makeWindow(els);
    const advisor = new DomDuplicationAdvisor({ store, windowTarget: win, minInstances: 3 });
    advisor.start();
    advisor.scan();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.domDuplication);
    assert.ok(diags.length > 0);
    const p = diags[0].payload;
    assert.equal(p.domDuplication, true);
    assert.equal(p.duplicateTag, 'x-tooltip');
    assert.equal(p.instanceCount, 5);
    assert.equal(p.commonAncestorTag, 'x-product-grid');
});

test('identicalContent:true when innerHTML lengths within 10%', () => {
    const store = makeStore();
    const parent = makeEl('x-list');
    parent.contains = () => true;
    const lengths = [100, 105, 98, 103, 101];
    const els = lengths.map(l => makeEl('x-tooltip', {}, 'x'.repeat(l), parent));
    const win = makeWindow(els);
    const advisor = new DomDuplicationAdvisor({ store, windowTarget: win, minInstances: 3 });
    advisor.start();
    advisor.scan();
    advisor.stop();
    const diags = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.domDuplication);
    assert.ok(diags.length > 0);
    assert.equal(diags[0].payload.identicalContent, true);
    assert.equal(diags[0].payload.strength, 'high');
});

test('stop() → scan() after stop emits no additional DIAGNOSTICs', () => {
    const store = makeStore();
    const parent = makeEl('x-root');
    parent.contains = () => true;
    const els = Array.from({ length: 5 }, () => makeEl('x-tooltip', {}, '', parent));
    const win = makeWindow(els);
    const advisor = new DomDuplicationAdvisor({ store, windowTarget: win, minInstances: 3 });
    advisor.start();
    advisor.stop();
    const countAfterStop = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.domDuplication).length;
    advisor.scan();
    const countAfterScan = store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.domDuplication).length;
    assert.equal(countAfterScan, countAfterStop);
});
