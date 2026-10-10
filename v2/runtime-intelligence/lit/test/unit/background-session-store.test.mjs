import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundSessionStore } from '../../src/core/background-session-store.js';

// Minimal localStorage mock used for each test (no shared state)
function makeLocalStorage() {
    const store = {};
    return {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
    };
}

function withLocalStorage(fn) {
    const orig = globalThis.localStorage;
    globalThis.localStorage = makeLocalStorage();
    try { fn(); } finally { globalThis.localStorage = orig; }
}

test('push + load round-trip preserves all fields', () => {
    withLocalStorage(() => {
        const s = new BackgroundSessionStore();
        const entry = {
            pageUrl: 'https://example.com/page',
            timestamp: 1700000000000,
            title: 'Slow render detected',
            rootLabel: 'Excessive re-renders',
            strength: 'High confidence',
            cascadeSummary: { triggerCount: 3, componentCount: 2, depth: 1, totalUpdateMs: 45 },
            networkCorrelationCount: 2,
            budgetViolationCount: 1,
        };
        s.push(entry);
        const loaded = s.load();
        assert.equal(loaded.length, 1);
        assert.equal(loaded[0].pageUrl, entry.pageUrl);
        assert.equal(loaded[0].title, entry.title);
        assert.equal(loaded[0].rootLabel, entry.rootLabel);
        assert.deepEqual(loaded[0].cascadeSummary, entry.cascadeSummary);
        assert.equal(loaded[0].networkCorrelationCount, 2);
        assert.equal(loaded[0].budgetViolationCount, 1);
        assert.ok(loaded[0].id, 'should auto-generate an id');
    });
});

test('multiple push calls accumulate in order (newest last)', () => {
    withLocalStorage(() => {
        const s = new BackgroundSessionStore();
        s.push({ pageUrl: '/a', timestamp: 1, title: 'A', rootLabel: '', strength: '', cascadeSummary: null, networkCorrelationCount: 0, budgetViolationCount: 0 });
        s.push({ pageUrl: '/b', timestamp: 2, title: 'B', rootLabel: '', strength: '', cascadeSummary: null, networkCorrelationCount: 0, budgetViolationCount: 0 });
        s.push({ pageUrl: '/c', timestamp: 3, title: 'C', rootLabel: '', strength: '', cascadeSummary: null, networkCorrelationCount: 0, budgetViolationCount: 0 });
        const loaded = s.load();
        assert.equal(loaded.length, 3);
        assert.equal(loaded[0].title, 'A');
        assert.equal(loaded[2].title, 'C');
    });
});

test('evicts oldest entry when push exceeds MAX_ENTRIES (50)', () => {
    withLocalStorage(() => {
        const s = new BackgroundSessionStore();
        for (let i = 0; i < 55; i++) {
            s.push({ pageUrl: `/p${i}`, timestamp: i, title: `T${i}`, rootLabel: '', strength: '', cascadeSummary: null, networkCorrelationCount: 0, budgetViolationCount: 0 });
        }
        const loaded = s.load();
        assert.equal(loaded.length, 50, 'should cap at 50 entries');
        assert.equal(loaded[0].title, 'T5', 'oldest 5 should be evicted');
    });
});

test('clear() makes load() return empty array', () => {
    withLocalStorage(() => {
        const s = new BackgroundSessionStore();
        s.push({ pageUrl: '/a', timestamp: 1, title: 'A', rootLabel: '', strength: '', cascadeSummary: null, networkCorrelationCount: 0, budgetViolationCount: 0 });
        assert.equal(s.size(), 1);
        s.clear();
        assert.deepEqual(s.load(), []);
        assert.equal(s.size(), 0);
    });
});

test('graceful when localStorage is unavailable (setItem throws)', () => {
    const orig = globalThis.localStorage;
    globalThis.localStorage = {
        getItem: () => null,
        setItem: () => { throw new Error('QuotaExceeded'); },
        removeItem: () => {},
    };
    try {
        const s = new BackgroundSessionStore();
        assert.doesNotThrow(() => s.push({ pageUrl: '/x', timestamp: 1, title: 'X', rootLabel: '', strength: '', cascadeSummary: null, networkCorrelationCount: 0, budgetViolationCount: 0 }));
        assert.deepEqual(s.load(), []);
    } finally {
        globalThis.localStorage = orig;
    }
});

test('size() returns correct count', () => {
    withLocalStorage(() => {
        const s = new BackgroundSessionStore();
        assert.equal(s.size(), 0);
        s.push({ pageUrl: '/a', timestamp: 1, title: 'A', rootLabel: '', strength: '', cascadeSummary: null, networkCorrelationCount: 0, budgetViolationCount: 0 });
        s.push({ pageUrl: '/b', timestamp: 2, title: 'B', rootLabel: '', strength: '', cascadeSummary: null, networkCorrelationCount: 0, budgetViolationCount: 0 });
        assert.equal(s.size(), 2);
    });
});
