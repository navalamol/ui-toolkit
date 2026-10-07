import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AttributionQuality,
    EvidenceLevel,
    RuntimeEventType,
} from '../../src/core/evidence-protocol.js';
import { EvidenceGraph } from '../../src/core/evidence-graph.js';
import { RootCauseGrouper } from '../../src/core/root-cause.js';
import { _toolEnabled } from '../../src/core/gate.js';

function event(id, sequence, type, {
    level = EvidenceLevel.OBSERVATION,
    correlation = {},
    payload = {},
} = {}) {
    return Object.freeze({
        id,
        sequence,
        timestamp: sequence,
        type,
        framework: Object.freeze({ name: 'test' }),
        owner: Object.freeze({ id: 'owner-a', name: 'owner-a', lifecycleGeneration: 1 }),
        source: null,
        correlation: Object.freeze(correlation),
        evidence: Object.freeze({
            level,
            attribution: AttributionQuality.DETERMINISTIC,
            confidence: 1,
        }),
        payload: Object.freeze(payload),
    });
}

test('causality-confirmed edge upgrades cluster strength to confirmed', () => {
    const root = event('root', 1, RuntimeEventType.STATE_CHANGED, {
        level: EvidenceLevel.ATTRIBUTION,
        payload: { property: 'query' },
    });
    const symptom = event('symptom', 2, RuntimeEventType.ERROR, {
        level: EvidenceLevel.CAUSALITY_CONFIRMED,
        correlation: { causedByEventId: 'root' },
    });

    const cluster = new RootCauseGrouper().group(
        new EvidenceGraph([root, symptom], { includeContextEdges: false }),
    )[0];

    assert.equal(cluster.strength, 'confirmed');
    assert.equal(cluster.rootEventId, 'root');
});

test('equal root-cause candidate scores use earlier sequence as deterministic tie-break', () => {
    const earlier = Object.freeze({
        ...event('earlier', 1, RuntimeEventType.STATE_CHANGED, {
            payload: { property: 'first' },
        }),
        correlation: Object.freeze({ interactionId: 'same-context' }),
    });
    const later = Object.freeze({
        ...event('later', 2, RuntimeEventType.DEPENDENCY_TRIGGERED, {
            payload: { key: 'second' },
        }),
        correlation: Object.freeze({ interactionId: 'same-context' }),
    });

    const cluster = new RootCauseGrouper().group(new EvidenceGraph([earlier, later]))[0];

    assert.equal(cluster.candidates[0].score, cluster.candidates[1].score);
    assert.equal(cluster.rootEventId, 'earlier');
    assert.equal(cluster.candidates[0].eventId, 'earlier');
});

test('intelligence gate remains opt-in and supports standalone enablement', () => {
    const previousWindow = globalThis.window;
    try {
        globalThis.window = {};
        assert.equal(_toolEnabled('intelligence'), false);

        globalThis.window.__LDS_INTELLIGENCE_ENABLED__ = true;
        assert.equal(_toolEnabled('intelligence'), true);

        delete globalThis.window.__LDS_INTELLIGENCE_ENABLED__;
        globalThis.window.__LDS_DEBUG__ = { intelligence: true };
        assert.equal(_toolEnabled('intelligence'), true);

        globalThis.window.__LDS_DEBUG__ = { perf: true };
        assert.equal(_toolEnabled('intelligence'), false);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});
