import assert from 'node:assert/strict';
import test from 'node:test';

import { LitAdapter } from '../../src/adapter/lit/LitAdapter.js';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { PropertyWatchManager } from '../../src/integration/lit/property-watch-manager.js';

function fakeLitElement(localName = 'x-card') {
    return {
        localName,
        requestUpdate() {},
        performUpdate() {},
        price: 0,
        status: 'idle',
    };
}

// ── 1. Watch fires STATE_CHANGED with source.file populated ──────────────────

test('watch fires STATE_CHANGED with source.file from call stack', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const manager = new PropertyWatchManager({ adapter, store });
    const el = fakeLitElement('x-price');

    manager.start();
    manager.watch('x-price', 'price');
    adapter.connect(el);

    // Simulate a reactive property mutation (adapter.recordUpdateRequested calls interceptors)
    adapter.recordUpdateRequested(el, 'price', 0);

    const events = store.snapshot({ type: RuntimeEventType.STATE_CHANGED });
    // One from the watch, one from the adapter itself — find the watch-sourced one
    const watchEvent = events.find(e => e.payload?.watchSource === true);
    assert.ok(watchEvent, 'watch-sourced STATE_CHANGED must exist');
    assert.equal(watchEvent.payload.property, 'price');
    // source.file should point to this test file (first non-internal frame)
    assert.ok(watchEvent.source?.file, 'source.file must be populated from call stack');
    assert.match(watchEvent.source.file, /property-watch-manager\.test/);

    manager.stop();
});

// ── 2. Below threshold → no DIAGNOSTIC ──────────────────────────────────────

test('mutations below threshold do not emit DIAGNOSTIC', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const manager = new PropertyWatchManager({ adapter, store });
    const el = fakeLitElement('x-item');

    manager.start();
    manager.watch('x-item', 'status', { threshold: 3, windowMs: 5000 });
    adapter.connect(el);

    // 3 mutations — at threshold, not over
    adapter.recordUpdateRequested(el, 'status', 'idle');
    adapter.recordUpdateRequested(el, 'status', 'loading');
    adapter.recordUpdateRequested(el, 'status', 'idle');

    const diagnostics = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.watchAlert === true);
    assert.equal(diagnostics.length, 0, 'no DIAGNOSTIC below threshold');

    manager.stop();
});

// ── 3. Above threshold → DIAGNOSTIC with watchAlert: true ───────────────────

test('mutations above threshold emit DIAGNOSTIC with watchAlert: true', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const manager = new PropertyWatchManager({ adapter, store });
    const el = fakeLitElement('x-widget');

    manager.start();
    manager.watch('x-widget', 'status', { threshold: 3, windowMs: 60000 });
    adapter.connect(el);

    // 4 mutations — exceeds threshold of 3
    adapter.recordUpdateRequested(el, 'status', 'a');
    adapter.recordUpdateRequested(el, 'status', 'b');
    adapter.recordUpdateRequested(el, 'status', 'c');
    adapter.recordUpdateRequested(el, 'status', 'd');

    const diagnostics = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.watchAlert === true);
    assert.ok(diagnostics.length >= 1, 'at least one DIAGNOSTIC must fire');
    assert.equal(diagnostics[0].payload.property, 'status');
    assert.equal(diagnostics[0].payload.threshold, 3);
    assert.ok(diagnostics[0].payload.mutationCount > 3);

    manager.stop();
});

// ── 4. unwatch() removes the hook — no further watch events ─────────────────

test('unwatch stops watch-sourced STATE_CHANGED from being emitted', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const manager = new PropertyWatchManager({ adapter, store });
    const el = fakeLitElement('x-box');

    manager.start();
    manager.watch('x-box', 'price');
    adapter.connect(el);

    // First mutation — watch active
    adapter.recordUpdateRequested(el, 'price', 0);
    const before = store.snapshot({ type: RuntimeEventType.STATE_CHANGED })
        .filter(e => e.payload?.watchSource === true).length;
    assert.equal(before, 1);

    // Unwatch
    manager.unwatch('x-box', 'price');

    // Second mutation — watch removed
    adapter.recordUpdateRequested(el, 'price', 1);
    const after = store.snapshot({ type: RuntimeEventType.STATE_CHANGED })
        .filter(e => e.payload?.watchSource === true).length;
    assert.equal(after, 1, 'no new watch event after unwatch');

    manager.stop();
});

// ── 5. payload.watchSource distinguishes from normal LitAdapter events ───────

test('watch-emitted STATE_CHANGED has watchSource:true; normal adapter events do not', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const manager = new PropertyWatchManager({ adapter, store });
    const el = fakeLitElement('x-form');

    manager.start();
    manager.watch('x-form', 'status');
    adapter.connect(el);

    adapter.recordUpdateRequested(el, 'status', 'idle');

    const all = store.snapshot({ type: RuntimeEventType.STATE_CHANGED });
    const watchEvents = all.filter(e => e.payload?.watchSource === true);
    const normalEvents = all.filter(e => !e.payload?.watchSource);

    assert.ok(watchEvents.length >= 1, 'at least one watch-sourced event');
    // Normal adapter-emitted STATE_CHANGED should NOT have watchSource
    assert.ok(normalEvents.length >= 1, 'at least one normal adapter event');
    for (const e of normalEvents) {
        assert.equal(e.payload?.watchSource, undefined, 'adapter event must not have watchSource');
    }

    manager.stop();
});

// ── 6. unwatch() returned by watch() also works ──────────────────────────────

test('returned unwatch function from watch() removes the watch', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const manager = new PropertyWatchManager({ adapter, store });
    const el = fakeLitElement('x-nav');

    manager.start();
    const unwatch = manager.watch('x-nav', 'price');
    adapter.connect(el);

    adapter.recordUpdateRequested(el, 'price', 0);
    assert.equal(
        store.snapshot({ type: RuntimeEventType.STATE_CHANGED })
            .filter(e => e.payload?.watchSource).length,
        1
    );

    unwatch(); // use the returned function

    adapter.recordUpdateRequested(el, 'price', 1);
    assert.equal(
        store.snapshot({ type: RuntimeEventType.STATE_CHANGED })
            .filter(e => e.payload?.watchSource).length,
        1, // no new event after unwatch
    );

    manager.stop();
});

// ── 7. stop() prevents further watch events ──────────────────────────────────

test('stop() removes the adapter interceptor and halts all watch emissions', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const manager = new PropertyWatchManager({ adapter, store });
    const el = fakeLitElement('x-stopped');

    manager.start();
    manager.watch('x-stopped', 'status');
    adapter.connect(el);

    adapter.recordUpdateRequested(el, 'status', 'a');
    const before = store.snapshot({ type: RuntimeEventType.STATE_CHANGED })
        .filter(e => e.payload?.watchSource).length;
    assert.equal(before, 1);

    manager.stop();

    adapter.recordUpdateRequested(el, 'status', 'b');
    const after = store.snapshot({ type: RuntimeEventType.STATE_CHANGED })
        .filter(e => e.payload?.watchSource).length;
    assert.equal(after, 1, 'no new watch event after stop()');
});
