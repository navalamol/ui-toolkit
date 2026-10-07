// lit-debug-suite — main barrel export

export { LitDebugMixin }       from './LitDebugMixin.js';
export { LdsMemory }           from './core/memory.js';
export { LdsPerfMonitor }      from './core/perf.js';
export { LdsErrorBoundary }    from './core/error-boundary.js';
export { LdsPropAudit }        from './core/prop-audit.js';
export { LdsInspector }        from './core/inspector.js';
export { LdsCycleDetector }    from './core/cycle-detector.js';
export { LdsEventTracer }      from './core/event-tracer.js';
export { LdsSlowApiMonitor }   from './core/slow-api.js';
export { LdsConsole }          from './core/console.js';
export { LdsVitals }           from './core/vitals.js';
export { LdsNetwork }          from './core/network.js';
export { _toolEnabled, _getDebugFlag } from './core/gate.js';
export { FrameworkAdapter }    from './adapter/FrameworkAdapter.js';
export { LitAdapter, litAdapter } from './adapter/lit/LitAdapter.js';
