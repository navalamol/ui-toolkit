/**
 * FrameworkAdapter — interface contract for framework-specific lifecycle integration.
 *
 * Each framework implementation (Lit, React, Angular) provides:
 *
 *   wrapRenderCycle(el, onBefore, onAfter)
 *     Wraps the element's render cycle. onBefore(el) fires before render starts,
 *     onAfter(el) fires after it completes (even if it throws).
 *     Used by: error-boundary, cycle-detector.
 *
 *   hookRequestUpdate(el, fn)
 *     Intercepts the "schedule a re-render" path. fn(el, name, oldValue) is called
 *     synchronously when a property change triggers a re-render request.
 *     Used by: prop-audit (R2-A render reasons + R2-B thrash), cycle-detector.
 *
 *   hookAfterRender(el, fn)
 *     Called after every render completes. fn(el, changedProps) receives the map of
 *     changed properties (framework-specific shape).
 *     Used by: prop-audit (console logging).
 *
 *   renderCompletePromise(el)
 *     Returns a Promise that resolves when the element's current render cycle is done.
 *     Used by: perf TTI measurement.
 *
 *   getDeclaredProps(el)
 *     Returns an object map of declared property names to their configuration.
 *     Used by: inspector snapshot.
 *
 *   isManaged(el)
 *     Returns true if this adapter can handle the given element instance.
 *
 * To add React support: implement ReactAdapter extends FrameworkAdapter,
 * using hooks (useEffect, useRef) instead of prototype patching.
 * To add Angular support: implement AngularAdapter using ngOnChanges etc.
 */

class FrameworkAdapter {
    wrapRenderCycle(el, onBefore, onAfter) {
        throw new Error('FrameworkAdapter.wrapRenderCycle not implemented');
    }

    hookRequestUpdate(el, fn) {
        throw new Error('FrameworkAdapter.hookRequestUpdate not implemented');
    }

    hookAfterRender(el, fn) {
        throw new Error('FrameworkAdapter.hookAfterRender not implemented');
    }

    renderCompletePromise(el) {
        throw new Error('FrameworkAdapter.renderCompletePromise not implemented');
    }

    getDeclaredProps(el) {
        throw new Error('FrameworkAdapter.getDeclaredProps not implemented');
    }

    isManaged(el) {
        return false;
    }
}

export { FrameworkAdapter };
