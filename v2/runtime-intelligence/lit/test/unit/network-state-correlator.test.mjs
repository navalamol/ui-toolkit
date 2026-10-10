import assert from 'node:assert/strict';
import test from 'node:test';

import { EvidenceStore } from '../../src/core/evidence-store.js';
import { LitAdapter } from '../../src/adapter/lit/LitAdapter.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { EvidenceGraph } from '../../src/core/evidence-graph.js';
import { NetworkStateCorrelator } from '../../src/integration/lit/network-state-correlator.js';
import { recordLegacyNetworkEntry } from '../../src/integration/lit/network-evidence-bridge.js';

function fakeEl(name) {
    return { localName: name, requestUpdate() {}, performUpdate() {} };
}

// ── 1. NETWORK_COMPLETED → STATE_CHANGED within window → DIAGNOSTIC emitted ──

test('STATE_CHANGED within correlation window produces networkCorrelation DIAGNOSTIC', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const correlator = new NetworkStateCorrelator({ store, correlationWindowMs: 500 });
    correlator.start();

    const el = fakeEl('x-card');
    adapter.connect(el);

    // Emit a network completion
    recordLegacyNetworkEntry(
        { url: 'http://localhost/api/products', method: 'GET', status: 200, durationMs: 80 },
        { store }
    );

    // Immediately after, a state change fires (within 500ms window)
    adapter.recordUpdateRequested(el, 'products', null);

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.networkCorrelation === true);
    assert.ok(diags.length >= 1, 'networkCorrelation DIAGNOSTIC must be emitted');
    const d = diags[0];
    assert.equal(d.payload.networkMethod, 'GET');
    assert.ok(d.payload.networkPath?.includes('/api/products'), `networkPath should include /api/products, got ${d.payload.networkPath}`);
    assert.ok(typeof d.payload.tracedMs === 'number', 'tracedMs must be a number');
    assert.equal(d.payload.stateProperty, 'products');

    correlator.stop();
});

// ── 2. STATE_CHANGED after window expiry → no DIAGNOSTIC ─────────────────────

test('STATE_CHANGED after correlation window expiry is not linked', () => {
    let now = 1000;
    const clock = () => now;
    const store = new EvidenceStore({ maxEntries: 200, clock, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const correlator = new NetworkStateCorrelator({ store, correlationWindowMs: 100 });
    correlator.start();

    const el = fakeEl('x-expired');
    adapter.connect(el);

    // Network at T=1000
    recordLegacyNetworkEntry(
        { url: 'http://localhost/api/data', method: 'GET', status: 200, durationMs: 50 },
        { store }
    );

    // Advance clock past window
    now = 1200; // 200ms later — window was 100ms

    adapter.recordUpdateRequested(el, 'data', null);

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.networkCorrelation === true);
    assert.equal(diags.length, 0, 'no DIAGNOSTIC after window expiry');

    correlator.stop();
});

// ── 3. Multiple network calls: STATE_CHANGED links to the most recent one ─────

test('STATE_CHANGED is correlated with most recent non-expired network call', () => {
    const store = new EvidenceStore({ maxEntries: 300, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const correlator = new NetworkStateCorrelator({ store, correlationWindowMs: 500 });
    correlator.start();

    const el = fakeEl('x-multi');
    adapter.connect(el);

    // Two network calls
    recordLegacyNetworkEntry(
        { url: 'http://localhost/api/old', method: 'GET', status: 200, durationMs: 30 },
        { store }
    );
    recordLegacyNetworkEntry(
        { url: 'http://localhost/api/latest', method: 'POST', status: 201, durationMs: 60 },
        { store }
    );

    // State change should link to the most recent (POST /api/latest)
    adapter.recordUpdateRequested(el, 'result', null);

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.networkCorrelation === true);
    assert.ok(diags.length >= 1, 'at least one DIAGNOSTIC must exist');
    const latest = diags[diags.length - 1];
    assert.ok(latest.payload.networkPath?.includes('/api/latest'),
        `should link to /api/latest, got ${latest.payload.networkPath}`);

    correlator.stop();
});

// ── 4. DIAGNOSTIC has correlation.traceId → EvidenceGraph TRACE_CONTEXT ───────
// Two state changes from the same network call → two DIAGNOSTICs share the same
// traceId → EvidenceGraph creates TRACE_CONTEXT edges between them.

test('two state changes from same network call produce shared traceId and TRACE_CONTEXT edges', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const correlator = new NetworkStateCorrelator({ store, correlationWindowMs: 500 });
    correlator.start();

    const el = fakeEl('x-traced');
    adapter.connect(el);

    recordLegacyNetworkEntry(
        { url: 'http://localhost/api/items', method: 'GET', status: 200, durationMs: 40 },
        { store }
    );
    // Two state changes from the same network call
    adapter.recordUpdateRequested(el, 'items', null);
    adapter.recordUpdateRequested(el, 'count', null);

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.networkCorrelation === true);
    assert.ok(diags.length >= 2, 'two state changes → two networkCorrelation DIAGNOSTICs');

    // Both must share the same traceId
    const traceIds = new Set(diags.map(d => d.correlation?.traceId));
    assert.equal(traceIds.size, 1, 'both DIAGNOSTICs must share the same traceId');
    assert.ok([...traceIds][0]?.startsWith('net-trace-'), 'traceId must start with net-trace-');

    // Temporal CORRELATION must NOT set causedByEventId (evidence honesty rule):
    // proximity is correlation, not confirmed causation. Link via traceId only.
    for (const d of diags) {
        assert.equal(d.correlation?.causedByEventId ?? null, null,
            'causedByEventId must be null for CORRELATION-level temporal evidence');
    }

    // Build a graph — two events share a traceId → TRACE_CONTEXT edge
    const graph = new EvidenceGraph(store.snapshot());
    const traceEdges = graph.edges().filter(e => e.relation === 'trace-context');
    assert.ok(traceEdges.length >= 1, 'EvidenceGraph must have at least one TRACE_CONTEXT edge');

    correlator.stop();
});

// ── 5. Bounded pending: >maxPendingCorrelations drops oldest ──────────────────

test('pending correlations are bounded — oldest dropped when limit exceeded', () => {
    const store = new EvidenceStore({ maxEntries: 500, privacyPolicy: false });
    const correlator = new NetworkStateCorrelator({
        store,
        correlationWindowMs: 60000, // large window so nothing expires
        maxPendingCorrelations: 3,
    });
    correlator.start();

    // Emit 4 network completions — oldest should be dropped when 4th arrives
    for (let i = 1; i <= 4; i++) {
        recordLegacyNetworkEntry(
            { url: `http://localhost/api/call-${i}`, method: 'GET', status: 200, durationMs: 10 },
            { store }
        );
    }

    // The correlator's internal pending should only hold 3 entries max.
    // We test this by checking that after 4 network calls + 1 state change,
    // the state change links to one of the last 3 (not call-1).
    const adapter = new LitAdapter({ store });
    const el = fakeEl('x-bounded');
    adapter.connect(el);
    adapter.recordUpdateRequested(el, 'v', null);

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.networkCorrelation === true);
    assert.ok(diags.length >= 1, 'DIAGNOSTIC must exist');
    // The linked network call should NOT be call-1 (it was dropped)
    assert.ok(
        !diags[diags.length - 1].payload.networkPath?.includes('/api/call-1'),
        'oldest pending correlation should have been evicted'
    );

    correlator.stop();
});

// ── 6. linkCount() increments per emitted DIAGNOSTIC ─────────────────────────

test('linkCount() returns number of network→state correlations emitted', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const correlator = new NetworkStateCorrelator({ store, correlationWindowMs: 500 });
    correlator.start();

    const el = fakeEl('x-counted');
    adapter.connect(el);

    assert.equal(correlator.linkCount(), 0, 'starts at 0');

    recordLegacyNetworkEntry({ url: 'http://localhost/api/x', method: 'GET', status: 200, durationMs: 20 }, { store });
    adapter.recordUpdateRequested(el, 'a', null);
    adapter.recordUpdateRequested(el, 'b', null);

    assert.ok(correlator.linkCount() >= 2, `linkCount should be >= 2, got ${correlator.linkCount()}`);

    correlator.stop();
});

// ── 7. stop() clears pending and stops correlating ───────────────────────────

test('stop() prevents further DIAGNOSTIC emission', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const correlator = new NetworkStateCorrelator({ store, correlationWindowMs: 500 });
    correlator.start();

    const el = fakeEl('x-stopped');
    adapter.connect(el);

    recordLegacyNetworkEntry({ url: 'http://localhost/api/before', method: 'GET', status: 200, durationMs: 10 }, { store });
    correlator.stop();

    // State change AFTER stop — no DIAGNOSTIC should be emitted
    adapter.recordUpdateRequested(el, 'v', null);

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.networkCorrelation === true);
    assert.equal(diags.length, 0, 'no DIAGNOSTIC after stop()');
});

// ── 8. Constructor rejects invalid store ─────────────────────────────────────

test('NetworkStateCorrelator throws on invalid store', () => {
    assert.throws(
        () => new NetworkStateCorrelator({ store: null }),
        /EvidenceStore-compatible/
    );
});
