const EVENT_LABELS = Object.freeze({
    'owner.created': 'component connected',
    'owner.destroyed': 'component disconnected',
    'interaction': 'user interaction',
    'state.changed': 'state change',
    'dependency.triggered': 'dependency trigger',
    'component.update.requested': 'update requested',
    'component.update.started': 'render started',
    'component.update.completed': 'render completed',
    'resource.acquired': 'resource acquired',
    'resource.released': 'resource released',
    'network.started': 'network request started',
    'network.completed': 'network request completed',
    'browser.frame': 'browser frame',
    'navigation': 'navigation',
    'error': 'runtime error',
    'diagnostic': 'diagnostic signal',
});

function _label(type) {
    return EVENT_LABELS[type] || String(type || 'runtime signal').replaceAll('.', ' ');
}

function _sourceText(source) {
    if (!source?.file) return null;
    return `${source.file}${source.line ? `:${source.line}` : ''}`;
}

function _strengthText(rootCause) {
    const strength = rootCause?.strength || 'correlated';
    if (strength === 'confirmed' || strength === 'causality-confirmed') return 'Confirmed';
    if (strength === 'attributed') return 'High confidence';
    if (strength === 'lifetime-violation' || strength === 'retainer-confirmed') return 'Strong evidence';
    return 'Possible';
}

function _eventCounts(events = []) {
    const counts = {};
    for (const event of events) counts[event?.type] = (counts[event?.type] || 0) + 1;
    return counts;
}

function _impactItems(events, triggerEvent) {
    const counts = _eventCounts(events);
    const items = [];
    const durationMs = triggerEvent?.payload?.durationMs;
    if (Number.isFinite(durationMs)) items.push(`${Math.round(durationMs)} ms render`);
    if (counts['component.update.completed']) items.push(`${counts['component.update.completed']} renders`);
    if (counts['state.changed']) items.push(`${counts['state.changed']} state changes`);
    if (counts['network.completed']) items.push(`${counts['network.completed']} network requests`);
    if (counts.error) items.push(`${counts.error} runtime errors`);
    return items.slice(0, 4);
}

function createReadyDeveloperSummary() {
    return Object.freeze({
        status: 'ready',
        headline: 'Runtime Intelligence is ready',
        explanation: 'This is the new layer above the original panel. Existing tabs still show raw diagnostics; Runtime Intelligence correlates Lit updates, errors and related runtime activity into one simple finding when a meaningful problem occurs.',
        problem: null,
        likelyCause: null,
        confidence: null,
        source: null,
        impact: Object.freeze([]),
        nextAction: 'Use the application normally and reproduce a slow UI update or runtime error. You do not need to inspect the evidence objects yourself.',
        technicalEvidence: Object.freeze({ available: false, eventCount: 0 }),
        verification: null,
    });
}

function createDeveloperIntelligenceSummary({ triggerEvent, incident, rootCause, rootEvent, verification = null } = {}) {
    if (!triggerEvent || !incident) return createReadyDeveloperSummary();

    const slow = incident.reason === 'lit-slow-update';
    const ownerName = triggerEvent.owner?.name || 'component';
    const rootLabel = rootCause?.rootLabel || rootEvent?.owner?.name || null;
    const source = _sourceText(rootEvent?.source || triggerEvent.source);
    const impact = _impactItems(incident.events || [], triggerEvent);
    const durationMs = triggerEvent.payload?.durationMs;

    const problem = slow
        ? `${ownerName} rendered slowly${Number.isFinite(durationMs) ? ` (${Math.round(durationMs)} ms)` : ''}`
        : `${ownerName} hit a runtime error${triggerEvent.payload?.message ? `: ${triggerEvent.payload.message}` : ''}`;

    const likelyCause = rootLabel
        ? `${rootLabel} is the strongest related cause found before this problem.`
        : 'The problem was captured, but there is not enough trustworthy evidence yet to name a root cause.';

    const nextAction = source
        ? `Start at ${source}${rootLabel ? ` and inspect ${rootLabel}` : ''}.`
        : slow
            ? 'Inspect the state/update activity immediately before this slow render.'
            : 'Inspect the component error and the updates immediately before it.';

    return Object.freeze({
        status: 'incident-captured',
        headline: slow ? 'Slow UI update detected' : 'Runtime error captured',
        explanation: 'This finding combines the relevant runtime signals for you. The raw evidence remains available only when deeper forensic detail is needed.',
        problem,
        likelyCause,
        confidence: _strengthText(rootCause),
        source,
        impact: Object.freeze(impact),
        nextAction,
        technicalEvidence: Object.freeze({
            available: true,
            eventCount: Array.isArray(incident.events) ? incident.events.length : 0,
            triggerType: _label(triggerEvent.type),
        }),
        verification: verification ? Object.freeze({
            outcome: verification.outcome || null,
            confirmed: verification.confirmed === true,
        }) : null,
    });
}

export { createReadyDeveloperSummary, createDeveloperIntelligenceSummary };
