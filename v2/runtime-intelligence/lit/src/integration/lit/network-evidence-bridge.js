import {
    AttributionQuality,
    EvidenceLevel,
    RuntimeEventType,
} from '../../core/evidence-protocol.js';
import { evidenceStore } from '../../core/evidence-store.js';
import { LdsNetwork } from '../../core/network.js';

let _networkTraceSequence = 0;

function _nextNetworkTraceId(entry) {
    const startedAt = Number.isFinite(entry?.startTime) ? Math.round(entry.startTime) : Date.now();
    _networkTraceSequence += 1;
    return `net-trace-${startedAt}-${_networkTraceSequence}`;
}

function _safePath(entry) {
    const value = typeof entry?.url === 'string' ? entry.url : '';
    return value.split('?')[0].slice(0, 160) || null;
}

function recordLegacyNetworkEntry(entry, { store = evidenceStore } = {}) {
    if (!entry || !store || typeof store.emit !== 'function') return null;
    return store.emit({
        type: RuntimeEventType.NETWORK_COMPLETED,
        framework: {
            name: 'browser',
            adapterVersion: 'legacy-network-bridge-1',
        },
        correlation: {
            traceId: _nextNetworkTraceId(entry),
        },
        evidence: {
            level: EvidenceLevel.OBSERVATION,
            attribution: AttributionQuality.DETERMINISTIC,
            confidence: 1,
        },
        payload: {
            path: _safePath(entry),
            method: entry.method || 'GET',
            status: Number.isFinite(entry.status) ? entry.status : null,
            durationMs: Number.isFinite(entry.durationMs) ? entry.durationMs : null,
            responseSizeKB: Number.isFinite(entry.responseSizeKB) ? entry.responseSizeKB : null,
            transport: entry.type || null,
            isError: entry.isError === true,
            isSlow: entry.isSlow === true,
            isLarge: entry.isLarge === true,
        },
    });
}

let _unsubscribe = null;
function installLegacyNetworkEvidenceBridge({ network = LdsNetwork, store = evidenceStore } = {}) {
    if (_unsubscribe) return _unsubscribe;
    if (!network || typeof network.subscribe !== 'function') return null;
    _unsubscribe = network.subscribe(entry => recordLegacyNetworkEntry(entry, { store }));
    return _unsubscribe;
}

export { installLegacyNetworkEvidenceBridge, recordLegacyNetworkEntry };
