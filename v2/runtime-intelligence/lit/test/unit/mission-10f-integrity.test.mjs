import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EvidenceStore } from '../../src/core/evidence-store.js';
import { EvidenceGraph, EdgeRelation } from '../../src/core/evidence-graph.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { LitAdapter } from '../../src/adapter/lit/LitAdapter.js';
import { recordLegacyNetworkEntry } from '../../src/integration/lit/network-evidence-bridge.js';
import { NetworkStateCorrelator } from '../../src/integration/lit/network-state-correlator.js';
import { UpdateBudgetMonitor } from '../../src/core/update-budget-monitor.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function fakeEl(name) {
    return { localName: name, requestUpdate() {}, performUpdate() {} };
}

function fireUpdate(adapter, el, property = 'v') {
    adapter.recordUpdateRequested(el, property, null);
    adapter.recordUpdateStarted(el);
    adapter.recordUpdateCompleted(el);
}

test('temporal network/state correlation creates trace context but no causal network edge', () => {
    const store = new EvidenceStore({ maxEntries: 100, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const correlator = new NetworkStateCorrelator({ store, correlationWindowMs: 500 }).start();
    const el = fakeEl('x-products');
    adapter.connect(el);

    const network = recordLegacyNetworkEntry({ url: '/api/products', method: 'GET', status: 200 }, { store });
    adapter.recordUpdateRequested(el, 'products', null);

    const diagnostic = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .find(event => event.payload?.networkCorrelation === true);
    assert.ok(diagnostic);
    assert.ok(network.correlation.traceId?.startsWith('net-trace-'));
    assert.equal(diagnostic.correlation.traceId, network.correlation.traceId);
    assert.equal(diagnostic.correlation.causedByEventId, null);

    const graph = new EvidenceGraph(store.snapshot());
    assert.ok(graph.edges().some(edge => edge.relation === EdgeRelation.TRACE_CONTEXT));
    assert.equal(
        graph.outgoing(network.id).some(edge => edge.relation === EdgeRelation.CAUSES),
        false,
        'timing proximity must never manufacture a CAUSES edge from the network event',
    );
    correlator.stop();
});

test('update budget emits once per continuous violation episode and re-arms after recovery', () => {
    let now = 1000;
    const store = new EvidenceStore({ maxEntries: 200, clock: () => now, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const monitor = new UpdateBudgetMonitor({ store, budget: { countPerWindow: 2, windowMs: 100 } }).start();
    const el = fakeEl('x-budget');
    adapter.connect(el);

    for (let i = 0; i < 7; i++) fireUpdate(adapter, el);
    assert.equal(monitor.violationCount(), 1);

    now = 1200;
    fireUpdate(adapter, el);
    now = 1210;
    fireUpdate(adapter, el);
    fireUpdate(adapter, el);

    assert.equal(monitor.violationCount(), 2);
    const diagnostics = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(event => event.payload?.budgetViolation === true);
    assert.equal(diagnostics.length, 2);
    monitor.stop();
});

test('Lit remains a required peer dependency', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.peerDependencies?.lit, '>=3.0.0');
    assert.equal(pkg.peerDependenciesMeta?.lit?.optional, undefined);
});
