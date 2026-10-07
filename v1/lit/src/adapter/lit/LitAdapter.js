/**
 * LitAdapter — FrameworkAdapter implementation for LitElement (Lit 3.x).
 *
 * Implements the framework surface via prototype-level instance patching.
 * All patches are applied lazily in connectedCallback (via LitDebugMixin),
 * so there is no overhead until the element actually mounts.
 *
 * Framework surface used:
 *   el.performUpdate()          — async render cycle entry point
 *   el.requestUpdate(name, old) — synchronous property-triggers-update path
 *   el.updated(changedMap)      — post-render hook
 *   el.updateComplete           — Promise resolved after render
 *   el.constructor.properties   — declared property definitions
 */

import { FrameworkAdapter } from '../FrameworkAdapter.js';

class LitAdapter extends FrameworkAdapter {
    isManaged(el) {
        return (
            typeof el.performUpdate === 'function' &&
            el.updateComplete != null &&
            typeof el.updateComplete.then === 'function'
        );
    }

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
