/**
 * SyndigoSlowApiPlugin — patches window.__dataObjectManager__ into LdsSlowApiMonitor.
 *
 * DataObjectManager is Syndigo's REST/Falcor data access singleton.
 * This plugin finds it on window and wraps its key methods so slow calls
 * appear in __LDS_SLOW_API_LOG__.
 *
 * Usage — call once after page load:
 *   import { install } from 'lit-debug-suite/custom/ui-platform/SyndigoSlowApiPlugin.js';
 *   install();
 *
 * Or it is called automatically by custom/ui-platform/index.js.
 */

import { LdsSlowApiMonitor } from '../../src/core/slow-api.js';

const DOM_METHODS = ['get', 'post', 'rest', 'initiateRequest'];
let _installed = false;

/**
 * Attempt to install the patch immediately. If window.__dataObjectManager__
 * is not yet available, retries every 500ms for up to 10 seconds.
 */
function install(methods = DOM_METHODS) {
    if (_installed) return;
    _tryInstall(methods, 0);
}

function _tryInstall(methods, attempts) {
    const dom = window.__dataObjectManager__;
    if (dom && typeof dom === 'object') {
        LdsSlowApiMonitor.wrapObject(dom, methods);
        _installed = true;
        return;
    }
    if (attempts < 20) {
        setTimeout(() => _tryInstall(methods, attempts + 1), 500);
    }
}

export { install };
