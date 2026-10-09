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
const _stateChangeInterceptors = new WeakMap(); // LitAdapter instance → interceptor[]
const _renderStacks = new WeakMap();            // LitAdapter instance → { el, ownerId, startEventId }[]

function _getStack(adapter) {
    if (!_renderStacks.has(adapter)) _renderStacks.set(adapter, []);
    return _renderStacks.get(adapter);
}

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

    addStateChangeInterceptor(fn) {
        if (typeof fn !== 'function') throw new TypeError('addStateChangeInterceptor requires a function');
        if (!_stateChangeInterceptors.has(this)) _stateChangeInterceptors.set(this, []);
        const list = _stateChangeInterceptors.get(this);
        list.push(fn);
        return () => {
            const idx = list.indexOf(fn);
            if (idx !== -1) list.splice(idx, 1);
        };
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
        const disconnStack = _renderStacks.get(this);
        if (disconnStack) {
            const idx = disconnStack.findLastIndex ? disconnStack.findLastIndex(e => e.el === el)
                : disconnStack.map(e => e.el).lastIndexOf(el);
            if (idx !== -1) disconnStack.splice(idx, 1);
        }
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

        // Notify interceptors (e.g. PropertyWatchManager) before evidence is emitted so
        // they can capture a fresh call stack at the mutation point.
        if (name != null) {
            const interceptors = _stateChangeInterceptors.get(this);
            if (interceptors?.length) {
                for (const fn of interceptors) {
                    try { fn(el, name, oldValue); } catch { /* never break app */ }
                }
            }
        }

        // Cascade detection: if another component is mid-update and it is a DIFFERENT
        // element, this requestUpdate was triggered reactively — emit DEPENDENCY_TRIGGERED.
        const renderStack = _renderStacks.get(this);
        if (renderStack?.length) {
            const parent = renderStack[renderStack.length - 1];
            if (parent.el !== el) {
                this.emit(RuntimeEventType.DEPENDENCY_TRIGGERED, {
                    owner,
                    correlation: { causedByEventId: parent.startEventId },
                    evidence: {
                        level: EvidenceLevel.ATTRIBUTION,
                        attribution: AttributionQuality.FRAMEWORK_REPORTED,
                        confidence: 0.85,
                    },
                    payload: {
                        triggerProperty: name ?? null,
                        triggerSource: 'reactive-cascade',
                        triggeringOwnerId: parent.ownerId,
                    },
                });
            }
        }

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
        // Push onto render stack so child requestUpdate calls can detect cascade
        _getStack(this).push({ el, ownerId: owner.id, startEventId: event.id });
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
        // Pop from render stack
        const stack = _renderStacks.get(this);
        if (stack) {
            const idx = stack.findLastIndex ? stack.findLastIndex(e => e.el === el)
                : stack.map(e => e.el).lastIndexOf(el);
            if (idx !== -1) stack.splice(idx, 1);
        }
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
