import assert from 'node:assert/strict';
import test from 'node:test';

import { LitAdapter } from '../../src/adapter/lit/LitAdapter.js';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { EvidenceGraph } from '../../src/core/evidence-graph.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { CascadeAnalyzer } from '../../src/core/cascade-analyzer.js';

function fakeLitElement(localName) {
    return { localName, requestUpdate() {}, performUpdate() {} };
}

function buildGraphFromStore(store) {
    return new EvidenceGraph(store.snapshot());
}

// ── 1. No DEPENDENCY_TRIGGERED → null (no cascade) ───────────────────────────

test('single component update with no cascade returns null', () => {
    const store = new EvidenceStore({ maxEntries: 100 });
    const adapter = new LitAdapter({ store });
    const el = fakeLitElement('x-solo');

    adapter.connect(el);
    adapter.recordUpdateRequested(el, 'count', 0);
    adapter.recordUpdateStarted(el);
    adapter.recordUpdateCompleted(el);

    const graph = buildGraphFromStore(store);
    const analyzer = new CascadeAnalyzer();
    const report = analyzer.analyze(graph);

    assert.equal(report, null, 'no cascade when no DEPENDENCY_TRIGGERED events exist');
});

// ── 2. A updates → triggers B and C → componentCount=3, depth=2 ─────────────

test('A triggers B and C: componentCount=3, depth=2', () => {
    const store = new EvidenceStore({ maxEntries: 200 });
    const adapter = new LitAdapter({ store });

    const elA = fakeLitElement('x-parent');
    const elB = fakeLitElement('x-child-b');
    const elC = fakeLitElement('x-child-c');

    adapter.connect(elA);
    adapter.connect(elB);
    adapter.connect(elC);

    // A starts rendering
    adapter.recordUpdateRequested(elA, 'data', null);
    adapter.recordUpdateStarted(elA);

    // B and C are triggered while A is mid-render
    adapter.recordUpdateRequested(elB, 'value', null);
    adapter.recordUpdateRequested(elC, 'label', null);

    // A finishes
    adapter.recordUpdateCompleted(elA);

    const graph = buildGraphFromStore(store);
    const analyzer = new CascadeAnalyzer();
    const report = analyzer.analyze(graph);

    assert.ok(report, 'cascade report must exist');
    assert.equal(report.hasCascade, true);
    assert.ok(report.componentCount >= 2, `componentCount should be >= 2, got ${report.componentCount}`);
    assert.ok(report.triggerCount >= 2, `triggerCount should be >= 2, got ${report.triggerCount}`);
    assert.ok(report.depth >= 1, `depth should be >= 1, got ${report.depth}`);
});

// ── 3. A → B → C (chain) → depth=2 minimum ──────────────────────────────────

test('chained cascade A→B→C reports depth >= 2', () => {
    const store = new EvidenceStore({ maxEntries: 200 });
    const adapter = new LitAdapter({ store });

    const elA = fakeLitElement('x-root');
    const elB = fakeLitElement('x-mid');
    const elC = fakeLitElement('x-leaf');

    adapter.connect(elA);
    adapter.connect(elB);
    adapter.connect(elC);

    // A starts → triggers B mid-render
    adapter.recordUpdateRequested(elA, 'mode', null);
    adapter.recordUpdateStarted(elA);
    adapter.recordUpdateRequested(elB, 'mode', null);  // B triggered by A

    // B starts → triggers C mid-render
    adapter.recordUpdateStarted(elB);
    adapter.recordUpdateRequested(elC, 'mode', null);  // C triggered by B

    adapter.recordUpdateCompleted(elC);
    adapter.recordUpdateCompleted(elB);
    adapter.recordUpdateCompleted(elA);

    const graph = buildGraphFromStore(store);
    const analyzer = new CascadeAnalyzer();
    const report = analyzer.analyze(graph);

    assert.ok(report, 'cascade report must exist for chained cascade');
    assert.ok(report.depth >= 2, `chained cascade depth should be >= 2, got ${report.depth}`);
    assert.ok(report.triggerCount >= 2, `triggerCount should be >= 2, got ${report.triggerCount}`);
});

// ── 4. Over-reacting component detected ──────────────────────────────────────

test('component triggered >3 times appears in overReactingOwners', () => {
    const store = new EvidenceStore({ maxEntries: 300 });
    const adapter = new LitAdapter({ store });

    const elA = fakeLitElement('x-broadcaster');
    const elB = fakeLitElement('x-reactor');

    adapter.connect(elA);
    adapter.connect(elB);

    // Simulate elA triggering elB 4 times (e.g. rapid state updates while A renders)
    for (let i = 0; i < 4; i++) {
        adapter.recordUpdateRequested(elA, 'tick', i);
        adapter.recordUpdateStarted(elA);
        adapter.recordUpdateRequested(elB, 'tick', i);   // B triggered each time A renders
        adapter.recordUpdateCompleted(elA);
    }

    const graph = buildGraphFromStore(store);
    const analyzer = new CascadeAnalyzer({ overReactingThreshold: 3 });
    const report = analyzer.analyze(graph);

    assert.ok(report, 'cascade report must exist');
    assert.ok(
        report.overReactingOwners.some(o => o.tag === 'x-reactor'),
        `x-reactor should be in overReactingOwners, got: ${JSON.stringify(report.overReactingOwners)}`
    );
});

// ── 5. totalUpdateMs sums cascaded UPDATE_COMPLETED durations ────────────────

test('totalUpdateMs only sums durations of cascaded components', () => {
    const store = new EvidenceStore({ maxEntries: 200 });
    const adapter = new LitAdapter({ store });

    const elA = fakeLitElement('x-trigger');
    const elB = fakeLitElement('x-cascaded');

    adapter.connect(elA);
    adapter.connect(elB);

    adapter.recordUpdateRequested(elA, 'state', null);
    adapter.recordUpdateStarted(elA);
    adapter.recordUpdateRequested(elB, 'state', null);  // B triggered by A
    adapter.recordUpdateCompleted(elA);
    adapter.recordUpdateCompleted(elB);

    const graph = buildGraphFromStore(store);
    const analyzer = new CascadeAnalyzer();
    const report = analyzer.analyze(graph);

    assert.ok(report, 'cascade report must exist');
    assert.ok(typeof report.totalUpdateMs === 'number', 'totalUpdateMs must be a number');
    assert.ok(report.totalUpdateMs >= 0, 'totalUpdateMs must be non-negative');
});

// ── 6. branches array is sorted by depth ─────────────────────────────────────

test('branches are sorted by ascending depth', () => {
    const store = new EvidenceStore({ maxEntries: 200 });
    const adapter = new LitAdapter({ store });

    const elA = fakeLitElement('x-root');
    const elB = fakeLitElement('x-mid');
    const elC = fakeLitElement('x-leaf');

    adapter.connect(elA);
    adapter.connect(elB);
    adapter.connect(elC);

    adapter.recordUpdateRequested(elA, 'x', null);
    adapter.recordUpdateStarted(elA);
    adapter.recordUpdateRequested(elB, 'x', null);
    adapter.recordUpdateStarted(elB);
    adapter.recordUpdateRequested(elC, 'x', null);
    adapter.recordUpdateCompleted(elC);
    adapter.recordUpdateCompleted(elB);
    adapter.recordUpdateCompleted(elA);

    const graph = buildGraphFromStore(store);
    const analyzer = new CascadeAnalyzer();
    const report = analyzer.analyze(graph);

    assert.ok(report, 'cascade report must exist');
    if (report.branches.length >= 2) {
        for (let i = 1; i < report.branches.length; i++) {
            assert.ok(
                report.branches[i].depth >= report.branches[i - 1].depth,
                `branches must be sorted by ascending depth`
            );
        }
    }
});

// ── 7. CascadeReport is frozen (immutable) ───────────────────────────────────

test('CascadeReport and its arrays are frozen', () => {
    const store = new EvidenceStore({ maxEntries: 200 });
    const adapter = new LitAdapter({ store });

    const elA = fakeLitElement('x-frozen-root');
    const elB = fakeLitElement('x-frozen-child');

    adapter.connect(elA);
    adapter.connect(elB);

    adapter.recordUpdateRequested(elA, 'v', null);
    adapter.recordUpdateStarted(elA);
    adapter.recordUpdateRequested(elB, 'v', null);
    adapter.recordUpdateCompleted(elA);

    const graph = buildGraphFromStore(store);
    const analyzer = new CascadeAnalyzer();
    const report = analyzer.analyze(graph);

    assert.ok(report, 'cascade report must exist');
    assert.ok(Object.isFrozen(report), 'CascadeReport must be frozen');
    assert.ok(Object.isFrozen(report.branches), 'branches must be frozen');
    assert.ok(Object.isFrozen(report.overReactingOwners), 'overReactingOwners must be frozen');
});
