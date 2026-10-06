/**
 * AciPlugin — wires Syndigo ACI dispatch into LdsEventTracer.
 *
 * ACI (ui-platform-aci) is Syndigo's Redux-based action bus.
 * This plugin patches el.aci.dispatch so every dispatched action
 * is recorded in __LDS_EVENTS_TIMELINE__ / __LDS_EVENTS_FREQ__.
 *
 * Usage — call from element connectedCallback AFTER ACI is initialised:
 *   import { attachToElement } from 'lit-debug-suite/custom/ui-platform';
 *   connectedCallback() {
 *     super.connectedCallback();
 *     attachToElement(this);
 *   }
 *
 * Do NOT import from the deep file path (e.g. .../AciPlugin.js) — it is not in the exports map.
 */

import { LdsEventTracer } from '../../src/core/event-tracer.js';

let _patchInstalled = false;

/**
 * Attach ACI tracing to a single element instance.
 * Idempotent — safe to call from every element's connectedCallback.
 */
function attachToElement(el) {
    if (!el || !el.aci || typeof el.aci.dispatch !== 'function') return;
    if (el.__ldsAciPatched) return;
    el.__ldsAciPatched = true;

    const tag = el.tagName?.toLowerCase() || 'unknown';

    // Use LdsEventTracer's patchDispatch once per element's aci object.
    // We call the per-element installFn pattern so each element's aci instance
    // gets its dispatch wrapped independently.
    const aciObj = el.aci;
    const origDispatch = aciObj.dispatch.bind(aciObj);

    aciObj.dispatch = function (action) {
        if (window.__LDS_EVENTS_TRACE__) {
            const name = (action && (action.name || action.type)) || 'unknown';
            LdsEventTracer.recordEvent(name, action && action.detail, tag);
        }
        return origDispatch(action);
    };
}

/**
 * Install a page-level patchDispatch hook for any global ACI instance.
 * Call this once if your app exposes a singleton aci object.
 *
 * @param {object} globalAci — the global aci object (must have .dispatch)
 */
function installGlobalAciPatch(globalAci) {
    if (_patchInstalled) return;
    if (!globalAci || typeof globalAci.dispatch !== 'function') return;
    _patchInstalled = true;

    LdsEventTracer.patchDispatch(function (wrapFn) {
        const origDispatch = globalAci.dispatch.bind(globalAci);
        globalAci.dispatch = wrapFn(origDispatch);
    });
}

export { attachToElement, installGlobalAciPatch };
