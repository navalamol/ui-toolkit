import assert from 'node:assert/strict';
import test from 'node:test';

import { EvidenceStore } from '../../src/core/evidence-store.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';
import { recordLegacyNetworkEntry } from '../../src/integration/lit/network-evidence-bridge.js';

test('legacy network completion becomes privacy-safe UREP evidence without raw request data', () => {
    const store = new EvidenceStore({ capacity: 20 });
    const event = recordLegacyNetworkEntry({
        url: '/api/items?email=person@example.com&token=secret',
        fullUrl: 'https://example.test/api/items?email=person@example.com&token=secret',
        method: 'POST',
        status: 503,
        durationMs: 2450,
        responseSizeKB: 800,
        type: 'fetch',
        isError: true,
        isSlow: true,
        isLarge: true,
        decoded: { payload: 'must-not-cross-bridge' },
        error: 'private server response',
    }, { store });

    assert.equal(event.type, RuntimeEventType.NETWORK_COMPLETED);
    assert.equal(event.framework.name, 'browser');
    assert.equal(event.payload.path, '/api/items');
    assert.equal(event.payload.method, 'POST');
    assert.equal(event.payload.status, 503);
    assert.equal(event.payload.durationMs, 2450);
    assert.equal(event.payload.transport, 'fetch');
    assert.equal(event.payload.isError, true);
    assert.equal(event.payload.fullUrl, undefined);
    assert.equal(event.payload.decoded, undefined);
    assert.equal(event.payload.error, undefined);
    assert.ok(event.privacy);
});
