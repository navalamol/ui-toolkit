import assert from 'node:assert/strict';
import test from 'node:test';

import { LitAdapter } from '../../src/adapter/lit/LitAdapter.js';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { LitIntelligencePipeline } from '../../src/integration/lit/LitIntelligencePipeline.js';
import { recordLegacyLitError, recordSlowRender } from '../../src/integration/lit/legacy-collector-bridge.js';

function fakeLitElement() {
    return {
        localName: 'x-order-card',
        requestUpdate() {},
        performUpdate() {},
        status: 'old',
    };
}

test('pipeline starts with a compact developer-facing ready state', () => {
    const store = new EvidenceStore({ maxEntries: 20 });
    const pipeline = new LitIntelligencePipeline({ store, windowTarget: null });
    pipeline.start();
    const snapshot = pipeline.snapshot();
    assert.equal(snapshot.status, 'ready');
    assert.match(snapshot.headline, /ready/i);
    assert.match(snapshot.explanation, /original panel/i);
    assert.equal(snapshot.technicalEvidence.eventCount, 0);
    assert.equal('capsule' in snapshot, false);
    assert.equal('incident' in snapshot, false);
    assert.equal('causalChain' in snapshot, false);
    assert.equal(pipeline.exportCapsule(), null);
    pipeline.stop();
});

test('Lit error collector reaches UREP, compact developer view, forensic capsule and verification without duplicate lifecycle', () => {
    const store = new EvidenceStore({ maxEntries: 100 });
    const adapter = new LitAdapter({ store });
    const pipeline = new LitIntelligencePipeline({ store, windowTarget: null });
    const el = fakeLitElement();

    pipeline.start();
    const owner = adapter.connect(el);
    el.status = 'new';
    const updateRequested = adapter.recordUpdateRequested(el, 'status', 'old');
    adapter.recordUpdateStarted(el);
    adapter.recordUpdateCompleted(el);

    const error = new Error('render exploded');
    error.stack = 'Error: render exploded\n    at render (src/components/x-order-card/x-order-card.js:42:7)';
    const errorEvent = recordLegacyLitError(el, {
        phase: 'updated',
        message: error.message,
    }, error, { adapter });

    assert.equal(errorEvent.type, RuntimeEventType.ERROR);
    assert.equal(errorEvent.owner.id, owner.id);
    assert.equal(errorEvent.correlation.causedByEventId, updateRequested.id);
    assert.equal(errorEvent.source.file, 'src/components/x-order-card/x-order-card.js');
    assert.ok(errorEvent.privacy);

    const events = store.snapshot();
    assert.equal(events.filter(event => event.type === RuntimeEventType.OWNER_CREATED).length, 1);
    assert.equal(events.filter(event => event.type === RuntimeEventType.UPDATE_REQUESTED).length, 1);
    assert.equal(events.filter(event => event.type === RuntimeEventType.ERROR).length, 1);

    const snapshot = pipeline.snapshot();
    assert.equal(snapshot.status, 'incident-captured');
    assert.match(snapshot.headline, /runtime error/i);
    assert.match(snapshot.problem, /render exploded/i);
    assert.ok(snapshot.likelyCause);
    assert.equal(snapshot.technicalEvidence.available, true);
    assert.equal(snapshot.technicalEvidence.eventCount, events.length);
    assert.equal('capsule' in snapshot, false);
    assert.equal('incident' in snapshot, false);
    assert.equal('causalChain' in snapshot, false);
    assert.equal(JSON.stringify(snapshot).includes('evt-'), false);

    const capsule = pipeline.exportCapsule();
    assert.ok(capsule.evidence.eventIds.includes(errorEvent.id));
    assert.equal(capsule.privacy.enforced, true);

    const verified = pipeline.recordVerification({
        outcome: 'confirmed',
        confirmed: true,
        metrics: [{ key: 'errors', before: 1, after: 0 }],
    });
    assert.equal(verified.verification.outcome, 'confirmed');
    assert.equal(pipeline.exportCapsule().verification.outcome, 'confirmed');

    pipeline.stop();
});

test('slow Lit update is analyzed without consuming the recorder, preserving a later runtime error', () => {
    const store = new EvidenceStore({ maxEntries: 100 });
    const adapter = new LitAdapter({ store });
    const pipeline = new LitIntelligencePipeline({
        store,
        windowTarget: null,
        slowUpdateThresholdMs: 500,
    });
    const el = fakeLitElement();

    pipeline.start();
    adapter.connect(el);
    const requested = adapter.recordUpdateRequested(el, null, undefined);
    const started = adapter.recordUpdateStarted(el);
    adapter.emit(RuntimeEventType.UPDATE_COMPLETED, {
        owner: adapter.ownerOf(el),
        correlation: {
            parentEventId: started?.id || requested?.id || null,
            causedByEventId: requested?.id || null,
        },
        payload: { durationMs: 750 },
    });

    const slowSnapshot = pipeline.snapshot();
    assert.equal(slowSnapshot.status, 'incident-captured');
    assert.match(slowSnapshot.problem, /750 ms/i);
    assert.equal(pipeline.exportCapsule().problem.title, 'Lit slow update');
    assert.equal(pipeline.exportCapsule().environment.slowUpdateThresholdMs, 500);
    assert.equal(pipeline.recorder().incident(), null);

    const error = new Error('later crash');
    error.stack = 'Error: later crash\n    at render (src/components/x-order-card/x-order-card.js:52:9)';
    const errorEvent = recordLegacyLitError(el, {
        phase: 'updated',
        message: error.message,
    }, error, { adapter });

    const errorSnapshot = pipeline.snapshot();
    assert.match(errorSnapshot.problem, /later crash/i);
    assert.equal(errorSnapshot.technicalEvidence.triggerType, 'runtime error');
    assert.ok(pipeline.exportCapsule().evidence.eventIds.includes(errorEvent.id));
    assert.equal(pipeline.recorder().incident().reason, 'lit-runtime-error');
    pipeline.stop();
});

test('sub-threshold Lit update keeps intelligence in ready state', () => {
    const store = new EvidenceStore({ maxEntries: 20 });
    const adapter = new LitAdapter({ store });
    const pipeline = new LitIntelligencePipeline({
        store,
        windowTarget: null,
        slowUpdateThresholdMs: 500,
    });
    const el = fakeLitElement();

    pipeline.start();
    adapter.connect(el);
    adapter.emit(RuntimeEventType.UPDATE_COMPLETED, {
        owner: adapter.ownerOf(el),
        payload: { durationMs: 499.9 },
    });

    assert.equal(pipeline.snapshot().status, 'ready');
    assert.equal(pipeline.recorder().incident(), null);
    pipeline.stop();
});

// ── P1: recordSlowRender ──────────────────────────────────────────────────────

test('recordSlowRender above threshold enters slow-update-captured with perf-legacy source', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const pipeline = new LitIntelligencePipeline({
        store,
        windowTarget: null,
        slowUpdateThresholdMs: 500,
    });
    const el = fakeLitElement();

    pipeline.start();
    adapter.connect(el);
    recordSlowRender(el, 600, { adapter });

    const snapshot = pipeline.snapshot();
    assert.equal(snapshot.status, 'incident-captured');

    const events = store.snapshot();
    const triggerEvent = events.find(e => e.type === RuntimeEventType.UPDATE_COMPLETED);
    assert.ok(triggerEvent, 'UPDATE_COMPLETED event must exist');
    assert.equal(triggerEvent.payload.source, 'perf-legacy');
    pipeline.stop();
});

test('recordSlowRender below threshold keeps pipeline in ready state', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const pipeline = new LitIntelligencePipeline({
        store,
        windowTarget: null,
        slowUpdateThresholdMs: 500,
    });
    const el = fakeLitElement();

    pipeline.start();
    adapter.connect(el);
    recordSlowRender(el, 400, { adapter });

    assert.equal(pipeline.snapshot().status, 'ready');
    pipeline.stop();
});

test('recordSlowRender with NaN emits no event and pipeline stays ready', () => {
    const store = new EvidenceStore({ maxEntries: 50 });
    const adapter = new LitAdapter({ store });
    const pipeline = new LitIntelligencePipeline({ store, windowTarget: null });
    const el = fakeLitElement();

    pipeline.start();
    adapter.connect(el);
    const before = store.snapshot().length;
    recordSlowRender(el, NaN, { adapter });

    assert.equal(store.snapshot().length, before);
    assert.equal(pipeline.snapshot().status, 'ready');
    pipeline.stop();
});

// ── P2: Intelligence tab opt-in gate ─────────────────────────────────────────

test('intelligence disabled — start() does not patch lds-debug-panel prototype', () => {
    const store = new EvidenceStore({ maxEntries: 20 });
    const previousWindow = globalThis.window;
    try {
        const fakePanel = function LdsDebugPanel() {};
        const target = {
            customElements: { get: name => name === 'lds-debug-panel' ? fakePanel : undefined },
            dispatchEvent() {},
            CustomEvent: class CustomEvent { constructor() {} },
        };
        // No __LDS_INTELLIGENCE_ENABLED__ and no __LDS_DEBUG__.intelligence
        globalThis.window = target;

        const pipeline = new LitIntelligencePipeline({ store, windowTarget: target });
        pipeline.start();

        assert.equal(fakePanel.prototype.__ldsIntelligencePresentationPatched, undefined);
        pipeline.stop();
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('intelligence enabled — tab installs as before', () => {
    const store = new EvidenceStore({ maxEntries: 20 });
    const previousWindow = globalThis.window;
    try {
        const fakePanel = function LdsDebugPanel() {};
        const target = {
            __LDS_INTELLIGENCE_ENABLED__: true,
            customElements: { get: name => name === 'lds-debug-panel' ? fakePanel : undefined },
            dispatchEvent() {},
            CustomEvent: class CustomEvent { constructor() {} },
        };
        globalThis.window = target;

        const pipeline = new LitIntelligencePipeline({ store, windowTarget: target });
        pipeline.start();

        assert.equal(fakePanel.prototype.__ldsIntelligencePresentationPatched, true);
        pipeline.stop();
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});
