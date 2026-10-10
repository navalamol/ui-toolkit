import { EvidenceGraph } from '../../core/evidence-graph.js';
import { RootCauseGrouper } from '../../core/root-cause.js';
import { IncidentFlightRecorder } from '../../core/incident-flight-recorder.js';
import { createEvidenceCapsule } from '../../core/evidence-capsule.js';
import { RuntimeEventType } from '../../core/evidence-protocol.js';
import { evidenceStore } from '../../core/evidence-store.js';
import { installLitIntelligencePanelPresentation } from './panel-intelligence-presentation.js';
import { _toolEnabled } from '../../core/gate.js';
import { PropertyWatchManager } from './property-watch-manager.js';
import { litAdapter } from '../../adapter/lit/LitAdapter.js';
import { CascadeAnalyzer } from '../../core/cascade-analyzer.js';
import { NavigationBridge } from './navigation-bridge.js';
import { NetworkStateCorrelator } from './network-state-correlator.js';
import { UpdateBudgetMonitor } from '../../core/update-budget-monitor.js';
import { BackgroundSessionStore } from '../../core/background-session-store.js';
import { FalcorCallGraph } from '../../core/falcor-call-graph.js';
import { SequentialApiDetector } from '../../core/sequential-api-detector.js';
import { LdsNetwork } from '../../core/network.js';
import { DomDuplicationAdvisor } from '../../core/dom-duplication-advisor.js';
import { VirtualizationAdvisor } from '../../core/virtualization-advisor.js';
import { PaintAdvisor } from '../../core/paint-advisor.js';
import { WorkerOpportunityAdvisor } from '../../core/worker-opportunity-advisor.js';
import { IdleSchedulingAdvisor } from '../../core/idle-scheduling-advisor.js';
import { installLitOpportunitiesPanelPresentation } from './panel-opportunities-presentation.js';
import {
    createReadyDeveloperSummary,
    createDeveloperIntelligenceSummary,
} from './developer-intelligence-summary.js';

const DEFAULT_SLOW_UPDATE_THRESHOLD_MS = 500;
const MAX_CAUSAL_CHAIN_REFERENCES = 20;

function _eventRef(event) {
    return event ? Object.freeze({
        id: event.id,
        type: event.type,
        sequence: event.sequence,
        ownerId: event.owner?.id || null,
        evidenceLevel: event.evidence?.level || null,
    }) : null;
}

function _portableClone(value, memo = new WeakMap(), stack = new WeakSet()) {
    if (value === null || typeof value !== 'object') return value;
    if (stack.has(value)) return '[Circular]';
    if (memo.has(value)) return memo.get(value);

    const out = Array.isArray(value) ? [] : {};
    memo.set(value, out);
    stack.add(value);
    for (const [key, child] of Object.entries(value)) {
        out[key] = _portableClone(child, memo, stack);
    }
    stack.delete(value);
    return out;
}

function _freezePresentation(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    for (const child of Object.values(value)) _freezePresentation(child, seen);
    return Object.freeze(value);
}

function _incidentReasonFor(event, slowUpdateThresholdMs) {
    if (event?.type === RuntimeEventType.ERROR) return 'lit-runtime-error';
    if (event?.type !== RuntimeEventType.UPDATE_COMPLETED) return null;
    const durationMs = event.payload?.durationMs;
    return Number.isFinite(durationMs) && durationMs >= slowUpdateThresholdMs
        ? 'lit-slow-update'
        : null;
}

class LitIntelligencePipeline {
    #store;
    #windowTarget;
    #recorder;
    #grouper;
    #cascadeAnalyzer;
    #watchManager;
    #navBridge;
    #networkCorrelator;
    #budgetMonitor;
    #backgroundStore         = null;
    #falcorCallGraph         = null;
    #sequentialDetector      = null;
    #domDuplicationAdvisor   = null;
    #virtualizationAdvisor   = null;
    #paintAdvisor            = null;
    #workerAdvisor           = null;
    #idleAdvisor             = null;
    #cascadeDebounce         = null;
    #unsubscribe = null;
    #latest = null;
    #latestCapsule = null;
    #latestCascade = null;
    #analysisContext = null;
    #capsuleSequence = 0;
    #transientIncidentSequence = 0;
    #slowUpdateThresholdMs;
    #presentInPanel;

    constructor({
        store = evidenceStore,
        windowTarget = typeof window !== 'undefined' ? window : null,
        recorderOptions = {},
        rootCauseOptions = {},
        slowUpdateThresholdMs = DEFAULT_SLOW_UPDATE_THRESHOLD_MS,
        presentInPanel = true,
        adapter = litAdapter,
    } = {}) {
        if (!store || typeof store.subscribe !== 'function' || typeof store.snapshot !== 'function') {
            throw new TypeError('LitIntelligencePipeline requires an EvidenceStore-compatible store.');
        }
        if (!Number.isFinite(slowUpdateThresholdMs) || slowUpdateThresholdMs < 0) {
            throw new TypeError('slowUpdateThresholdMs must be a finite non-negative number.');
        }
        this.#store = store;
        this.#windowTarget = windowTarget;
        this.#slowUpdateThresholdMs = slowUpdateThresholdMs;
        this.#presentInPanel = presentInPanel;
        this.#grouper = new RootCauseGrouper(rootCauseOptions);
        this.#cascadeAnalyzer = new CascadeAnalyzer();
        if (windowTarget) {
            this.#navBridge = new NavigationBridge({ store, windowTarget });
        }
        this.#networkCorrelator = new NetworkStateCorrelator({ store });
        this.#budgetMonitor = new UpdateBudgetMonitor({ store });
        if (_toolEnabled('monitorBackground')) {
            this.#backgroundStore = new BackgroundSessionStore();
        }
        if (_toolEnabled('falcorView')) {
            this.#falcorCallGraph = new FalcorCallGraph({ network: LdsNetwork });
        }
        // Sequential detector emits via onOpportunity callback (store-independent)
        this.#sequentialDetector = new SequentialApiDetector({
            network: LdsNetwork,
            onOpportunity: () => this.#dispatchPanelUpdate(),
        });
        this.#domDuplicationAdvisor = new DomDuplicationAdvisor({ store, windowTarget });
        this.#virtualizationAdvisor = new VirtualizationAdvisor({ store, windowTarget });
        this.#paintAdvisor = new PaintAdvisor({ store, windowTarget });
        this.#workerAdvisor = new WorkerOpportunityAdvisor({ store, windowTarget });
        this.#idleAdvisor = new IdleSchedulingAdvisor({ store });
        installLitOpportunitiesPanelPresentation({ target: windowTarget });
        this.#recorder = new IncidentFlightRecorder({
            store,
            start: false,
            // Errors are the hard freeze trigger. Slow updates are analyzed from
            // the rolling recorder snapshot so they cannot hide a later crash.
            autoFreeze: event => event?.type === RuntimeEventType.ERROR
                ? { reason: 'lit-runtime-error', postTriggerEvents: 0 }
                : false,
            ...recorderOptions,
        });
        if (adapter && typeof adapter.addStateChangeInterceptor === 'function') {
            this.#watchManager = new PropertyWatchManager({ adapter, store });
        }
    }

    start() {
        if (this.#unsubscribe) return this;
        this.#recorder.start();
        this.#unsubscribe = this.#store.subscribe(event => this.#onEvidence(event));
        this.#latest = createReadyDeveloperSummary();
        this.#watchManager?.start();
        this.#navBridge?.start();
        this.#networkCorrelator?.start();
        this.#budgetMonitor?.start();
        this.#falcorCallGraph?.start();
        this.#sequentialDetector?.start();
        this.#domDuplicationAdvisor?.start();
        this.#virtualizationAdvisor?.start();
        this.#paintAdvisor?.start();
        this.#workerAdvisor?.start();
        this.#idleAdvisor?.start();
        if (this.#windowTarget) {
            this.#windowTarget.__LDS_INTELLIGENCE_PIPELINE__ = this;
            if (this.#falcorCallGraph) {
                this.#windowTarget.__LDS_FALCOR_CALL_GRAPH__ = this.#falcorCallGraph;
            }
            if (this.#sequentialDetector) {
                this.#windowTarget.__LDS_SEQUENTIAL_API_DETECTOR__ = this.#sequentialDetector;
            }
            this.#windowTarget.__LDS_EXPORT_SESSION_REPORT__ = () => this.exportSessionReport();
            if (_toolEnabled('intelligence')) {
                if (this.#presentInPanel) {
                    installLitIntelligencePanelPresentation({ target: this.#windowTarget });
                }
                if (this.#watchManager) {
                    this.#windowTarget.__LDS_WATCH_PROPERTY__ =
                        (tag, prop, opts) => this.#watchManager.watch(tag, prop, opts);
                    this.#windowTarget.__LDS_UNWATCH_PROPERTY__ =
                        (tag, prop) => this.#watchManager.unwatch(tag, prop);
                }
            }
        }
        this.#publish();
        return this;
    }

    stop() {
        if (this.#unsubscribe) this.#unsubscribe();
        this.#unsubscribe = null;
        this.#recorder.stop();
        this.#watchManager?.stop();
        this.#navBridge?.stop();
        this.#networkCorrelator?.stop();
        this.#budgetMonitor?.stop();
        this.#falcorCallGraph?.stop();
        this.#sequentialDetector?.stop();
        this.#domDuplicationAdvisor?.stop();
        this.#virtualizationAdvisor?.stop();
        this.#paintAdvisor?.stop();
        this.#workerAdvisor?.stop();
        this.#idleAdvisor?.stop();
        clearTimeout(this.#cascadeDebounce);
        return this;
    }

    snapshot() {
        return this.#latest;
    }

    watchManager() {
        return this.#watchManager ?? null;
    }

    cascadeReport() {
        return this.#latestCascade;
    }

    navigationBridge() {
        return this.#navBridge ?? null;
    }

    networkCorrelator() {
        return this.#networkCorrelator ?? null;
    }

    budgetMonitor() {
        return this.#budgetMonitor ?? null;
    }

    falcorCallGraph() {
        return this.#falcorCallGraph ?? null;
    }

    sequentialApiDetector() {
        return this.#sequentialDetector ?? null;
    }

    backgroundHistory() {
        return this.#backgroundStore?.load() ?? [];
    }

    domDuplicationAdvisor() { return this.#domDuplicationAdvisor ?? null; }
    virtualizationAdvisor() { return this.#virtualizationAdvisor ?? null; }
    paintAdvisor() { return this.#paintAdvisor ?? null; }
    workerOpportunityAdvisor() { return this.#workerAdvisor ?? null; }
    idleSchedulingAdvisor() { return this.#idleAdvisor ?? null; }

    exportSessionReport() {
        const entries = this.backgroundHistory();
        if (!entries.length) return '<p style="font:14px monospace;padding:20px">No background history recorded. Set window.__LDS_MONITOR_BACKGROUND__ = true to enable.</p>';
        const rows = entries.map(e => {
            const cascade = e.cascadeSummary
                ? `${e.cascadeSummary.triggerCount} triggers · depth ${e.cascadeSummary.depth} · ${e.cascadeSummary.totalUpdateMs.toFixed(1)}ms`
                : '—';
            return `<tr>
                <td>${new Date(e.timestamp).toLocaleTimeString()}</td>
                <td title="${e.pageUrl}">${e.pageUrl.split('/').pop() || '/'}</td>
                <td>${e.title}</td>
                <td>${e.rootLabel}${e.strength ? ` (${e.strength})` : ''}</td>
                <td>${cascade}</td>
                <td>${e.networkCorrelationCount}</td>
                <td>${e.budgetViolationCount}</td>
            </tr>`;
        }).join('');
        return `<!doctype html><html><head><meta charset="utf-8">
            <title>LDS Session Report — ${new Date().toLocaleString()}</title>
            <style>body{font:14px monospace;padding:20px;background:#1e1e2e;color:#cdd6f4}
            table{border-collapse:collapse;width:100%}
            th,td{border:1px solid #313244;padding:6px 10px;text-align:left}
            th{background:#181825;color:#89b4fa}</style>
            </head><body>
            <h2 style="color:#89b4fa">LDS Session Report — ${new Date().toLocaleString()}</h2>
            <table><thead><tr>
                <th>Time</th><th>Page</th><th>Finding</th><th>Root Cause</th>
                <th>Cascade</th><th>Net Corr.</th><th>Budget Viol.</th>
            </tr></thead><tbody>${rows}</tbody></table>
            </body></html>`;
    }

    /**
     * Full forensic evidence stays behind an explicit API rather than living in
     * the default developer-facing window object/panel model.
     */
    exportCapsule() {
        return this.#latestCapsule;
    }

    recorder() {
        return this.#recorder;
    }

    resume({ clear = true } = {}) {
        this.#recorder.resume({ clear });
        this.#analysisContext = null;
        this.#latestCapsule = null;
        this.#latestCascade = null;
        this.#latest = createReadyDeveloperSummary();
        this.#publish();
        return this;
    }

    recordVerification(verification) {
        if (!this.#analysisContext || !verification) return null;
        const verificationSnapshot = _portableClone(verification);
        this.#latestCapsule = this.#buildCapsule({
            ...this.#analysisContext,
            verification: verificationSnapshot,
        });
        this.#analysisContext = { ...this.#analysisContext, verification: verificationSnapshot };
        this.#latest = _freezePresentation(createDeveloperIntelligenceSummary({
            ...this.#analysisContext,
            verification: verificationSnapshot,
        }));
        this.#publish();
        return this.#latest;
    }

    #onEvidence(event) {
        // Mission 11D fix A: DIAGNOSTIC events from network-state-correlator and
        // update-budget-monitor write directly to the store. Dispatch a panel
        // refresh so sections that read the live store update immediately.
        if (event.type === RuntimeEventType.DIAGNOSTIC) {
            const p = event.payload;
            if (p?.networkCorrelation || p?.budgetViolation) {
                this.#dispatchPanelUpdate();
                return;
            }
            if (p?.domDuplication) { this.#dispatchPanelUpdate(); return; }
            if (p?.virtualizationOpportunity) { this.#dispatchPanelUpdate(); return; }
            if (p?.paintTiming || p?.expensivePaint) { this.#dispatchPanelUpdate(); return; }
            if (p?.workerOpportunity) { this.#dispatchPanelUpdate(); return; }
            if (p?.idleOpportunity) { this.#dispatchPanelUpdate(); return; }
        }

        // Mission 11D fix B: debounced cascade refresh — keep the cascade
        // display current even when no error or slow render is active.
        if (event.type === RuntimeEventType.DEPENDENCY_TRIGGERED) {
            clearTimeout(this.#cascadeDebounce);
            this.#cascadeDebounce = setTimeout(() => {
                if (this.#recorder.incident()) return; // frozen crash takes priority
                const buf = this.#recorder.snapshot();
                if (buf.length > 0) {
                    this.#analyze(event, this.#snapshotRollingIncident(event, 'cascade_refresh'));
                }
            }, 300);
            return;
        }

        const reason = _incidentReasonFor(event, this.#slowUpdateThresholdMs);
        if (!reason) return;

        if (reason === 'lit-runtime-error') {
            const incident = this.#recorder.incident();
            if (!incident || incident.reason !== reason) return;
            this.#analyze(event, incident);
            return;
        }

        // Preserve any previously frozen crash as the stronger incident.
        if (this.#recorder.incident()) return;
        this.#analyze(event, this.#snapshotRollingIncident(event, reason));
    }

    #snapshotRollingIncident(triggerEvent, reason) {
        const events = this.#recorder.snapshot();
        const ordered = [...events].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
        return Object.freeze({
            id: `transient-lit-incident-${++this.#transientIncidentSequence}`,
            reason,
            triggerEventId: triggerEvent.id,
            triggerSequence: triggerEvent.sequence,
            frozenAt: Date.now(),
            eventCount: ordered.length,
            firstSequence: ordered[0]?.sequence ?? null,
            lastSequence: ordered.at(-1)?.sequence ?? null,
            firstTimestamp: ordered[0]?.timestamp ?? null,
            lastTimestamp: ordered.at(-1)?.timestamp ?? null,
            events: Object.freeze(ordered),
        });
    }

    #analyze(triggerEvent, incident) {
        const graph = new EvidenceGraph(incident.events);
        const clusters = this.#grouper.group(graph);
        const rootCause = clusters.find(cluster => cluster.eventIds.includes(triggerEvent.id)) || clusters[0] || null;
        const rootEvent = rootCause?.rootEventId ? graph.node(rootCause.rootEventId) : null;
        const causalChain = rootCause
            ? rootCause.eventIds
                .slice(-MAX_CAUSAL_CHAIN_REFERENCES)
                .map(id => _eventRef(graph.node(id)))
                .filter(Boolean)
            : [_eventRef(triggerEvent)].filter(Boolean);
        const cascade = this.#cascadeAnalyzer.analyze(graph);
        this.#latestCascade = cascade ? { ...cascade, capturedAt: Date.now() } : cascade;
        const context = {
            triggerEvent,
            incident,
            rootCause,
            rootEvent,
            causalChain,
            cascade,
            verification: null,
        };
        this.#analysisContext = context;
        this.#latestCapsule = this.#buildCapsule(context);
        this.#latest = _freezePresentation(createDeveloperIntelligenceSummary(context));
        this.#publish();
    }

    #buildCapsule({ triggerEvent, incident, rootCause, rootEvent, causalChain, cascade, verification }) {
        const slowUpdate = incident.reason === 'lit-slow-update';
        return createEvidenceCapsule({
            id: `lit-capsule-${++this.#capsuleSequence}-${triggerEvent.id}`,
            problem: {
                title: slowUpdate ? 'Lit slow update' : 'Lit runtime error',
                summary: slowUpdate
                    ? `Lit component update took ${Math.round(triggerEvent.payload?.durationMs || 0)}ms`
                    : triggerEvent.payload?.message || 'Lit component runtime error',
                type: triggerEvent.type,
            },
            trigger: {
                eventId: triggerEvent.id,
                sequence: triggerEvent.sequence,
                reason: incident.reason,
            },
            owner: triggerEvent.owner,
            source: rootEvent?.source || triggerEvent.source,
            incident,
            rootCause,
            causalChain,
            recommendation: rootCause ? {
                summary: `Inspect ${rootCause.rootLabel} and preserve the recorded evidence strength (${rootCause.strength}).`,
            } : {
                summary: slowUpdate
                    ? 'Inspect the attributed Lit update and its preceding state/update evidence.'
                    : 'Inspect the attributed component error and surrounding UREP evidence.',
            },
            verification,
            environment: {
                framework: 'lit',
                presentationSurface: 'lds-debug-panel:pinpoint',
                ...(slowUpdate ? { slowUpdateThresholdMs: this.#slowUpdateThresholdMs } : {}),
                ...(cascade ? { cascade } : {}),
            },
        });
    }

    #dispatchPanelUpdate() {
        if (!this.#windowTarget) return;
        this.#windowTarget.__LDS_CASCADE_REPORT__ = this.#latestCascade;
        const EventCtor = this.#windowTarget.CustomEvent;
        if (typeof this.#windowTarget.dispatchEvent === 'function' && typeof EventCtor === 'function') {
            this.#windowTarget.dispatchEvent(new EventCtor('lds-intelligence-updated', {
                detail: this.#latest,
            }));
        }
    }

    #publish() {
        if (!this.#windowTarget) return;
        // This global is intentionally a compact developer view. Heavy forensic
        // evidence is available only through __LDS_INTELLIGENCE_PIPELINE__.exportCapsule().
        this.#windowTarget.__LDS_INTELLIGENCE__ = this.#latest;
        this.#dispatchPanelUpdate();

        // Mission 11C: persist compact finding to localStorage when MonitorInBackground is active
        if (this.#backgroundStore && this.#latest?.problem) {
            const diags = this.#store.snapshot({ type: 'diagnostic' });
            this.#backgroundStore.push({
                pageUrl: this.#windowTarget.location?.href ?? '',
                timestamp: Date.now(),
                title: this.#latest.problem ?? 'No finding',
                rootLabel: this.#latest.rootCause?.rootLabel ?? '',
                strength: this.#latest.rootCause?.strength ?? '',
                cascadeSummary: this.#latestCascade?.hasCascade ? {
                    triggerCount:  this.#latestCascade.triggerCount,
                    componentCount: this.#latestCascade.componentCount,
                    depth:         this.#latestCascade.depth,
                    totalUpdateMs: this.#latestCascade.totalUpdateMs,
                } : null,
                networkCorrelationCount: diags.filter(d => d.payload?.networkCorrelation).length,
                budgetViolationCount:    diags.filter(d => d.payload?.budgetViolation).length,
            });
        }
    }
}

let _defaultPipeline = null;
function getLitIntelligencePipeline() {
    if (!_defaultPipeline) _defaultPipeline = new LitIntelligencePipeline();
    return _defaultPipeline;
}

export { DEFAULT_SLOW_UPDATE_THRESHOLD_MS, LitIntelligencePipeline, getLitIntelligencePipeline };
