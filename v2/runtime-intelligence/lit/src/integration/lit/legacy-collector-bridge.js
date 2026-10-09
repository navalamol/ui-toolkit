import { litAdapter } from '../../adapter/lit/LitAdapter.js';
import {
    AttributionQuality,
    EvidenceLevel,
    RuntimeEventType,
} from '../../core/evidence-protocol.js';
import { parseRuntimeSourceLocation } from '../../core/source-resolver.js';

let _fallbackOwnerSequence = 0;
const _fallbackOwners = new WeakMap();

function _tag(el) {
    return el?.localName || el?.tagName?.toLowerCase?.() || el?.constructor?.name || 'lit-component';
}

function _fallbackOwner(el) {
    if (!el || (typeof el !== 'object' && typeof el !== 'function')) {
        return { id: `legacy-lit-${++_fallbackOwnerSequence}`, kind: 'component', name: 'lit-component' };
    }
    let owner = _fallbackOwners.get(el);
    if (!owner) {
        owner = {
            id: `legacy-lit-${++_fallbackOwnerSequence}`,
            kind: 'component',
            name: _tag(el),
        };
        _fallbackOwners.set(el, owner);
    }
    return owner;
}

function _sourceFromStack(stack) {
    if (typeof stack !== 'string') return null;
    const lines = stack.split('\n').slice(1);
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.includes('/core/error-boundary.js') || line.includes('/integration/lit/legacy-collector-bridge.js')) continue;
        const source = parseRuntimeSourceLocation(line);
        if (source?.file) return source;
    }
    return null;
}

function _latest(events, types) {
    const allowed = new Set(types);
    for (let index = events.length - 1; index >= 0; index -= 1) {
        if (allowed.has(events[index]?.type)) return events[index];
    }
    return null;
}

/**
 * Transitional bridge from the mature Lit error collector into UREP.
 *
 * Lifecycle/update evidence remains owned by LitAdapter. This bridge only emits
 * the collector-specific ERROR signal and links it to the latest attributed
 * update request when available, avoiding duplicate lifecycle evidence.
 */
function recordLegacyLitError(el, entry, error, { adapter = litAdapter } = {}) {
    if (!adapter?.store || typeof adapter.emit !== 'function') return null;

    const owner = adapter.ownerOf?.(el) || _fallbackOwner(el);
    const ownerEvents = owner?.id && typeof adapter.store.snapshot === 'function'
        ? adapter.store.snapshot({ ownerId: owner.id })
        : [];
    const cause = _latest(ownerEvents, [
        RuntimeEventType.UPDATE_REQUESTED,
        RuntimeEventType.STATE_CHANGED,
    ]);
    const parent = _latest(ownerEvents, [
        RuntimeEventType.UPDATE_COMPLETED,
        RuntimeEventType.UPDATE_STARTED,
        RuntimeEventType.UPDATE_REQUESTED,
    ]);
    const source = _sourceFromStack(error?.stack || entry?.stack);

    return adapter.emit(RuntimeEventType.ERROR, {
        owner,
        source,
        correlation: {
            parentEventId: parent?.id || cause?.id || null,
            causedByEventId: cause?.id || null,
        },
        evidence: {
            level: EvidenceLevel.ATTRIBUTION,
            attribution: source
                ? AttributionQuality.SOURCE_ATTRIBUTED
                : AttributionQuality.FRAMEWORK_REPORTED,
            confidence: source ? 0.95 : 0.9,
        },
        payload: {
            collector: 'error-boundary',
            phase: entry?.phase || 'unknown',
            message: entry?.message || error?.message || 'runtime error',
            errorName: error?.name || null,
        },
    });
}

function recordSlowRender(el, durationMs, { adapter }) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;

    const owner = adapter.ownerOf(el) ?? { id: 'unknown', tag: el.tagName?.toLowerCase() ?? 'unknown' };

    adapter.emit(RuntimeEventType.UPDATE_COMPLETED, {
        owner,
        payload: {
            durationMs,
            source: 'perf-legacy',
        },
    });
}

export { recordLegacyLitError, recordSlowRender };
