/**
 * LitAdapter v2 — Lit 3 semantic adapter for the Universal Runtime Evidence Protocol.
 *
 * The adapter emits framework-neutral evidence while keeping the old Lit helper
 * methods as compatibility shims. New core intelligence must consume evidence,
 * not call requestUpdate/performUpdate-shaped APIs.
 */

import { FrameworkAdapter } from '../FrameworkAdapter.js';
import {
    AttributionQuality,
    CapabilitySupport,
    EvidenceLevel,
    FrameworkCapability,
    RuntimeEventType,
    summarizeRuntimeValue,
} from '../../core/evidence-protocol.js';

let _instanceSequence = 0;
const _owners = new WeakMap();
const _physicalInstances = new WeakMap();
const _lifecycleGenerations = new WeakMap();
const _pendingUpdateEvents = new WeakMap();
const _updateStarts = new WeakMap();

function _tag(el) {
    return el?.localName || el?.tagName?.toLowerCase?.() || el?.constructor?.name || 'lit-component';
}

class LitAdapter extends FrameworkAdapter {
    constructor(options = {}) {
        super({
            ...options,
            framework: 'lit',
            adapterVersion: '2.1',
            capabilities: {
                [FrameworkCapability.OWNER_LIFECYCLE]: CapabilitySupport.DETERMINISTIC,
                [FrameworkCapability.UPDATE_LIFECYCLE]: CapabilitySupport.DETERMINISTIC,
                [FrameworkCapability.UPDATE_CAUSE]: CapabilitySupport.FRAMEWORK_REPORTED,
                [FrameworkCapability.STATE_CHANGE]: CapabilitySupport.FRAMEWORK_REPORTED,
                [FrameworkCapability.RENDER_TIMING]: CapabilitySupport.DETERMINISTIC,
                [FrameworkCapability.SOURCE_LOCATION]: CapabilitySupport.PARTIAL,
                [FrameworkCapability.REACTIVE_DEPENDENCY]: CapabilitySupport.PARTIAL,
                [FrameworkCapability.RESOURCE_OWNERSHIP]: CapabilitySupport.PARTIAL,
                [FrameworkCapability.EFFECT_LIFECYCLE]: CapabilitySupport.UNSUPPORTED,
                ...(options.capabilities || {}),
            },
        });
    }

    isManaged(el) {
        return !!el && typeof el.requestUpdate === 'function' && typeof el.performUpdate === 'function';
    }

    connect(el, { source = null, parentId = null } = {}) {
        if (!this.isManaged(el)) return null;
        const existing = _owners.get(el);
        if (existing?.connected) return existing;

        let instanceId = _physicalInstances.get(el);
        if (!instanceId) {
            instanceId = ++_instanceSequence;
            _physicalInstances.set(el, instanceId);
        }

        const lifecycleGeneration = (_lifecycleGenerations.get(el) || 0) + 1;
        _lifecycleGenerations.set(el, lifecycleGeneration);

        const owner = {
            id: `lit-${instanceId}-life-${lifecycleGeneration}`,
            instanceId,
            lifecycleGeneration,
            kind: 'component',
            name: _tag(el),
            parentId,
            connected: true,
            source,
        };
        _owners.set(el, owner);
        this.emit(RuntimeEventType.OWNER_CREATED, {
            owner,
            source,
            evidence: {
                level: EvidenceLevel.OBSERVATION,
                attribution: AttributionQuality.DETERMINISTIC,
                confidence: 1,
            },
            payload: { lifecycle: 'connected' },
        });
        return owner;
    }

    disconnect(el, { source = null } = {}) {
        const owner = _owners.get(el);
        if (!owner?.connected) return null;
        owner.connected = false;
        _pendingUpdateEvents.delete(el);
        _updateStarts.delete(el);
        return this.emit(RuntimeEventType.OWNER_DESTROYED, {
            owner,
            source: source || owner.source,
            evidence: {
                level: EvidenceLevel.OBSERVATION,
                attribution: AttributionQuality.DETERMINISTIC,
                confidence: 1,
            },
            payload: { lifecycle: 'disconnected' },
        });
    }

    /**
     * Lit calls requestUpdate(name, oldValue) after the reactive property has
     * already changed. Preserve that causal direction in evidence:
     * state.changed -> component.update.requested -> started -> completed.
     */
    recordUpdateRequested(el, name, oldValue, { source = null } = {}) {
        const owner = _owners.get(el);
        if (!owner?.connected) return null;
        const newValue = name == null ? undefined : el[name];

        let stateEvent = null;
        if (name != null) {
            stateEvent = this.emit(RuntimeEventType.STATE_CHANGED, {
                owner,
                source,
                evidence: {
                    level: EvidenceLevel.ATTRIBUTION,
                    attribution: AttributionQuality.FRAMEWORK_REPORTED,
                    confidence: 0.95,
                },
                payload: {
                    property: String(name),
                    oldValue: summarizeRuntimeValue(oldValue),
                    newValue: summarizeRuntimeValue(newValue),
                },
            });
        }

        const updateEvent = this.emit(RuntimeEventType.UPDATE_REQUESTED, {
            owner,
            source,
            correlation: stateEvent ? {
                parentEventId: stateEvent.id,
                causedByEventId: stateEvent.id,
            } : undefined,
            evidence: {
                level: name == null ? EvidenceLevel.OBSERVATION : EvidenceLevel.ATTRIBUTION,
                attribution: name == null ? AttributionQuality.UNKNOWN : AttributionQuality.FRAMEWORK_REPORTED,
                confidence: name == null ? 0.5 : 0.95,
            },
            payload: name == null ? { reason: 'unspecified' } : {
                reason: 'reactive-property',
                property: String(name),
                oldValue: summarizeRuntimeValue(oldValue),
                newValue: summarizeRuntimeValue(newValue),
                sameReference: oldValue === newValue && oldValue != null && typeof oldValue === 'object',
            },
        });
        _pendingUpdateEvents.set(el, updateEvent.id);
        return updateEvent;
    }

    recordUpdateStarted(el, { source = null } = {}) {
        const owner = _owners.get(el);
        if (!owner?.connected) return null;
        const requestEventId = _pendingUpdateEvents.get(el) || null;
        const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const event = this.emit(RuntimeEventType.UPDATE_STARTED, {
            owner,
            source,
            correlation: {
                parentEventId: requestEventId,
                causedByEventId: requestEventId,
            },
            evidence: {
                level: EvidenceLevel.OBSERVATION,
                attribution: AttributionQuality.DETERMINISTIC,
                confidence: 1,
            },
            payload: {},
        });
        _updateStarts.set(el, { startedAt, eventId: event.id });
        return event;
    }

    recordUpdateCompleted(el, { source = null } = {}) {
        const owner = _owners.get(el);
        if (!owner?.connected) return null;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const start = _updateStarts.get(el);
        const requestEventId = _pendingUpdateEvents.get(el) || null;
        const durationMs = Number.isFinite(start?.startedAt) ? Math.max(0, now - start.startedAt) : null;
        const event = this.emit(RuntimeEventType.UPDATE_COMPLETED, {
            owner,
            source,
            correlation: {
                parentEventId: start?.eventId || requestEventId,
                causedByEventId: requestEventId,
            },
            evidence: {
                level: EvidenceLevel.OBSERVATION,
                attribution: AttributionQuality.DETERMINISTIC,
                confidence: 1,
            },
            payload: { durationMs },
        });
        _updateStarts.delete(el);
        _pendingUpdateEvents.delete(el);
        return event;
    }

    ownerOf(el) {
        return _owners.get(el) || null;
    }

    // ----- v1 Lit compatibility surface -----
    // Retained temporarily so existing integrations do not break. These methods
    // are NOT part of the v2 framework-neutral contract.
    wrapRenderCycle(el, onBefore, onAfter) {
        if (typeof el.performUpdate !== 'function') return;
        const orig = el.performUpdate.bind(el);
        el.performUpdate = async function (...args) {
            onBefore(el);
            try {
                return await orig(...args);
            } finally {
                onAfter(el);
            }
        };
    }

    hookRequestUpdate(el, fn) {
        if (typeof el.requestUpdate !== 'function') return;
        const orig = el.requestUpdate.bind(el);
        el.requestUpdate = function (name, oldValue) {
            fn(el, name, oldValue);
            return orig(name, oldValue);
        };
    }

    hookAfterRender(el, fn) {
        if (typeof el.updated !== 'function') return;
        const orig = el.updated.bind(el);
        el.updated = function (changedProps) {
            orig(changedProps);
            fn(el, changedProps);
        };
    }

    renderCompletePromise(el) {
        return el.updateComplete ?? null;
    }

    getDeclaredProps(el) {
        return el.constructor.properties || {};
    }
}

const litAdapter = new LitAdapter();
export { LitAdapter, litAdapter };
