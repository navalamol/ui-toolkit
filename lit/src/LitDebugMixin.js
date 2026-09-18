/**
 * LitDebugMixin — drop-in debug mixin for any LitElement base class.
 *
 * Usage:
 *   import { LitDebugMixin } from 'lit-debug-suite';
 *   class MyElement extends LitDebugMixin(LitElement) { ... }
 *
 * Or wrap your own base class:
 *   class RufElement extends LitDebugMixin(LitElement) { ... }
 *
 * Activation:
 *   window.__LDS_DEBUG__ = true                         // all tools
 *   window.__LDS_DEBUG__ = { perf: true, network: true } // selective
 *
 * Syndigo-specific plugins (Falcor, ACI, DataObjectManager):
 *   import 'lit-debug-suite/custom/ui-platform';
 */

import { _toolEnabled }      from './core/gate.js';
import { LdsMemory }         from './core/memory.js';
import { LdsPerfMonitor }    from './core/perf.js';
import { LdsErrorBoundary }  from './core/error-boundary.js';
import { LdsPropAudit }      from './core/prop-audit.js';
import { LdsInspector }      from './core/inspector.js';
import { LdsCycleDetector }  from './core/cycle-detector.js';
import { LdsEventTracer }    from './core/event-tracer.js';
import { LdsSlowApiMonitor } from './core/slow-api.js';
import { LdsConsole }        from './core/console.js';
import { LdsVitals }         from './core/vitals.js';
import { LdsNetwork }        from './core/network.js';

// Page-level tools are initialized once per page load
let _pageToolsInited = false;

function _initPageTools() {
    if (_pageToolsInited) return;
    _pageToolsInited = true;
    if (_toolEnabled('vitals'))  LdsVitals.init();
    if (_toolEnabled('network')) LdsNetwork.init();
}

const LitDebugMixin = superclass => class extends superclass {
    connectedCallback() {
        super.connectedCallback?.();

        // Initialize page-level tools on first element mount
        _initPageTools();

        // Always-on tools (zero overhead when data is not used)
        LdsMemory.attach(this);
        LdsErrorBoundary.attach(this);

        // Selectively enabled tools
        if (_toolEnabled('perf'))          LdsPerfMonitor.attach(this);
        if (_toolEnabled('propAudit'))     LdsPropAudit.attach(this);
        if (_toolEnabled('inspector'))     LdsInspector.attach(this);
        if (_toolEnabled('cycleDetector')) LdsCycleDetector.attach(this);
        if (_toolEnabled('eventTracer'))   LdsEventTracer.attach(this);
        if (_toolEnabled('slowApi'))       LdsSlowApiMonitor.attach(this);
        if (_toolEnabled('console'))       LdsConsole.attach(this);
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();

        LdsMemory.detach(this);
        LdsErrorBoundary.detach(this);
        LdsPerfMonitor.detach(this);
        LdsPropAudit.detach(this);
        LdsInspector.detach(this);
        LdsCycleDetector.detach(this);
        LdsEventTracer.detach(this);
        LdsSlowApiMonitor.detach(this);
        LdsConsole.detach(this);
    }
};

export { LitDebugMixin };
