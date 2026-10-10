import assert from 'node:assert/strict';
import test from 'node:test';

import { EvidenceStore } from '../../src/core/evidence-store.js';
import { LitAdapter } from '../../src/adapter/lit/LitAdapter.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { UpdateBudgetMonitor } from '../../src/core/update-budget-monitor.js';

function fakeEl(name) {
    return { localName: name, requestUpdate() {}, performUpdate() {} };
}

function fireUpdates(adapter, el, count) {
    for (let i = 0; i < count; i++) {
        adapter.recordUpdateRequested(el, 'v', i);
        adapter.recordUpdateStarted(el);
        adapter.recordUpdateCompleted(el);
    }
}

// ── 1. Under-budget updates → no DIAGNOSTIC ──────────────────────────────────

test('updates within budget produce no DIAGNOSTIC', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const monitor = new UpdateBudgetMonitor({
        store,
        budget: { countPerWindow: 5, windowMs: 1000 },
    });
    monitor.start();

    const el = fakeEl('x-ok');
    adapter.connect(el);
    fireUpdates(adapter, el, 5); // exactly at budget, not over

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.budgetViolation === true);
    assert.equal(diags.length, 0, 'no budget violation DIAGNOSTIC at exactly the budget');

    monitor.stop();
});

// ── 2. Over-budget → DIAGNOSTIC with budgetViolation:true ────────────────────

test('updates exceeding budget emit DIAGNOSTIC with budgetViolation:true', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const monitor = new UpdateBudgetMonitor({
        store,
        budget: { countPerWindow: 3, windowMs: 1000 },
    });
    monitor.start();

    const el = fakeEl('x-over');
    adapter.connect(el);
    fireUpdates(adapter, el, 4); // 4 > budget of 3

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.budgetViolation === true);
    assert.ok(diags.length >= 1, 'at least one budget violation DIAGNOSTIC must be emitted');
    const d = diags[0];
    assert.equal(d.payload.tag, 'x-over');
    assert.ok(d.payload.updateCount > 3, 'updateCount must exceed budget');
    assert.equal(d.payload.countPerWindow, 3);
    assert.equal(d.payload.windowMs, 1000);
    assert.ok(typeof d.payload.totalMs === 'number', 'totalMs must be a number');

    monitor.stop();
});

// ── 3. Per-tag budget override is respected ───────────────────────────────────

test('per-tag budget override applies only to matching tag', () => {
    const store = new EvidenceStore({ maxEntries: 300, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const monitor = new UpdateBudgetMonitor({
        store,
        budget: { countPerWindow: 10, windowMs: 1000 }, // lenient default
    });
    monitor.setBudget('x-strict', { countPerWindow: 2, windowMs: 1000 });
    monitor.start();

    const elStrict = fakeEl('x-strict');
    const elDefault = fakeEl('x-default');
    adapter.connect(elStrict);
    adapter.connect(elDefault);

    fireUpdates(adapter, elStrict, 3);   // 3 > 2 (strict budget)
    fireUpdates(adapter, elDefault, 3);  // 3 < 10 (default budget — no violation)

    const strictDiags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.budgetViolation === true && e.payload?.tag === 'x-strict');
    const defaultDiags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.budgetViolation === true && e.payload?.tag === 'x-default');

    assert.ok(strictDiags.length >= 1, 'x-strict should violate its tight budget');
    assert.equal(defaultDiags.length, 0, 'x-default should not violate the lenient default');

    monitor.stop();
});

// ── 4. Rolling window correctly expires old updates ───────────────────────────

test('updates outside the rolling window do not contribute to violation', () => {
    let now = 1000;
    const clock = () => now;
    const store = new EvidenceStore({ maxEntries: 200, clock, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const monitor = new UpdateBudgetMonitor({
        store,
        budget: { countPerWindow: 3, windowMs: 100 },
    });
    monitor.start();

    const el = fakeEl('x-windowed');
    adapter.connect(el);

    // 3 updates at T=1000
    fireUpdates(adapter, el, 3);

    // Advance clock past the window
    now = 1200;

    // 2 more updates — old ones have expired, new window has only 2 → under budget
    fireUpdates(adapter, el, 2);

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.budgetViolation === true);
    assert.equal(diags.length, 0, 'old updates outside window must not contribute to violation');

    monitor.stop();
});

// ── 5. stop() unsubscribes — no further DIAGNOSTICs ──────────────────────────

test('stop() prevents further budget violation DIAGNOSTICs', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const monitor = new UpdateBudgetMonitor({
        store,
        budget: { countPerWindow: 1, windowMs: 1000 },
    });
    monitor.start();

    const el = fakeEl('x-halted');
    adapter.connect(el);
    fireUpdates(adapter, el, 2); // triggers violation

    const countBefore = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.budgetViolation === true).length;
    assert.ok(countBefore >= 1, 'baseline: violation emitted before stop');

    monitor.stop();
    fireUpdates(adapter, el, 5); // should not trigger anything

    const countAfter = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.budgetViolation === true).length;
    assert.equal(countAfter, countBefore, 'no new violations after stop()');
});

// ── 6. violationCount() increments per emitted DIAGNOSTIC ────────────────────

test('violationCount() tracks total budget violations emitted', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const monitor = new UpdateBudgetMonitor({
        store,
        budget: { countPerWindow: 2, windowMs: 1000 },
    });
    monitor.start();

    const el = fakeEl('x-counted');
    adapter.connect(el);

    assert.equal(monitor.violationCount(), 0);
    fireUpdates(adapter, el, 5);
    assert.ok(monitor.violationCount() >= 1, `violationCount should be >= 1, got ${monitor.violationCount()}`);

    monitor.stop();
});

// ── 7. DIAGNOSTIC has causedByEventId linking to the trigger UPDATE_COMPLETED ─

test('budget violation DIAGNOSTIC uses traceId correlation, not causedByEventId (evidence honesty rule)', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const monitor = new UpdateBudgetMonitor({
        store,
        budget: { countPerWindow: 2, windowMs: 1000 },
    });
    monitor.start();

    const el = fakeEl('x-linked');
    adapter.connect(el);
    fireUpdates(adapter, el, 3);

    const diag = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .find(e => e.payload?.budgetViolation === true);
    assert.ok(diag, 'DIAGNOSTIC must exist');
    // Repeated updates exceeding budget = CORRELATION not confirmed causation.
    // causedByEventId must be null; the budget violation is identified via its payload.
    assert.equal(diag.correlation?.causedByEventId ?? null, null,
        'causedByEventId must be null for CORRELATION-level temporal evidence');

    monitor.stop();
});

// ── 8. Constructor throws on invalid store ────────────────────────────────────

test('UpdateBudgetMonitor throws on invalid store', () => {
    assert.throws(
        () => new UpdateBudgetMonitor({ store: null }),
        /EvidenceStore-compatible/
    );
});

// ── 9. clearBudgets() removes all per-tag overrides ──────────────────────────

test('clearBudgets() removes per-tag overrides — default budget applies again', () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const monitor = new UpdateBudgetMonitor({
        store,
        budget: { countPerWindow: 10, windowMs: 1000 }, // lenient default
    });
    monitor.setBudget('x-was-strict', { countPerWindow: 1, windowMs: 1000 });
    monitor.clearBudgets(); // remove strict override
    monitor.start();

    const el = fakeEl('x-was-strict');
    adapter.connect(el);
    fireUpdates(adapter, el, 3); // 3 < 10 (default) — should not violate

    const diags = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.budgetViolation === true);
    assert.equal(diags.length, 0, 'cleared budget should fall back to lenient default');

    monitor.stop();
});
