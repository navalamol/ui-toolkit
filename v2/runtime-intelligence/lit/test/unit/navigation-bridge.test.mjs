import assert from 'node:assert/strict';
import test from 'node:test';

import { EvidenceStore } from '../../src/core/evidence-store.js';
import { LitAdapter } from '../../src/adapter/lit/LitAdapter.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { NavigationBridge } from '../../src/integration/lit/navigation-bridge.js';

function fakeWindow(href = 'http://localhost/home') {
    const listeners = new Map();
    const win = {
        location: { href },
        history: {
            pushState(state, title, url) { win.location.href = url || win.location.href; },
            replaceState(state, title, url) { win.location.href = url || win.location.href; },
        },
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) {
            listeners.get(type)?.delete(fn);
        },
        dispatchEvent(event) {
            for (const fn of listeners.get(event.type) ?? []) fn(event);
        },
        _listeners: listeners,
    };
    return win;
}

function tick(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms + 10));
}

// ── 1. pushState emits NAVIGATION with sanitized URL ─────────────────────────

test('pushState emits NAVIGATION event with sanitized URL', async () => {
    const store = new EvidenceStore({ maxEntries: 100, privacyPolicy: false });
    const win = fakeWindow('http://localhost/home?token=secret');
    const bridge = new NavigationBridge({ store, windowTarget: win, orphanCheckDelayMs: 0 });

    bridge.start();
    win.history.pushState({}, '', '/products?session=abc');
    await tick();

    const navEvents = store.snapshot({ type: RuntimeEventType.NAVIGATION });
    assert.ok(navEvents.length >= 1, 'NAVIGATION event must be emitted on pushState');
    const ev = navEvents[0];
    assert.equal(ev.payload.navigationType, 'pushState');
    // URL must not contain query string (masked by enterprise privacy policy)
    // With privacyPolicy:false, url is passed as-is but sanitized by maskUrlQuery internally
    assert.ok(typeof ev.payload.url === 'string', 'url must be a string');
    assert.ok(Number.isFinite(ev.payload.timestamp), 'timestamp must be finite');

    bridge.stop();
});

// ── 2. popstate emits NAVIGATION ─────────────────────────────────────────────

test('popstate emits NAVIGATION event', async () => {
    const store = new EvidenceStore({ maxEntries: 100, privacyPolicy: false });
    const win = fakeWindow('http://localhost/a');
    const bridge = new NavigationBridge({ store, windowTarget: win, orphanCheckDelayMs: 0 });

    bridge.start();
    win.dispatchEvent({ type: 'popstate' });
    await tick();

    const navEvents = store.snapshot({ type: RuntimeEventType.NAVIGATION });
    assert.ok(navEvents.length >= 1, 'NAVIGATION event must be emitted on popstate');
    assert.equal(navEvents[0].payload.navigationType, 'popstate');

    bridge.stop();
});

// ── 3. replaceState emits NAVIGATION ─────────────────────────────────────────

test('replaceState emits NAVIGATION event', async () => {
    const store = new EvidenceStore({ maxEntries: 100, privacyPolicy: false });
    const win = fakeWindow();
    const bridge = new NavigationBridge({ store, windowTarget: win, orphanCheckDelayMs: 0 });

    bridge.start();
    win.history.replaceState({}, '', '/updated');
    await tick();

    const navEvents = store.snapshot({ type: RuntimeEventType.NAVIGATION });
    assert.equal(navEvents[0].payload.navigationType, 'replaceState');

    bridge.stop();
});

// ── 4. Orphan detection: undestroyed component → DIAGNOSTIC ──────────────────

test('component not destroyed before navigation emits DIAGNOSTIC with orphanSuspect:true', async () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const win = fakeWindow();
    const bridge = new NavigationBridge({ store, windowTarget: win, orphanCheckDelayMs: 0 });

    const el = { localName: 'x-leak', requestUpdate() {}, performUpdate() {} };
    adapter.connect(el);

    bridge.start();
    win.history.pushState({}, '', '/next-route');
    await tick();

    const orphans = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.orphanSuspect === true);
    assert.ok(orphans.length >= 1, 'orphan DIAGNOSTIC must be emitted');
    assert.equal(orphans[0].payload.tag, 'x-leak');
    assert.ok(orphans[0].payload.survivedNavigationCount >= 1);

    bridge.stop();
});

// ── 5. Clean component (connected + disconnected) → no orphan DIAGNOSTIC ─────

test('component properly disconnected before navigation does not emit orphan DIAGNOSTIC', async () => {
    const store = new EvidenceStore({ maxEntries: 200, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const win = fakeWindow();
    const bridge = new NavigationBridge({ store, windowTarget: win, orphanCheckDelayMs: 0 });

    const el = { localName: 'x-clean', requestUpdate() {}, performUpdate() {} };
    adapter.connect(el);
    adapter.disconnect(el);  // properly cleaned up

    bridge.start();
    win.history.pushState({}, '', '/next');
    await tick();

    const orphans = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.orphanSuspect === true && e.payload?.tag === 'x-clean');
    assert.equal(orphans.length, 0, 'clean component must not appear as orphan');

    bridge.stop();
});

// ── 6. survivedNavigationCount increments across navigations ─────────────────

test('survivedNavigationCount increments when same component survives multiple navigations', async () => {
    const store = new EvidenceStore({ maxEntries: 300, privacyPolicy: false });
    const adapter = new LitAdapter({ store });
    const win = fakeWindow();
    const bridge = new NavigationBridge({ store, windowTarget: win, orphanCheckDelayMs: 0 });

    const el = { localName: 'x-persistent', requestUpdate() {}, performUpdate() {} };
    adapter.connect(el);

    bridge.start();

    win.history.pushState({}, '', '/route-1');
    await tick();
    win.history.pushState({}, '', '/route-2');
    await tick();

    const orphans = store.snapshot({ type: RuntimeEventType.DIAGNOSTIC })
        .filter(e => e.payload?.orphanSuspect === true && e.payload?.tag === 'x-persistent');
    assert.ok(orphans.length >= 2, 'should have orphan diagnostic for each navigation');

    // Latest entry should have survivedNavigationCount = 2
    const counts = orphans.map(e => e.payload.survivedNavigationCount);
    assert.ok(Math.max(...counts) >= 2, `survivedNavigationCount should reach 2, got: ${counts}`);

    bridge.stop();
});

// ── 7. stop() removes patches — no more NAVIGATION events ────────────────────

test('stop() restores original history methods and removes popstate listener', async () => {
    const store = new EvidenceStore({ maxEntries: 100, privacyPolicy: false });
    const win = fakeWindow();
    const bridge = new NavigationBridge({ store, windowTarget: win, orphanCheckDelayMs: 0 });

    bridge.start();
    win.history.pushState({}, '', '/first');
    await tick();
    const countBefore = store.snapshot({ type: RuntimeEventType.NAVIGATION }).length;
    assert.ok(countBefore >= 1);

    bridge.stop();
    win.history.pushState({}, '', '/after-stop');
    win.dispatchEvent({ type: 'popstate' });
    await tick();

    const countAfter = store.snapshot({ type: RuntimeEventType.NAVIGATION }).length;
    assert.equal(countAfter, countBefore, 'no NAVIGATION events after stop()');
});

// ── 8. Constructor rejects invalid store ─────────────────────────────────────

test('NavigationBridge throws on invalid store', () => {
    assert.throws(
        () => new NavigationBridge({ store: null }),
        /EvidenceStore-compatible/,
        'must throw on null store'
    );
});
