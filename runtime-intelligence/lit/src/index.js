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
export { ReactAdapter, reactAdapter } from './adapter/react/ReactAdapter.js';
export { EvidenceStore, evidenceStore } from './core/evidence-store.js';
export { EdgeRelation, EvidenceGraph } from './core/evidence-graph.js';
export { RootCauseGrouper } from './core/root-cause.js';
export { SourceResolutionBasis, SourceResolver, parseRuntimeSourceLocation, sanitizeSourceFile } from './core/source-resolver.js';
export { RecorderState, IncidentFlightRecorder } from './core/incident-flight-recorder.js';
export {
    WORKFLOW_SCHEMA_VERSION,
    MetricDirection,
    VerificationOutcome,
    createWorkflowRun,
    createWorkflowBaseline,
    compareWorkflowRuns,
    verifyFix,
} from './core/workflow-verification.js';
export {
    EVIDENCE_CAPSULE_SCHEMA_VERSION,
    createEvidenceCapsule,
    buildEvidenceCapsuleAIPrompt,
} from './core/evidence-capsule.js';
export {
    RESOURCE_LEDGER_SCHEMA_VERSION,
    ResourceStatus,
    ResourceFindingKind,
    RuntimeResourceKind,
    RuntimeResourceOwnershipLedger,
} from './core/resource-ownership-ledger.js';
export {
    PRIVACY_POLICY_VERSION,
    PrivacyAction,
    ENTERPRISE_SAFE_PRIVACY_POLICY,
    createPrivacyPolicy,
    maskUrlQuery,
    sanitizeHeaders,
    applyPrivacyPolicyToEvidenceInput,
    sanitizeForExport,
    sanitizeForExportWithAudit,
} from './core/enterprise-privacy.js';
export {
    POLICY_ENGINE_SCHEMA_VERSION,
    RuleKind,
    BudgetOperator,
    Severity,
    RuleEvaluationStatus,
    createBudgetRule,
    createSuppression,
    createEventCountMetrics,
    evaluateBudgetRule,
    DiagnosticPolicyEngine,
} from './core/diagnostic-policy.js';
export {
    SCHEMA_VERSION as EVIDENCE_SCHEMA_VERSION,
    EvidenceLevel,
    AttributionQuality,
    CapabilitySupport,
    FrameworkCapability,
    RuntimeEventType,
    RuntimeValueCapture,
    summarizeRuntimeValue,
    createEvidenceEvent,
    validateEvidenceEvent,
} from './core/evidence-protocol.js';
