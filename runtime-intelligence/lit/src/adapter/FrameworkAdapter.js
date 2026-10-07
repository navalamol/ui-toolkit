/**
 * FrameworkAdapter v2 — neutral framework-to-runtime-intelligence contract.
 *
 * v1 asked every framework to imitate Lit lifecycle methods. v2 inverts that:
 * adapters emit universal evidence events and advertise what they can actually
 * prove. The kernel never asks React/Vue/Angular/Svelte to implement requestUpdate.
 */

import {
    CapabilitySupport,
    FrameworkCapability,
} from '../core/evidence-protocol.js';
import { evidenceStore } from '../core/evidence-store.js';

const _validCapabilitySupport = new Set(Object.values(CapabilitySupport));
const _capabilityRank = Object.freeze({
    [CapabilitySupport.UNSUPPORTED]: 0,
    [CapabilitySupport.INFERRED]: 1,
    [CapabilitySupport.PARTIAL]: 2,
    [CapabilitySupport.FRAMEWORK_REPORTED]: 3,
    [CapabilitySupport.DETERMINISTIC]: 4,
});

class FrameworkAdapter {
    #store;
    #framework;
    #version;
    #adapterVersion;
    #capabilities;

    constructor({
        framework = 'unknown',
        version = null,
        adapterVersion = '2.0',
        capabilities = {},
        store = evidenceStore,
    } = {}) {
        this.#store = store;
        this.#framework = framework;
        this.#version = version;
        this.#adapterVersion = adapterVersion;
        this.#capabilities = Object.freeze(this.#normalizeCapabilities(capabilities));
    }

    get framework() { return this.#framework; }
    get version() { return this.#version; }
    get adapterVersion() { return this.#adapterVersion; }
    get capabilities() { return this.#capabilities; }
    get store() { return this.#store; }

    /**
     * Returns whether this adapter supports a capability. When `minimum` is
     * supplied it is treated as a minimum evidence-support tier, not exact
     * equality. Example: deterministic support satisfies a `partial` minimum.
     */
    supports(capability, minimum = null) {
        const support = this.#capabilities[capability] || CapabilitySupport.UNSUPPORTED;
        if (!minimum) return support !== CapabilitySupport.UNSUPPORTED;
        if (!_validCapabilitySupport.has(minimum)) return false;
        return (_capabilityRank[support] ?? 0) >= (_capabilityRank[minimum] ?? 0);
    }

    capability(capability) {
        return this.#capabilities[capability] || CapabilitySupport.UNSUPPORTED;
    }

    describe() {
        return Object.freeze({
            framework: this.#framework,
            version: this.#version,
            adapterVersion: this.#adapterVersion,
            capabilities: { ...this.#capabilities },
        });
    }

    emit(type, details = {}) {
        return this.#store.emit({
            ...details,
            type,
            framework: {
                name: this.#framework,
                version: this.#version,
                adapterVersion: this.#adapterVersion,
            },
        });
    }

    // Generic adapter surface. Framework implementations decide how these map
    // to their own runtime. No Lit-shaped lifecycle methods live here.
    isManaged(_target) { return false; }
    connect(_target, _options = {}) { return null; }
    disconnect(_target, _options = {}) { return null; }

    #normalizeCapabilities(capabilities) {
        const normalized = {};
        for (const capability of Object.values(FrameworkCapability)) {
            const value = capabilities[capability] || CapabilitySupport.UNSUPPORTED;
            normalized[capability] = _validCapabilitySupport.has(value)
                ? value
                : CapabilitySupport.UNSUPPORTED;
        }
        return normalized;
    }
}

export { FrameworkAdapter };
