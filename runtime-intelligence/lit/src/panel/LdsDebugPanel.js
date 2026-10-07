/**
 * LdsDebugPanel — floating debug panel for any LitElement app.
 * Ported from ruf-debug-panel.js. All __RUF_* → __LDS_*, ACI tab → Events tab.
 * Network entries use `decoded` field (set by registered decoder plugin).
 */

import { LitElement, html, css } from 'lit';

// ── Session ID ─────────────────────────────────────────────────────────────
if (typeof window !== 'undefined' && !window.__LDS_SESSION_ID__) {
    window.__LDS_SESSION_ID__ = `lds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
if (typeof window !== 'undefined' && !window.__LDS_HISTORY__) {
    window.__LDS_HISTORY__ = [];
}

// ── Utilities ──────────────────────────────────────────────────────────────
function _parseBrowserInfo() {
    const ua = navigator.userAgent;
    const edge   = ua.match(/Edg\/([\d.]+)/);
    const chrome = ua.match(/Chrome\/([\d.]+)/);
    const ff     = ua.match(/Firefox\/([\d.]+)/);
    const safari = !chrome && ua.match(/Version\/([\d.]+).*Safari/);
    if (edge)   return `Edge ${edge[1]}`;
    if (chrome) return `Chrome ${chrome[1]}`;
    if (ff)     return `Firefox ${ff[1]}`;
    if (safari) return `Safari ${safari[1]}`;
    return ua.slice(0, 80);
}

function _tagToFilePath(tag) {
    if (typeof window.__LDS_TAG_TO_FILE__ === 'function') return window.__LDS_TAG_TO_FILE__(tag);
    return `src/components/${tag}/${tag}.js`;
}

function _extractLineNumber(stack) {
    if (!stack) return null;
    var lines = stack.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/src\/(?:elements|components|base|managers|helpers|utils)\/[^:]+:(\d+):\d+/);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

function _findRelatedComponents(tag, eventsTimeline) {
    if (!eventsTimeline || !eventsTimeline.length) return [];
    var myActions = {};
    eventsTimeline.forEach(function (e) {
        if (e.from === tag) myActions[e.name] = true;
    });
    var related = {};
    eventsTimeline.forEach(function (e) {
        if (e.from !== tag && myActions[e.name]) related[e.from] = true;
    });
    return Object.keys(related).filter(Boolean);
}

function _filterAppStack(stack) {
    if (!stack) return '';
    const customRe = window.__LDS_STACK_FILTER_RE__ || /node_modules[\\/](?!ui-platform)/i;
    const lines = stack.split('\n');
    const kept = lines.filter(line => {
        if (!line.includes('node_modules/')) return true;
        if (!customRe.test(line)) return true; // matches exception pattern = keep
        return false;
    });
    const meaningful = kept.filter(l => l.trim() && !l.trim().startsWith('Error'));
    return meaningful.length > 0 ? kept.join('\n') : lines.slice(0, 5).join('\n');
}

// ── History ────────────────────────────────────────────────────────────────
function _saveToHistory(report, source = 'live') {
    const h = window.__LDS_HISTORY__;
    h.push({ id: `h-${Date.now()}`, capturedAt: report.reportTime || new Date().toISOString(), source, sessionId: report.sessionId, report });
    if (h.length > 20) h.shift();
}

// ── Environment ────────────────────────────────────────────────────────────
function _captureEnvironment() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const mem = performance.memory;
    return {
        browser:  { userAgent: navigator.userAgent, version: _parseBrowserInfo(), language: navigator.language, onLine: navigator.onLine, cookiesEnabled: navigator.cookieEnabled },
        hardware: { cpuCores: navigator.hardwareConcurrency || 'unknown', deviceMemoryGB: navigator.deviceMemory || 'unknown', screen: `${screen.width}x${screen.height} @${window.devicePixelRatio}x` },
        network:  conn ? { effectiveType: conn.effectiveType, downlinkMbps: conn.downlink, rttMs: conn.rtt, saveData: conn.saveData } : null,
        heap:     mem ? { usedMB: Math.round(mem.usedJSHeapSize / 1048576), totalMB: Math.round(mem.totalJSHeapSize / 1048576), limitMB: Math.round(mem.jsHeapSizeLimit / 1048576) } : null,
        pageLoad: (() => {
            const nav = performance.getEntriesByType('navigation')[0];
            if (!nav) return null;
            return { dnsMs: Math.round(nav.domainLookupEnd - nav.domainLookupStart), ttfbMs: Math.round(nav.responseStart - nav.requestStart), domInteractiveMs: Math.round(nav.domInteractive), loadMs: Math.round(nav.loadEventEnd) };
        })(),
        url:       location.href,
        capturedAt: new Date().toISOString(),
        sessionId:  window.__LDS_SESSION_ID__,
    };
}

// ── Report assembly ────────────────────────────────────────────────────────
function _captureDomStats() {
    try {
        const all = document.querySelectorAll('*');
        const counts = {};
        for (var i = 0; i < all.length; i++) {
            const tag = all[i].tagName;
            if (tag.indexOf('-') !== -1) {
                const t = tag.toLowerCase();
                counts[t] = (counts[t] || 0) + 1;
            }
        }
        return { totalNodes: all.length, customElements: counts };
    } catch (_e) {
        return null;
    }
}

function _collectReport(note = '') {
    const rawMem = window.__LDS_MEMORY__;
    return {
        sessionId:      window.__LDS_SESSION_ID__,
        reportTime:     new Date().toISOString(),
        note:           note || '',
        environment:    _captureEnvironment(),
        errors:         [...(window.__LDS_ERRORS__ || [])],
        perf:           { ...(window.__LDS_PERF__ || {}) },
        eventsTimeline: [...(window.__LDS_EVENTS_TIMELINE__ || [])],
        eventsFreq:     window.__LDS_EVENTS_FREQ__ ? { ...window.__LDS_EVENTS_FREQ__ } : null,
        slowApi:        [...(window.__LDS_SLOW_API_LOG__ || [])],
        memory:         rawMem instanceof Map ? Object.fromEntries(rawMem) : { ...(rawMem || {}) },
        console:        [...(window.__LDS_CONSOLE__ || [])],
        slowRenders:    [...(window.__LDS_SLOW_RENDERS__ || [])],
        storms:         [...(window.__LDS_STORMS__ || [])],
        vitals:         window.__LDS_VITALS__ ? { ...window.__LDS_VITALS__, longTasks: [...(window.__LDS_VITALS__.longTasks || [])] } : null,
        network:        [...(window.__LDS_NETWORK_LOG__ || [])],
        renderReasons:  window.__LDS_RENDER_REASONS__ ? { ...window.__LDS_RENDER_REASONS__ } : null,
        thrash:         [...(window.__LDS_THRASH__ || [])],
        cycles:         [...(window.__LDS_CYCLES__ || [])],
        mountCycles:       window.__LDS_MOUNT_CYCLES__ ? window.__LDS_MOUNT_CYCLES__.map(c => ({ ...c, counts: { ...c.counts } })) : [],
        resourceViolations: window.__LDS_RESOURCE_VIOLATIONS__ ? [...window.__LDS_RESOURCE_VIOLATIONS__] : [],
        domStats:           _captureDomStats(),
    };
}

// ── Health scoring ─────────────────────────────────────────────────────────
function _gradeFromScore(score) {
    if (score >= 85) return { grade: 'A', color: '#a6e3a1' };
    if (score >= 70) return { grade: 'B', color: '#94e2d5' };
    if (score >= 55) return { grade: 'C', color: '#f9e2af' };
    if (score >= 40) return { grade: 'D', color: '#fab387' };
    return { grade: 'F', color: '#f38ba8' };
}

function _pageHealthScore(report) {
    let score = 100;
    const errors    = report.errors || [];
    const storms    = report.storms || [];
    const vitals    = report.vitals;
    const longTasks = vitals?.longTasks || [];
    const slowApi   = report.slowApi || [];
    const network   = report.network || [];
    const thrash    = report.thrash  || [];
    const cycles    = report.cycles  || [];

    score -= Math.min(errors.length * 20, 60);
    score -= storms.length > 0 ? Math.min(storms.length * 15, 30) : 0;
    score -= Math.min(slowApi.length * 3, 15);
    score -= network.filter(n => n.isError).length > 0 ? 10 : 0;
    score -= Math.min(thrash.length * 5, 20);
    score -= cycles.length > 0 ? Math.min(cycles.length * 15, 30) : 0;

    const domTotal = report.domStats?.totalNodes || 0;
    if (domTotal > 5000) score -= 20; else if (domTotal > 2500) score -= 10; else if (domTotal > 1500) score -= 5;

    if (vitals) {
        const lcp = vitals.lcp?.valueMs;
        if (lcp > 4000) score -= 25; else if (lcp > 2500) score -= 12;
        const cls = vitals.cls?.value;
        if (cls > 0.25) score -= 20; else if (cls > 0.1) score -= 10;
        const inp = vitals.inp?.valueMs;
        if (inp > 500) score -= 20; else if (inp > 200) score -= 10;
    }
    if (longTasks.length > 10) score -= 15; else if (longTasks.length > 5) score -= 8; else if (longTasks.length > 0) score -= 3;

    return Math.max(0, Math.min(100, Math.round(score)));
}

function _componentHealthScore(tag, report) {
    let score = 100;
    const hasError   = (report.errors || []).some(e => e.tag === tag);
    const isStorm    = (report.storms || []).some(s => s.tag === tag);
    const perf       = (report.perf || {})[tag];
    const mem        = (report.memory || {})[tag];
    const slowRenders = (report.slowRenders || []).filter(r => r.tag === tag);

    if (hasError) score -= 40;
    if (isStorm)  score -= 30;
    if (slowRenders.length > 0) score -= 20;
    if (perf && perf.count > 0) {
        const avg = perf.totalMs / perf.count;
        if (avg > 500) score -= 25; else if (avg > 200) score -= 12; else if (avg > 100) score -= 5;
    }
    if (mem) {
        const active = (mem.mounted || 0) - (mem.unmounted || 0);
        const leak = active > 3 && (mem.gcCount || 0) < active * 0.5;
        if (leak) score -= 20;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Phase 7: Evidence helpers ──────────────────────────────────────────────
function _isProgressiveLeakFromReport(tag, mountCycles) {
    if (!mountCycles || mountCycles.length < 3) return false;
    const completed = mountCycles.filter(c => c.endTs);
    if (completed.length < 3) return false;
    const actives = completed.map(c => {
        const s = (c.counts || {})[tag] || { mounted: 0, unmounted: 0 };
        return Math.max(0, s.mounted - s.unmounted);
    });
    let growCount = 0;
    for (let i = 1; i < actives.length; i++) {
        if (actives[i] > actives[i - 1]) growCount++;
    }
    return growCount === actives.length - 1 && growCount >= 2;
}

// Five-level evidence ladder: observation < correlation < attribution < lifetime-violation < causality-confirmed
function _computeEvidenceLevel(issue, report) {
    const hasStack = (issue.callStacks || []).length > 0;
    const hasLine  = hasStack && _extractLineNumber((issue.callStacks || [])[0]) !== null;
    const perf     = (report.perf || {})[issue.component] || {};
    const avgTTIms = perf.count > 0 ? Math.round(perf.totalMs / perf.count) : 0;
    switch (issue.issueType) {
        case 'runtime-error':   return hasLine ? 'attribution' : 'observation';
        case 'render-storm':    return avgTTIms > 200 ? 'correlation' : 'observation';
        case 'slow-render':     return hasLine ? 'attribution' : 'observation';
        case 'high-avg-tti':    return 'observation';
        case 'memory-leak':     return (issue.observed && issue.observed.leakType === 'progressive-leak') ? 'correlation' : 'observation';
        case 'network-error':   return 'observation';
        case 'property-thrash': return hasLine ? 'attribution' : 'correlation';
        case 'circular-update':         return hasLine ? 'attribution' : 'correlation';
        case 'resource-outlived-owner': return 'lifetime-violation';
        default:                        return 'observation';
    }
}

// ── Pinpoint issues ────────────────────────────────────────────────────────
function _buildPinpointIssues(report) {
    const issues = [];

    // Crashes
    const byErrorTag = {};
    (report.errors || []).forEach(e => { (byErrorTag[e.tag] = byErrorTag[e.tag] || []).push(e); });
    Object.entries(byErrorTag).forEach(([tag, errs]) => {
        const iss = { id: `error-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'runtime-error', severity: 'critical',
            details: errs.map(e => `[${e.phase}] ${e.message}`).join('\n'),
            callStacks: errs.map(e => e.stack).filter(Boolean),
            recommendation: 'Crash caught by LdsErrorBoundary. Inspect the stack trace. Check for null/undefined dereferences in performUpdate() or _propertiesChanged().',
            observed: { errorCount: errs.length, phases: errs.map(e => e.phase) } };
        iss.evidenceLevel = _computeEvidenceLevel(iss, report);
        issues.push(iss);
    });

    // Render storms
    const byStormTag = {};
    (report.storms || []).forEach(s => { (byStormTag[s.tag] = byStormTag[s.tag] || []).push(s); });
    Object.entries(byStormTag).forEach(([tag, incidents]) => {
        const maxCount = Math.max(...incidents.map(i => i.count));
        const perfData = (report.perf || {})[tag] || {};
        const avgTTIms = perfData.count > 0 ? Math.round(perfData.totalMs / perfData.count) : 0;
        const iss = { id: `storm-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'render-storm', severity: 'high',
            details: `<${tag}> mounted ${maxCount}× in session. Storm at: ${incidents.map(i => i.count).join(', ')} mounts.`,
            callStacks: incidents.map(i => i.stack).filter(Boolean),
            recommendation: 'Check parent for property bindings that change on every update (new object/array literals in templates). Verify connectedCallback does not cause re-mount via DOM manipulation.',
            observed: { mountCount: maxCount, avgTTIms } };
        iss.evidenceLevel = _computeEvidenceLevel(iss, report);
        issues.push(iss);
    });

    // Slow render incidents
    const bySlowTag = {};
    (report.slowRenders || []).forEach(r => { (bySlowTag[r.tag] = bySlowTag[r.tag] || []).push(r); });
    Object.entries(bySlowTag).forEach(([tag, incidents]) => {
        const maxMs = Math.max(...incidents.map(i => i.ms));
        const iss = { id: `slow-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'slow-render', severity: maxMs > 1000 ? 'high' : 'medium',
            details: `${incidents.length} render(s) exceeded 500ms. Max: ${maxMs}ms.`,
            callStacks: incidents.map(i => i.stack).filter(Boolean),
            recommendation: 'Move heavy computation out of render() into updated() or a property setter. Consider lazy loading heavy children.',
            observed: { incidentCount: incidents.length, maxMs } };
        iss.evidenceLevel = _computeEvidenceLevel(iss, report);
        issues.push(iss);
    });

    // High-avg TTI
    Object.entries(report.perf || {}).forEach(([tag, d]) => {
        if (bySlowTag[tag] || d.count < 2) return;
        const avg = Math.round(d.totalMs / d.count);
        if (avg > 200) {
            const iss = { id: `avg-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'high-avg-tti', severity: avg > 500 ? 'high' : 'medium',
                details: `Avg TTI: ${avg}ms over ${d.count} renders. Max: ${Math.round(d.maxMs)}ms.`,
                callStacks: [],
                recommendation: 'Profile with Chrome DevTools. Enable prop-audit (window.__LDS_PROP_DEBUG__ = "<tag>") to see which properties trigger updates.',
                observed: { avgMs: avg, renderCount: d.count, maxMs: Math.round(d.maxMs) } };
            iss.evidenceLevel = _computeEvidenceLevel(iss, report);
            issues.push(iss);
        }
    });

    // Memory leaks — Phase 7: slope-based detection preferred over single-snapshot
    Object.entries(report.memory || {}).forEach(([tag, v]) => {
        const active = (v.mounted || 0) - (v.unmounted || 0);
        const isProgressive = _isProgressiveLeakFromReport(tag, report.mountCycles);
        const singleSnapshot = active > 3 && (v.gcCount || 0) < active * 0.5;
        if (!isProgressive && !singleSnapshot) return;
        const leakType = isProgressive ? 'progressive-leak' : 'mount-storm';
        const completedCycles = (report.mountCycles || []).filter(c => c.endTs).length;
        const observed = { mounted: v.mounted || 0, unmounted: v.unmounted || 0, active, gcCount: v.gcCount || 0, leakType };
        const iss = { id: `leak-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'memory-leak', severity: 'high',
            details: isProgressive
                ? `<${tag}> active count grew across ${completedCycles} session cycles. Progressive leak (leakType: progressive-leak). Active: ${active} | GC freed: ${v.gcCount || 0}.`
                : `Mounted: ${v.mounted} | Unmounted: ${v.unmounted} | Active: ${active} | GC freed: ${v.gcCount || 0}. (Single-session spike — verify across multiple navigations.)`,
            callStacks: [],
            recommendation: 'Check disconnectedCallback: remove all addEventListener(), clearTimeout/clearInterval, cancel event bus subscriptions. Verify no parent stores element references in arrays that outlive navigation.',
            observed };
        iss.evidenceLevel = _computeEvidenceLevel(iss, report);
        issues.push(iss);
    });

    // Failed network calls
    const failedReqs = (report.network || []).filter(n => n.isError);
    if (failedReqs.length > 0) {
        const iss = { id: 'network-errors', component: '(network)', filePath: '', issueType: 'network-error', severity: 'high',
            details: failedReqs.map(n => `${n.method} ${n.url} → ${n.status || 'ERR'} (${n.durationMs}ms)`).join('\n'),
            callStacks: [],
            recommendation: 'Check auth tokens, CORS headers, and API availability. 401 → re-login; 403 → permission issue; 5xx → backend problem.',
            observed: { failedCount: failedReqs.length, statuses: [...new Set(failedReqs.map(n => n.status || 'ERR'))] } };
        iss.evidenceLevel = _computeEvidenceLevel(iss, report);
        issues.push(iss);
    }

    // Property thrash
    const byThrashTag = {};
    (report.thrash || []).forEach(t => {
        if (!byThrashTag[t.tag]) byThrashTag[t.tag] = [];
        byThrashTag[t.tag].push(t);
    });
    Object.entries(byThrashTag).forEach(([tag, incidents]) => {
        const props    = [...new Set(incidents.map(i => i.prop))];
        const maxCount = Math.max(...incidents.map(i => i.count));
        const iss = { id: `thrash-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'property-thrash', severity: 'high',
            details: `Property thrash on <${tag}>:\n${incidents.slice(0, 5).map(i => `  .${i.prop} — set ${i.count}× in ${i.windowMs}ms`).join('\n')}\nAffected props: ${props.join(', ')}`,
            callStacks: incidents.map(i => i.stack).filter(Boolean),
            recommendation: 'A property is being set >5× per second — likely a new object/array literal passed on every parent render. Move the value outside the render function or use a stable reference.',
            observed: { props, maxSetCount: maxCount } };
        iss.evidenceLevel = _computeEvidenceLevel(iss, report);
        issues.push(iss);
    });

    // Circular updates
    (report.cycles || []).forEach((c, idx) => {
        const tags    = c.path.split(' → ');
        const rootTag = tags[0] || '(unknown)';
        const iss = { id: `cycle-${idx}`, component: rootTag, filePath: _tagToFilePath(rootTag), issueType: 'circular-update', severity: 'critical',
            details: `Circular update chain detected (${c.count}×):\n  ${c.path}${c.prop ? `\n  Triggered on prop: .${c.prop}` : ''}`,
            callStacks: c.stack ? [c.stack] : [],
            recommendation: 'An element\'s updated() or setter is setting a property on a component that eventually sets a property back on it. Break the cycle: use a guard (if this._updating return), memoize values, or restructure data flow so updates are unidirectional.',
            observed: { path: c.path, cycleCount: c.count, triggerProp: c.prop || null } };
        iss.evidenceLevel = _computeEvidenceLevel(iss, report);
        issues.push(iss);
    });

    // Resource lifetime violations (Phase 9)
    const byViolationTag = {};
    (report.resourceViolations || []).forEach(v => {
        (byViolationTag[v.ownerTag] = byViolationTag[v.ownerTag] || []).push(v);
    });
    Object.entries(byViolationTag).forEach(([tag, violations]) => {
        const allResources = violations.flatMap(v => v.resources);
        const byType = {};
        allResources.forEach(r => { (byType[r.eventType] = byType[r.eventType] || []).push(r); });
        const summary = Object.entries(byType)
            .map(([evt, arr]) => `  ${arr.length}× ${evt} (on ${arr[0].target})`)
            .join('\n');
        const worstStack = allResources.find(r => r.creationStack)?.creationStack || null;
        const iss = {
            id: `rlo-${tag}`, component: tag, filePath: _tagToFilePath(tag),
            issueType: 'resource-outlived-owner', severity: 'high',
            details: `<${tag}> disconnected with unreleased listeners across ${violations.length} instance(s):\n${summary}`,
            callStacks: worstStack ? [worstStack] : [],
            recommendation: 'Add matching removeEventListener calls in disconnectedCallback for each addEventListener in connectedCallback.',
            observed: { violationCount: violations.length, resourceCount: allResources.length, eventTypes: Object.keys(byType) },
        };
        iss.evidenceLevel = 'lifetime-violation';
        issues.push(iss);
    });

    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return issues.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
}

// ── R3-B History diff ─────────────────────────────────────────────────────
function _buildDiff(aReport = {}, bReport = {}) {
    const _num = v => typeof v === 'number' ? v : 0;
    const _avg = perf => {
        const vals = Object.values(perf || {});
        if (!vals.length) return 0;
        const total = vals.reduce((s, d) => s + (d.count > 0 ? d.totalMs / d.count : 0), 0);
        return Math.round(total / vals.length);
    };

    const aErrors  = _num((aReport.errors || []).length);
    const bErrors  = _num((bReport.errors || []).length);
    const aStorms  = _num((aReport.storms || []).length);
    const bStorms  = _num((bReport.storms || []).length);
    const aNetFail = _num((aReport.network || []).filter(n => n.isError).length);
    const bNetFail = _num((bReport.network || []).filter(n => n.isError).length);
    const aAvgTti  = _avg(aReport.perf);
    const bAvgTti  = _avg(bReport.perf);
    const aScore   = _pageHealthScore(aReport);
    const bScore   = _pageHealthScore(bReport);
    const aDomNodes = _num(aReport.domStats?.totalNodes);
    const bDomNodes = _num(bReport.domStats?.totalNodes);

    const _dir   = (a, b, lowerIsBetter = true) =>
        a === b ? 'same' : (lowerIsBetter ? (b < a ? 'better' : 'worse') : (b > a ? 'better' : 'worse'));
    const _delta = (a, b) => {
        if (a === 0 && b === 0) return '';
        const d = b - a;
        return (d > 0 ? '+' : '') + d;
    };

    const metrics = [
        { label: 'Health Score',     aVal: aScore,         bVal: bScore,         dir: _dir(aScore, bScore, false), delta: _delta(aScore, bScore) },
        { label: 'Crashes',          aVal: aErrors,        bVal: bErrors,        dir: _dir(aErrors, bErrors),      delta: _delta(aErrors, bErrors) },
        { label: 'Render Storms',    aVal: aStorms,        bVal: bStorms,        dir: _dir(aStorms, bStorms),      delta: _delta(aStorms, bStorms) },
        { label: 'Network Failures', aVal: aNetFail,       bVal: bNetFail,       dir: _dir(aNetFail, bNetFail),    delta: _delta(aNetFail, bNetFail) },
        { label: 'Avg Render (ms)',  aVal: aAvgTti + 'ms', bVal: bAvgTti + 'ms', dir: _dir(aAvgTti, bAvgTti),     delta: _delta(aAvgTti, bAvgTti) + 'ms' },
        { label: 'DOM Nodes',        aVal: aDomNodes,      bVal: bDomNodes,      dir: _dir(aDomNodes, bDomNodes),  delta: _delta(aDomNodes, bDomNodes) },
    ];

    const aIssueIds  = new Set(_buildPinpointIssues(aReport).map(i => i.id));
    const bIssues    = _buildPinpointIssues(bReport);
    const newIssues  = bIssues.filter(i => !aIssueIds.has(i.id));
    const bIssueIds  = new Set(bIssues.map(i => i.id));
    const aIssues    = _buildPinpointIssues(aReport);
    const fixedIssues = aIssues.filter(i => !bIssueIds.has(i.id));

    const aTags = new Set(Object.keys(aReport.perf || {}));
    const bTags = new Set(Object.keys(bReport.perf || {}));
    const newComponents     = [...bTags].filter(t => !aTags.has(t));
    const removedComponents = [...aTags].filter(t => !bTags.has(t));

    return { metrics, newIssues, fixedIssues, newComponents, removedComponents };
}

// ── Anomaly findings ───────────────────────────────────────────────────────
function _computeFindings(report) {
    const findings = [];
    const errorCount = (report.errors || []).length;
    if (errorCount > 0) findings.push({ severity: 'critical', icon: '🔴', text: `${errorCount} crash${errorCount > 1 ? 'es' : ''} caught by ErrorBoundary` });
    const failedNet = (report.network || []).filter(n => n.isError).length;
    if (failedNet > 0) findings.push({ severity: 'critical', icon: '🔴', text: `${failedNet} failed network request${failedNet > 1 ? 's' : ''}` });
    const storms = report.storms || [];
    if (storms.length > 0) { const worst = storms.reduce((a, b) => a.count > b.count ? a : b); findings.push({ severity: 'high', icon: '🔁', text: `Render storm: <${worst.tag}> mounted ${worst.count}×` }); }
    const slowApis = report.slowApi || [];
    if (slowApis.length > 0) { const maxMs = Math.max(...slowApis.map(e => e.durationMs || e.duration || e.ms || 0)); findings.push({ severity: 'high', icon: '🟠', text: `${slowApis.length} API call${slowApis.length > 1 ? 's' : ''} over threshold (max ${maxMs}ms)` }); }
    const v = report.vitals;
    if (v?.lcp?.valueMs > 4000) findings.push({ severity: 'high', icon: '🟠', text: `LCP ${v.lcp.valueMs}ms (poor — threshold 2500ms)` });
    else if (v?.lcp?.valueMs > 2500) findings.push({ severity: 'medium', icon: '🟡', text: `LCP ${v.lcp.valueMs}ms (needs improvement)` });
    if (v?.inp?.valueMs > 500) findings.push({ severity: 'high', icon: '🟠', text: `INP ${v.inp.valueMs}ms (poor — threshold 200ms)` });
    if (v?.cls?.value > 0.1) findings.push({ severity: 'medium', icon: '🟡', text: `CLS ${v.cls.value.toFixed(3)} (threshold 0.1)` });
    const ltCount = (v?.longTasks || []).length;
    if (ltCount > 5) findings.push({ severity: 'medium', icon: '🟡', text: `${ltCount} long task${ltCount > 1 ? 's' : ''} (>50ms main thread blocks)` });
    const slowTags = Object.entries(report.perf || {}).filter(([, d]) => d.count > 0 && d.totalMs / d.count > 500).sort((a, b) => b[1].totalMs / b[1].count - a[1].totalMs / a[1].count);
    if (slowTags.length > 0) { const [tag, d] = slowTags[0]; findings.push({ severity: 'medium', icon: '🟡', text: `<${tag}> avg render ${Math.round(d.totalMs / d.count)}ms${slowTags.length > 1 ? ` +${slowTags.length - 1} more` : ''}` }); }
    const conErrors = (report.console || []).filter(e => e.level === 'error').length;
    if (conErrors > 0) findings.push({ severity: 'medium', icon: '⚠️', text: `${conErrors} console error${conErrors > 1 ? 's' : ''}` });
    const thrash = report.thrash || [];
    if (thrash.length > 0) {
        const tags = [...new Set(thrash.map(t => t.tag))];
        findings.push({ severity: 'high', icon: '🔄', text: `Property thrash: ${thrash.length} incident${thrash.length > 1 ? 's' : ''} on ${tags.slice(0, 2).map(t => `<${t}>`).join(', ')}${tags.length > 2 ? ` +${tags.length - 2} more` : ''}` });
    }
    const cycles = report.cycles || [];
    if (cycles.length > 0) {
        findings.push({ severity: 'critical', icon: '🔁', text: `${cycles.length} circular update chain${cycles.length > 1 ? 's' : ''} detected` });
    }
    const domNodes = report.domStats?.totalNodes || 0;
    if (domNodes > 5000) findings.push({ severity: 'high', icon: '🌳', text: `DOM is very large: ${domNodes.toLocaleString()} nodes (threshold 1500)` });
    else if (domNodes > 1500) findings.push({ severity: 'medium', icon: '🌳', text: `DOM has ${domNodes.toLocaleString()} nodes — consider virtualising long lists` });
    if (findings.length === 0) findings.push({ severity: 'ok', icon: '✅', text: 'No anomalies detected' });
    return findings;
}

// ── HTML report generator ──────────────────────────────────────────────────
function _buildHtmlReport(report, note) {
    const score = _pageHealthScore(report);
    const { grade, color: gradeColor } = _gradeFromScore(score);
    const findings = _computeFindings(report);
    const issues   = _buildPinpointIssues(report);
    const env      = report.environment || {};

    const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rowsHtml = (cols, rows) =>
        `<table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
            rows.map(r => `<tr>${r.map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')
        }</tbody></table>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LDS Debug Report — ${escHtml(report.reportTime?.slice(0,19) || '')}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Consolas,Menlo,Monaco,monospace;font-size:12px;background:#1e1e2e;color:#cdd6f4;padding:20px}
h1{font-size:20px;color:#89b4fa;margin-bottom:4px}
h2{font-size:14px;color:#89b4fa;margin:18px 0 8px;border-bottom:1px solid #313244;padding-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
.meta{color:#6c7086;font-size:11px;margin-bottom:16px}
.grade{display:inline-block;font-size:48px;font-weight:bold;color:${gradeColor};line-height:1;vertical-align:middle}
.score{display:inline-block;font-size:20px;color:${gradeColor};vertical-align:middle;margin-left:8px}
.grade-block{background:#181825;border:1px solid #313244;border-radius:8px;padding:12px 20px;display:inline-flex;align-items:center;gap:12px;margin-bottom:16px}
.finding{display:flex;gap:8px;padding:6px 10px;border-radius:4px;margin-bottom:5px;background:#181825;border-left:3px solid #313244}
.finding.critical{border-left-color:#f38ba8}.finding.high{border-left-color:#fab387}.finding.medium{border-left-color:#f9e2af}.finding.ok{border-left-color:#a6e3a1}
.note-box{background:#1e2a1e;border:1px solid #a6e3a1;border-radius:6px;padding:10px;margin-bottom:16px;color:#a6e3a1}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px}
th{text-align:left;color:#6c7086;font-weight:normal;padding:4px 6px;border-bottom:1px solid #313244;background:#181825}
td{padding:4px 6px;border-bottom:1px solid #1a1a28;vertical-align:top;word-break:break-word}
.err{color:#f38ba8}.warn{color:#f9e2af}
details{margin-bottom:10px}
summary{cursor:pointer;color:#89b4fa;padding:6px 0;font-size:12px;user-select:none}
.issue{background:#181825;border:1px solid #313244;border-radius:6px;margin-bottom:8px;overflow:hidden}
.issue-hdr{display:flex;gap:8px;padding:8px 12px;align-items:flex-start}
.sev{border-radius:3px;padding:2px 6px;font-size:10px;font-weight:bold}
.sev.critical{background:#f38ba8;color:#1e1e2e}.sev.high{background:#fab387;color:#1e1e2e}.sev.medium{background:#f9e2af;color:#1e1e2e}
.issue-body{padding:8px 12px;border-top:1px solid #313244;font-size:11px}
.rec{color:#a6e3a1;background:#0d1f0d;padding:6px 8px;border-radius:4px;border-left:2px solid #a6e3a1;margin:6px 0}
pre{background:#13131f;color:#cba6f7;padding:8px;border-radius:4px;overflow-x:auto;font-size:10px;white-space:pre;max-height:200px;overflow-y:auto}
.kv{display:flex;gap:12px;padding:3px 0;border-bottom:1px solid #1a1a28}
.kv-k{color:#89b4fa;min-width:140px;flex-shrink:0}.kv-v{color:#cdd6f4;overflow-wrap:anywhere}
.section{margin-bottom:20px}
</style>
</head>
<body>
<h1>🐞 LDS Debug Report</h1>
<div class="meta">Session: ${escHtml(report.sessionId)} &nbsp;|&nbsp; ${escHtml(report.reportTime?.slice(0,19) || '')} &nbsp;|&nbsp; ${escHtml(env.browser?.version || '')} &nbsp;|&nbsp; ${escHtml(env.url || '')}</div>

${note ? `<div class="note-box">📝 Note: ${escHtml(note)}</div>` : ''}

<div class="grade-block">
  <div><div style="color:#6c7086;font-size:11px">Page Health</div><div><span class="grade">${grade}</span><span class="score">${score}/100</span></div></div>
</div>

<div class="section">
<h2>Findings</h2>
${findings.map(f => `<div class="finding ${f.severity}">${f.icon} ${escHtml(f.text)}</div>`).join('')}
</div>

${issues.length > 0 ? `<div class="section">
<h2>Pinpoint Issues</h2>
${issues.map(i => `<div class="issue">
<div class="issue-hdr"><span class="sev ${i.severity}">${i.severity.toUpperCase()}</span><div><strong style="color:#89b4fa">&lt;${escHtml(i.component)}&gt;</strong> <span style="color:#6c7086">${escHtml(i.issueType)}</span><br><span style="color:#a6e3a1;font-size:10px">${escHtml(i.filePath)}</span></div></div>
<div class="issue-body"><div style="margin-bottom:6px;white-space:pre-wrap">${escHtml(i.details)}</div><div class="rec">💡 ${escHtml(i.recommendation)}</div>${
    i.callStacks?.length > 0 ? i.callStacks.slice(0,2).map((s,idx) => `<details><summary>Call stack #${idx+1}</summary><pre>${escHtml(_filterAppStack(s))}</pre></details>`).join('') : ''
}</div></div>`).join('')}
</div>` : ''}

${Object.keys(report.perf || {}).length > 0 ? `<details><summary>▶ Performance (${Object.keys(report.perf).length} components)</summary>
${rowsHtml(['Component','Renders','Avg ms','Max ms','Min ms'],
    Object.entries(report.perf).sort((a,b)=>b[1].totalMs/b[1].count - a[1].totalMs/a[1].count)
        .map(([tag,d])=>[`<${tag}>`, d.count, Math.round(d.totalMs/d.count), Math.round(d.maxMs), d.minMs===Infinity?'-':Math.round(d.minMs)])
)}
</details>` : ''}

${report.network?.length > 0 ? `<details><summary>▶ Network (${report.network.length} requests)</summary>
${rowsHtml(['Method','URL / Decoded','Status','ms','KB'],
    report.network.slice(-50).reverse().map(n=>{
        const dc  = n.decoded;
        const url = dc
            ? `<span style="color:#cba6f7">${escHtml(dc.operation||dc.method)}${dc.domain?` · ${escHtml(dc.domain)}`:''}</span><br><span style="font-size:10px">${escHtml(dc.callPath||'')}</span>${dc.types?`<br><span style="font-size:9px;color:#a6e3a1">[${dc.types.slice(0,3).join(', ')}]</span>`:''}`
            : `<span class="${n.isError?'err':n.isSlow?'warn':''}">${escHtml(n.url)}</span>`;
        return [n.method, url, `<span class="${n.isError?'err':''}">${n.status||'ERR'}</span>`,
            n.isError?`<span class="err">${n.durationMs}</span>`:n.isSlow?`<span class="warn">${n.durationMs}</span>`:n.durationMs,
            n.responseSizeKB||'-'];
    })
)}
</details>` : ''}

${report.domStats ? `<details><summary>▶ DOM Size${report.domStats.totalNodes > 1500 ? ' ⚠️' : ''}</summary>
<div class="kv"><span class="kv-k">Total Nodes</span><span class="kv-v" style="${report.domStats.totalNodes > 5000 ? 'color:#f38ba8' : report.domStats.totalNodes > 1500 ? 'color:#fab387' : ''}">${report.domStats.totalNodes.toLocaleString()}</span></div>
${report.domStats.customElements && Object.keys(report.domStats.customElements).length > 0
    ? rowsHtml(['Tag','Count'],
        Object.entries(report.domStats.customElements).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([tag,count])=>[`<${tag}>`,count]))
    : ''}
</details>` : ''}

${report.thrash?.length > 0 ? `<details><summary>▶ Property Thrash (${report.thrash.length} incidents)</summary>
${rowsHtml(['Component','Property','Count','Window ms','Time'],
    report.thrash.map(t=>[`<${t.tag}>`, t.prop, t.count, t.windowMs, (t.ts||'').slice(11,19)])
)}
</details>` : ''}

${report.cycles?.length > 0 ? `<details><summary>▶ Circular Updates (${report.cycles.length} chains)</summary>
${rowsHtml(['Cycle Path','Count','Prop','First seen'],
    report.cycles.map(c=>[escHtml(c.path), c.count, c.prop||'—', (c.ts||'').slice(11,19)])
)}
</details>` : ''}

${report.vitals ? `<details><summary>▶ Core Web Vitals</summary>
<div class="kv"><span class="kv-k">LCP</span><span class="kv-v">${report.vitals.lcp ? `${report.vitals.lcp.valueMs}ms (element: ${report.vitals.lcp.element})` : 'not captured'}</span></div>
<div class="kv"><span class="kv-k">CLS</span><span class="kv-v">${report.vitals.cls ? report.vitals.cls.value.toFixed(4) : 'not captured'}</span></div>
<div class="kv"><span class="kv-k">INP/FID</span><span class="kv-v">${report.vitals.inp ? `${report.vitals.inp.valueMs}ms` : 'not captured'}</span></div>
<div class="kv"><span class="kv-k">Long Tasks</span><span class="kv-v">${(report.vitals.longTasks||[]).length} task(s) >50ms</span></div>
</details>` : ''}

${report.errors?.length > 0 ? `<details><summary>▶ Crashes (${report.errors.length})</summary>
${rowsHtml(['Component','Phase','Message','Time'],
    report.errors.map(e=>[`<${e.tag}>`,e.phase,e.message,(e.ts||'').slice(11,19)])
)}
</details>` : ''}

${report.console?.length > 0 ? `<details><summary>▶ Console (${report.console.length} entries)</summary>
${rowsHtml(['Level','Message','Time'],
    report.console.slice().reverse().map(e=>[`<span class="${e.level==='error'?'err':'warn'}">${e.level}</span>`,e.message,(e.ts||'').slice(11,19)])
)}
</details>` : ''}

${Object.keys(report.memory||{}).length > 0 ? `<details><summary>▶ Memory</summary>
${rowsHtml(['Component','Mounted','Unmounted','Active','GC freed'],
    Object.entries(report.memory).sort((a,b)=>b[1].mounted-a[1].mounted)
        .map(([tag,v])=>[`<${tag}>`,v.mounted??0,v.unmounted??0,(v.mounted||0)-(v.unmounted||0),v.gcCount??0])
)}
</details>` : ''}

${report.environment ? `<details><summary>▶ Environment</summary>
<div class="kv"><span class="kv-k">Browser</span><span class="kv-v">${escHtml(env.browser?.version)}</span></div>
<div class="kv"><span class="kv-k">URL</span><span class="kv-v">${escHtml(env.url)}</span></div>
</details>` : ''}

<details><summary>▶ Raw JSON</summary>
<pre style="max-height:400px">${escHtml(JSON.stringify(report, null, 2))}</pre>
</details>
</body>
</html>`;
}

// ── Tabs ───────────────────────────────────────────────────────────────────
const TABS = [
    { key: 'summary',  label: 'Summary' },
    { key: 'pinpoint', label: '🔍 Pinpoint' },
    { key: 'vitals',   label: 'Vitals' },
    { key: 'network',  label: 'Network' },
    { key: 'falcor',   label: 'Falcor' },
    { key: 'perf',     label: 'Perf' },
    { key: 'errors',   label: 'Errors' },
    { key: 'console',  label: 'Console' },
    { key: 'events',   label: 'Events' },
    { key: 'slowapi',  label: 'Slow API' },
    { key: 'memory',   label: 'Memory' },
    { key: 'history',  label: '📋 History' },
    { key: 'env',      label: 'Env' },
];

class LdsDebugPanel extends LitElement {
    static get styles() {
        return css`
            :host { display:block; font-family:'Consolas','Menlo','Monaco',monospace; font-size:12px; }

            .trigger { position:fixed; bottom:20px; right:20px; z-index:99998; width:44px; height:44px; border-radius:50%; border:none; background:#1e1e2e; color:#cdd6f4; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 12px rgba(0,0,0,.5); transition:transform .15s ease; outline:2px solid #313244; }
            .trigger:hover { transform:scale(1.1); }
            .trigger.has-errors { outline-color:#f38ba8; }
            .badge { position:absolute; top:-4px; right:-4px; background:#f38ba8; color:#1e1e2e; border-radius:9px; min-width:18px; height:18px; font-size:10px; font-weight:bold; display:flex; align-items:center; justify-content:center; padding:0 4px; }

            .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:99998; }

            .panel { position:fixed; top:0; right:0; bottom:0; width:540px; max-width:100vw; z-index:99999; background:#1e1e2e; color:#cdd6f4; display:flex; flex-direction:column; box-shadow:-4px 0 24px rgba(0,0,0,.6); }

            .panel-header { background:#13131f; padding:10px 14px; display:flex; align-items:center; gap:6px; border-bottom:1px solid #313244; flex-shrink:0; flex-wrap:wrap; }
            .panel-title { font-size:14px; font-weight:bold; color:#89b4fa; white-space:nowrap; }
            .session-id { flex:1; color:#6c7086; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
            .mode-badge { background:#45475a; color:#cba6f7; border-radius:4px; padding:2px 7px; font-size:10px; font-weight:bold; white-space:nowrap; flex-shrink:0; }
            .mode-badge.imported { background:#1e3a5f; color:#89b4fa; }
            .mode-badge.history  { background:#2a1e3f; color:#cba6f7; }
            .header-btn { background:#313244; border:none; color:#cdd6f4; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:11px; white-space:nowrap; flex-shrink:0; font-family:inherit; }
            .header-btn:hover { background:#45475a; }
            .header-btn.close { color:#f38ba8; }
            .header-btn.accent { color:#89b4fa; }
            .header-btn.live-btn { color:#a6e3a1; }

            .note-row { padding:6px 14px; background:#0d1f0d; border-bottom:1px solid #313244; flex-shrink:0; display:flex; align-items:center; gap:8px; }
            .note-input { flex:1; background:#13131f; border:1px solid #313244; color:#cdd6f4; border-radius:4px; padding:4px 8px; font-family:inherit; font-size:11px; resize:none; outline:none; }
            .note-input:focus { border-color:#89b4fa; }
            .note-label { color:#6c7086; font-size:10px; white-space:nowrap; }

            .tabs { display:flex; background:#181825; border-bottom:1px solid #313244; overflow-x:auto; flex-shrink:0; }
            .tabs::-webkit-scrollbar { height:3px; }
            .tabs::-webkit-scrollbar-thumb { background:#45475a; }
            .tab { background:none; border:none; color:#6c7086; padding:8px 12px; cursor:pointer; font-size:11px; font-family:inherit; white-space:nowrap; border-bottom:2px solid transparent; transition:color .1s; }
            .tab:hover { color:#cdd6f4; }
            .tab.active { color:#89b4fa; border-bottom-color:#89b4fa; }

            .tab-content { flex:1; overflow-y:auto; padding:12px; }
            .tab-content::-webkit-scrollbar { width:5px; }
            .tab-content::-webkit-scrollbar-thumb { background:#45475a; border-radius:3px; }

            .empty { color:#6c7086; padding:24px 0; text-align:center; }

            .finding { display:flex; gap:8px; padding:7px 10px; border-radius:6px; margin-bottom:6px; background:#181825; border-left:3px solid #313244; font-size:12px; }
            .finding.critical { border-left-color:#f38ba8; } .finding.high { border-left-color:#fab387; } .finding.medium { border-left-color:#f9e2af; } .finding.ok { border-left-color:#a6e3a1; }

            table { width:100%; border-collapse:collapse; font-size:11px; }
            th { text-align:left; color:#6c7086; font-weight:normal; padding:4px 6px; border-bottom:1px solid #313244; position:sticky; top:0; background:#1e1e2e; }
            td { padding:5px 6px; border-bottom:1px solid #1a1a28; vertical-align:top; word-break:break-word; }
            tr:hover td { background:#181825; }
            .slow { color:#f38ba8; } .warn-cell { color:#f9e2af; }

            .log-entry { display:flex; gap:8px; padding:5px 0; border-bottom:1px solid #1a1a28; align-items:flex-start; }
            .level-badge { border-radius:3px; padding:1px 5px; font-size:10px; font-weight:bold; flex-shrink:0; margin-top:1px; }
            .level-badge.error { background:#f38ba8; color:#1e1e2e; } .level-badge.warn { background:#f9e2af; color:#1e1e2e; }
            .log-msg { flex:1; color:#cdd6f4; overflow-wrap:anywhere; }
            .log-ts { color:#6c7086; font-size:10px; flex-shrink:0; }

            .kv-row { display:flex; gap:12px; padding:4px 0; border-bottom:1px solid #1a1a28; }
            .kv-key { color:#89b4fa; min-width:140px; flex-shrink:0; } .kv-value { color:#cdd6f4; overflow-wrap:anywhere; }

            .section-title { color:#89b4fa; font-size:11px; letter-spacing:.05em; text-transform:uppercase; margin:14px 0 6px; }
            .section-title:first-child { margin-top:0; }

            .stats-row { display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
            .stat-chip { background:#181825; border:1px solid #313244; border-radius:6px; padding:6px 12px; text-align:center; }
            .stat-chip .num { font-size:20px; color:#89b4fa; font-weight:bold; }
            .stat-chip .lbl { color:#6c7086; font-size:10px; }

            .health-grade { display:inline-block; font-size:36px; font-weight:bold; line-height:1; }
            .health-block { background:#181825; border:1px solid #313244; border-radius:8px; padding:10px 16px; display:inline-flex; align-items:center; gap:10px; margin-bottom:14px; }
            .health-meta { color:#6c7086; font-size:10px; }
            .health-score { font-size:16px; font-weight:bold; }

            .issue-card { background:#181825; border:1px solid #313244; border-radius:6px; margin-bottom:10px; overflow:hidden; }
            .issue-header { display:flex; align-items:flex-start; gap:8px; padding:9px 12px; cursor:pointer; user-select:none; }
            .issue-header:hover { background:#1e1e35; }
            .issue-sev { border-radius:3px; padding:2px 6px; font-size:10px; font-weight:bold; flex-shrink:0; margin-top:1px; }
            .issue-sev.critical { background:#f38ba8; color:#1e1e2e; } .issue-sev.high { background:#fab387; color:#1e1e2e; } .issue-sev.medium { background:#f9e2af; color:#1e1e2e; }
            .evidence-badge { border-radius:3px; padding:2px 6px; font-size:9px; font-weight:bold; flex-shrink:0; margin-top:1px; letter-spacing:0.3px; opacity:0.9; }
            .evl-observation { background:#313244; color:#9399b2; }
            .evl-correlation { background:#2d2f45; color:#89b4fa; }
            .evl-attribution { background:#1a2b1a; color:#a6e3a1; }
            .evl-lifetime-violation { background:#2d1a1a; color:#f38ba8; }
            .evl-causality-confirmed { background:#1a2b20; color:#94e2d5; }
            .fix-verified-badge { background:#a6e3a1; color:#1e1e2e; border-radius:3px; padding:2px 6px; font-size:9px; font-weight:bold; flex-shrink:0; margin-top:1px; }
            .baseline-badge { font-size:10px; color:#89b4fa; background:#1a1a2e; border-radius:4px; padding:3px 8px; display:inline-flex; align-items:center; gap:4px; }
            .baseline-clear { background:none; border:none; color:#6c7086; cursor:pointer; font-size:11px; padding:0 2px; line-height:1; }
            .baseline-clear:hover { color:#f38ba8; }
            .replay-banner { background:#1a2b1a; border:1px solid #a6e3a1; border-radius:6px; padding:9px 14px; margin-bottom:10px; font-size:11px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; color:#cdd6f4; }
            .replay-banner.replay-done { background:#1e2030; border-color:#89b4fa; }
            .verification-block { margin-top:10px; padding:8px 12px; border-radius:5px; border:1px solid #313244; }
            .verification-block.verified { border-color:#a6e3a1; background:#0d1a0d; }
            .verification-block.not-verified { border-color:#fab387; background:#1f150d; }
            .verify-title { font-size:11px; font-weight:bold; margin-bottom:5px; }
            .verify-row { display:flex; align-items:center; gap:6px; font-size:11px; margin:3px 0; }
            .verify-label { color:#6c7086; min-width:130px; }
            .verify-before { color:#f38ba8; text-decoration:line-through; }
            .verify-after { color:#a6e3a1; font-weight:bold; }
            .verify-after.verify-worse { color:#f38ba8; }
            .verify-good { color:#a6e3a1; font-weight:bold; font-size:10px; }
            .verify-partial { color:#f9e2af; font-size:10px; }
            .verify-bad { color:#f38ba8; font-size:10px; }
            .issue-info { flex:1; min-width:0; }
            .issue-component { color:#89b4fa; font-weight:bold; }
            .issue-type { color:#6c7086; font-size:10px; margin-left:6px; }
            .issue-filepath { color:#a6e3a1; font-size:10px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .issue-body { padding:0 12px 10px; border-top:1px solid #313244; }
            .issue-details { color:#cdd6f4; margin:8px 0; font-size:11px; white-space:pre-wrap; }
            .issue-rec { color:#a6e3a1; font-size:11px; margin:6px 0; padding:6px 8px; background:#0d1f0d; border-radius:4px; border-left:2px solid #a6e3a1; }
            .stack-toggle { background:none; border:1px solid #313244; color:#6c7086; border-radius:3px; padding:2px 8px; cursor:pointer; font-size:10px; font-family:inherit; margin:4px 0; }
            .stack-toggle:hover { color:#cdd6f4; border-color:#45475a; }
            .stack-pre { background:#13131f; color:#cba6f7; font-size:10px; padding:8px; border-radius:4px; overflow-x:auto; white-space:pre; margin-top:4px; max-height:200px; overflow-y:auto; }
            .filter-bar { display:flex; gap:8px; margin-bottom:10px; align-items:center; flex-wrap:wrap; }
            .filter-select { background:#313244; border:none; color:#cdd6f4; border-radius:4px; padding:4px 8px; font-size:11px; font-family:inherit; cursor:pointer; }
            .filter-input { background:#313244; border:1px solid #45475a; color:#cdd6f4; border-radius:4px; padding:4px 8px; font-size:11px; font-family:inherit; flex:1; min-width:120px; outline:none; }
            .filter-input:focus { border-color:#89b4fa; }
            .stack-filter-toggle { background:#1e2a3a; border:1px solid #313244; color:#89b4fa; border-radius:4px; padding:3px 8px; cursor:pointer; font-size:10px; font-family:inherit; }

            .history-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
            .source-pill { display:inline-block; border-radius:10px; padding:1px 7px; font-size:10px; font-weight:bold; }
            .source-pill.live { background:#1e3a1e; color:#a6e3a1; } .source-pill.download { background:#1e2a3a; color:#89b4fa; } .source-pill.imported { background:#2a1e3f; color:#cba6f7; }
            .viewing-row td { background:#1e1e35 !important; }

            .reason-row td { background:#13131f !important; }
            .freq-hot { color:#f38ba8; font-weight:bold; }

            .net-expand { background:#13131f; border-top:1px solid #313244; padding:10px 14px; }
            .net-kv-key { color:#89b4fa; min-width:130px; flex-shrink:0; font-size:11px; }
            .net-kv-val { color:#cdd6f4; font-size:11px; overflow-wrap:anywhere; flex:1; }
            .decoded-section { margin-bottom:10px; }
            .decoded-header { color:#cba6f7; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
            .tag-pill { display:inline-block; background:#1e2a3a; color:#89b4fa; border-radius:10px; padding:1px 7px; font-size:10px; margin:1px 2px; }

            .diff-better { color:#a6e3a1; } .diff-worse { color:#f38ba8; } .diff-same { color:#6c7086; }

            .vital-card { background:#181825; border:1px solid #313244; border-radius:6px; padding:10px 14px; margin-bottom:8px; display:flex; gap:14px; align-items:center; }
            .vital-val { font-size:28px; font-weight:bold; min-width:80px; }
            .vital-info { flex:1; }
            .vital-name { font-size:12px; font-weight:bold; color:#cdd6f4; }
            .vital-desc { font-size:10px; color:#6c7086; margin-top:2px; }
            .vital-good { color:#a6e3a1; } .vital-needs { color:#f9e2af; } .vital-poor { color:#f38ba8; }
        `;
    }

    static get properties() {
        return {
            _open:            { state: true },
            _tab:             { state: true },
            _report:          { state: true },
            _activeReport:    { state: true },
            _reportNote:      { state: true },
            _stackFilterOn:   { state: true },
            _expandedIssue:   { state: true },
            _expandedStacks:  { state: true },
            _consoleFilter:   { state: true },
            _errorFilter:     { state: true },
            _networkFilter:   { state: true },
            _eventsView:      { state: true },
            _expandedPerfTag: { state: true },
            _expandedNetIdx:  { state: true },
            _diffSelected:    { state: true },
            _diffView:        { state: true },
            _falcorViewMode:    { state: true },
            _falcorDiFilter:    { state: true },
            _falcorPathSearch:  { state: true },
            _falcorExpandedGrp: { state: true },
            _falcorExpandedCall:{ state: true },
        };
    }

    constructor() {
        super();
        this._open            = false;
        this._tab             = 'summary';
        this._report          = null;
        this._activeReport    = null;
        this._reportNote      = '';
        this._stackFilterOn   = true;
        this._expandedIssue   = null;
        this._expandedStacks  = {};
        this._consoleFilter   = { level: 'all', search: '' };
        this._errorFilter     = { search: '' };
        this._networkFilter   = { status: 'all', search: '' };
        this._eventsView      = 'timeline';
        this._expandedPerfTag = null;
        this._expandedNetIdx  = null;
        this._diffSelected    = new Set();
        this._diffView        = null;
        this._baseline          = null;   // { capturedAt, components: { tag: { active, mounted, avgMs, maxMs, errorCount } } }
        this._replayState       = null;   // { issueId, component, status: 'waiting'|'done', endSnap, comparison } | null
        this._verifiedIssues    = {};     // { issueId: { comparison, verifiedAt } }
        this._workflowBaseline  = null;   // { url, capturedAt, renders, mounts, networkCount, networkFailures }
        this._baselineOpen      = true;   // collapsible state for Workflow Baseline section
        this._falcorViewMode    = 'grouped';  // 'grouped' | 'dataindex' | 'search'
        this._falcorDiFilter    = 'all';      // dataIndex filter
        this._falcorPathSearch  = '';         // free-text filter
        this._falcorExpandedGrp = null;       // expanded burst group index
        this._falcorExpandedCall= null;       // expanded call key within a group
        this._loadBaseline();
        this._loadWorkflowBaseline();
    }

    _getActiveReport() { return this._activeReport ?? this._report; }
    _isHistoryMode()   { return this._activeReport !== null; }

    _togglePanel() { this._open = !this._open; if (this._open) this._refresh(); }
    _closePanel()  { this._open = false; }

    _refresh() {
        if (this._report) _saveToHistory(this._report, 'live');
        this._report = _collectReport(this._reportNote);
    }

    _backToLive() { this._activeReport = null; this._tab = 'summary'; }
    _setTab(key)  { this._tab = key; }

    _applyStack(stack) {
        return this._stackFilterOn ? _filterAppStack(stack) : (stack || '');
    }

    _download() {
        const report = _collectReport(this._reportNote);
        _saveToHistory(report, 'download');
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        this._triggerBlob(blob, `lds-report-${Date.now()}.json`);
    }

    _downloadHtml() {
        const report = _collectReport(this._reportNote);
        _saveToHistory(report, 'download');
        const html = _buildHtmlReport(report, this._reportNote);
        const blob = new Blob([html], { type: 'text/html' });
        this._triggerBlob(blob, `lds-report-${Date.now()}.html`);
    }

    _triggerBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _triggerImport() { this.shadowRoot.querySelector('#lds-import-input').click(); }

    async _onImportFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text   = await file.text();
            const report = JSON.parse(text);
            if (!report.sessionId && !report.reportTime) { alert('Invalid LDS report file'); return; }
            _saveToHistory(report, 'imported');
            this._activeReport = report;
            this._tab = 'summary';
        } catch (err) { alert(`Failed to parse: ${err.message}`); }
        e.target.value = '';
    }

    _viewHistoryItem(item) { this._activeReport = item.report; this._tab = 'summary'; }
    _clearHistory() { if (window.__LDS_HISTORY__) window.__LDS_HISTORY__.length = 0; this._activeReport = null; this.requestUpdate(); }

    // ── Phase 8: Baseline + Replay ─────────────────────────────────────────
    _loadBaseline() {
        try {
            const raw = localStorage.getItem('__lds_baseline');
            if (raw) this._baseline = JSON.parse(raw);
        } catch (_) {}
    }

    // ── Phase 10: Workflow baseline ────────────────────────────────────────
    _workflowBaselineKey() {
        try { return `__lds_workflow_baseline_${encodeURIComponent(location.pathname)}`; } catch (_) { return null; }
    }

    _loadWorkflowBaseline() {
        try {
            const key = this._workflowBaselineKey();
            if (!key) return;
            const raw = localStorage.getItem(key);
            if (raw) this._workflowBaseline = JSON.parse(raw);
        } catch (_) {}
    }

    _captureWorkflowBaseline() {
        try {
            const perf    = window.__LDS_PERF__ || {};
            const rawMem  = window.__LDS_MEMORY__;
            const network = window.__LDS_NETWORK_LOG__ || [];

            const renders = {};
            for (const [tag, d] of Object.entries(perf)) renders[tag] = d.count || 0;

            const mounts = {};
            if (rawMem instanceof Map) {
                for (const [tag, d] of rawMem) mounts[tag] = d.mounted || 0;
            } else if (rawMem && typeof rawMem === 'object') {
                for (const [tag, d] of Object.entries(rawMem)) mounts[tag] = d.mounted || 0;
            }

            const baseline = {
                url:              location.href,
                capturedAt:       new Date().toISOString(),
                renders,
                mounts,
                networkCount:     network.length,
                networkFailures:  network.filter(n => n.isError).length,
            };

            const key = this._workflowBaselineKey();
            if (key) localStorage.setItem(key, JSON.stringify(baseline));
            this._workflowBaseline = baseline;
        } catch (_) {}
        this.requestUpdate();
    }

    _clearWorkflowBaseline() {
        try {
            const key = this._workflowBaselineKey();
            if (key) localStorage.removeItem(key);
        } catch (_) {}
        this._workflowBaseline = null;
        this.requestUpdate();
    }

    _buildWorkflowDivergences(baseline, report) {
        const divergences = [];
        const currentRenders  = {};
        for (const [tag, d] of Object.entries(report.perf || {})) currentRenders[tag] = d.count || 0;

        const currentMounts = {};
        const rawMem = report.memory || {};
        for (const [tag, d] of Object.entries(rawMem)) currentMounts[tag] = d.mounted || 0;

        const allTags = new Set([...Object.keys(baseline.renders || {}), ...Object.keys(currentRenders)]);
        for (const tag of allTags) {
            const base = baseline.renders?.[tag] ?? 0;
            const curr = currentRenders[tag] ?? 0;
            if (base < 5 && curr < 5) continue; // noise filter
            if (base === 0) continue;
            const pct = Math.round(((curr - base) / base) * 100);
            if (pct >= 200) {
                divergences.push({ tag, type: 'renders', base, curr, pct, level: 'alert' });
            } else if (pct >= 50) {
                divergences.push({ tag, type: 'renders', base, curr, pct, level: 'warn' });
            } else {
                divergences.push({ tag, type: 'renders', base, curr, pct, level: 'ok' });
            }
        }

        const mountTags = new Set([...Object.keys(baseline.mounts || {}), ...Object.keys(currentMounts)]);
        for (const tag of mountTags) {
            const base = baseline.mounts?.[tag] ?? 0;
            const curr = currentMounts[tag] ?? 0;
            if (base === 0) continue;
            const pct = Math.round(((curr - base) / base) * 100);
            if (pct >= 100) {
                divergences.push({ tag, type: 'mounts', base, curr, pct, level: 'warn' });
            }
        }

        const currNetFails = (report.network || []).filter(n => n.isError).length;
        if (currNetFails > (baseline.networkFailures || 0)) {
            divergences.push({ tag: 'network', type: 'failures', base: baseline.networkFailures, curr: currNetFails, pct: null, level: 'warn' });
        }

        return divergences;
    }

    _renderWorkflowBaseline(report) {
        const bl = this._workflowBaseline;
        const open = this._baselineOpen;

        const capturedLabel = bl
            ? new Date(bl.capturedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : null;

        const divergences = bl ? this._buildWorkflowDivergences(bl, report) : [];
        const alerts = divergences.filter(d => d.level === 'alert');
        const warns  = divergences.filter(d => d.level === 'warn');

        return html`
            <div class="section-title" style="cursor:pointer;user-select:none" @click=${() => { this._baselineOpen = !this._baselineOpen; this.requestUpdate(); }}>
                ${open ? '▼' : '▶'} Workflow Baseline
                ${alerts.length ? html`<span style="color:#f38ba8;margin-left:8px">⚠ ${alerts.length} alert${alerts.length > 1 ? 's' : ''}</span>` : ''}
                ${!alerts.length && warns.length ? html`<span style="color:#f9e2af;margin-left:8px">⚠ ${warns.length} warn${warns.length > 1 ? 's' : ''}</span>` : ''}
            </div>
            ${open ? html`
                <div style="padding:8px 0 12px;border-bottom:1px solid #313244">
                    ${!bl ? html`
                        <div style="color:#6c7086;font-size:12px;margin-bottom:8px">No baseline stored for this page.</div>
                        <button class="header-btn" @click=${this._captureWorkflowBaseline}>📏 Set as baseline</button>
                    ` : html`
                        <div style="font-size:11px;color:#6c7086;margin-bottom:6px">Baseline captured: ${capturedLabel}</div>
                        ${divergences.map(d => {
                            if (d.type === 'failures') {
                                return html`<div style="font-size:12px;color:#f9e2af;margin:2px 0">⚠ network failures: ${d.curr} (baseline: ${d.base}, +${d.curr - d.base})</div>`;
                            }
                            const icon  = d.level === 'alert' ? '⚠' : d.level === 'warn' ? '⚠' : '✓';
                            const color = d.level === 'alert' ? '#f38ba8' : d.level === 'warn' ? '#f9e2af' : '#a6e3a1';
                            const note  = d.level === 'ok' ? ' — OK' : `, +${d.pct}%`;
                            return html`<div style="font-size:12px;color:${color};margin:2px 0">${icon} ${d.tag} ${d.type}: ${d.curr} (baseline: ${d.base}${note})</div>`;
                        })}
                        ${!divergences.length ? html`<div style="font-size:12px;color:#a6e3a1;margin:2px 0">✓ All metrics within baseline thresholds.</div>` : ''}
                        <button class="header-btn" style="margin-top:8px" @click=${this._clearWorkflowBaseline}>Clear baseline</button>
                        <button class="header-btn" style="margin-left:6px" @click=${this._captureWorkflowBaseline}>Update baseline</button>
                    `}
                </div>
            ` : ''}
        `;
    }

    _captureBaseline() {
        const mem = window.__LDS_MEMORY__;
        const components = {};
        if (mem instanceof Map) {
            for (const [tag, d] of mem) {
                const perf = (window.__LDS_PERF__ || {})[tag];
                components[tag] = {
                    active:     (d.mounted || 0) - (d.unmounted || 0),
                    mounted:    d.mounted || 0,
                    avgMs:      (perf && perf.count > 0) ? Math.round(perf.totalMs / perf.count) : null,
                    maxMs:      perf ? Math.round(perf.maxMs || 0) : null,
                    errorCount: (window.__LDS_ERRORS__ || []).filter(e => e.tag === tag).length,
                };
            }
        }
        this._baseline = { capturedAt: new Date().toISOString(), components };
        try { localStorage.setItem('__lds_baseline', JSON.stringify(this._baseline)); } catch (_) {}
        this.requestUpdate();
    }

    _clearBaseline() {
        this._baseline = null;
        try { localStorage.removeItem('__lds_baseline'); } catch (_) {}
        this.requestUpdate();
    }

    _snapshotForTag(tag) {
        const mem = window.__LDS_MEMORY__;
        const d   = mem instanceof Map ? mem.get(tag) : (mem || {})[tag];
        const pf  = (window.__LDS_PERF__ || {})[tag];
        return {
            active:       d ? (d.mounted || 0) - (d.unmounted || 0) : null,
            mounted:      d ? (d.mounted || 0) : null,
            avgMs:        (pf && pf.count > 0) ? Math.round(pf.totalMs / pf.count) : null,
            maxMs:        pf ? Math.round(pf.maxMs || 0) : null,
            errorCount:   (window.__LDS_ERRORS__ || []).filter(e => e.tag === tag).length,
            thrashCount:  (window.__LDS_THRASH__ || []).filter(t => t.tag === tag).length,
            networkFails: (window.__LDS_NETWORK_LOG__ || []).filter(n => n.isError).length,
        };
    }

    _buildComparison(issue, endSnap) {
        const tag      = issue.component.replace(/^<|>$/g, '');
        const baseline = this._baseline?.components?.[tag];
        const obs      = issue.observed || {};
        const metrics  = [];

        const _m = (label, bVal, aVal, lowerIsBetter = true) => {
            if (bVal == null || aVal == null || bVal === 0) return;
            const diff         = lowerIsBetter ? bVal - aVal : aVal - bVal;
            const reductionPct = Math.round(diff / bVal * 100);
            const verified     = reductionPct >= 70;
            const improved     = reductionPct > 0;
            metrics.push({ label, before: bVal, after: aVal, reductionPct, improved, verified });
        };

        switch (issue.issueType) {
            case 'memory-leak':
                _m('Active instances', baseline?.active ?? obs.active, endSnap.active);
                break;
            case 'render-storm':
                _m('Active instances', baseline?.active ?? obs.mountCount, endSnap.active);
                if (obs.avgTTIms) _m('Avg TTI (ms)', baseline?.avgMs ?? obs.avgTTIms, endSnap.avgMs);
                break;
            case 'slow-render':
                _m('Avg TTI (ms)', baseline?.avgMs ?? obs.maxMs, endSnap.avgMs);
                break;
            case 'high-avg-tti':
                _m('Avg TTI (ms)', baseline?.avgMs ?? obs.avgMs, endSnap.avgMs);
                _m('Max TTI (ms)', baseline?.maxMs ?? obs.maxMs, endSnap.maxMs);
                break;
            case 'runtime-error':
                _m('Error count', baseline?.errorCount ?? obs.errorCount, endSnap.errorCount);
                break;
            case 'network-error':
                _m('Failed requests', obs.failedCount, endSnap.networkFails);
                break;
            case 'property-thrash':
                _m('Thrash incidents', obs.maxSetCount, endSnap.thrashCount);
                break;
            default:
                _m('Active instances', baseline?.active ?? obs.active ?? obs.mountCount, endSnap.active);
                break;
        }

        const overallVerified = metrics.length > 0 && metrics.some(m => m.verified);
        return { metrics, overallVerified, comparedAt: new Date().toISOString() };
    }

    _startReplay(issue) {
        if (this._replayState?.status === 'waiting') return;
        this._replayState = { issueId: issue.id, component: issue.component.replace(/^<|>$/g, ''), status: 'waiting' };
        this.requestUpdate();
    }

    _completeReplay() {
        if (!this._replayState || this._replayState.status !== 'waiting') return;
        const tag     = this._replayState.component;
        const endSnap = this._snapshotForTag(tag);
        const issues  = _buildPinpointIssues(this._getActiveReport() || {});
        const issue   = issues.find(i => i.id === this._replayState.issueId);
        const comp    = issue ? this._buildComparison(issue, endSnap) : null;
        this._replayState = { ...this._replayState, status: 'done', endSnap, comparison: comp };
        if (comp) this._verifiedIssues = { ...this._verifiedIssues, [this._replayState.issueId]: { comparison: comp, verifiedAt: comp.comparedAt } };
        this.requestUpdate();
    }

    _cancelReplay() {
        this._replayState = null;
        this.requestUpdate();
    }

    _renderReplayBanner() {
        const rs = this._replayState;
        if (!rs) return '';
        if (rs.status === 'waiting') return html`
            <div class="replay-banner">
                <span>▶ Replaying <strong>&lt;${rs.component}&gt;</strong> — Interact with the component to reproduce the scenario, then click Done.</span>
                <button class="header-btn accent" @click=${this._completeReplay}>✓ Done</button>
                <button class="header-btn" @click=${this._cancelReplay}>✕ Cancel</button>
            </div>`;
        return html`
            <div class="replay-banner replay-done">
                ${rs.comparison?.overallVerified ? '✅ Fix Verified' : '⚠ Fix Not Confirmed'} — comparison recorded on &lt;${rs.component}&gt;.
                <button class="header-btn" @click=${()=>{ this._replayState=null; this.requestUpdate(); }}>Dismiss</button>
            </div>`;
    }

    _renderVerificationBlock(issue) {
        const v = this._verifiedIssues[issue.id];
        if (!v) return '';
        const comp = v.comparison;
        return html`
            <div class="verification-block ${comp.overallVerified ? 'verified' : 'not-verified'}">
                <div class="verify-title">${comp.overallVerified ? '✅ Fix Verified' : '⚠ Fix Not Confirmed'}</div>
                ${comp.metrics.length === 0 ? html`<div style="font-size:10px;color:#6c7086">No measurable data recorded. Ensure the component was exercised during replay.</div>` : ''}
                ${comp.metrics.map(m => html`
                    <div class="verify-row">
                        <span class="verify-label">${m.label}:</span>
                        <span class="verify-before">${m.before}</span>
                        <span style="color:#6c7086">→</span>
                        <span class="verify-after ${m.improved ? '' : 'verify-worse'}">${m.after}</span>
                        <span class="${m.verified ? 'verify-good' : m.improved ? 'verify-partial' : 'verify-bad'}">
                            ${m.verified ? '✅' : m.improved ? '↓' : '↑'} ${Math.abs(m.reductionPct)}%
                        </span>
                    </div>`)}
                <div style="color:#45475a;font-size:10px;margin-top:4px">Compared at ${new Date(comp.comparedAt).toLocaleTimeString()}</div>
            </div>`;
    }

    _exportFixTable() {
        const r = this._getActiveReport();
        if (!r) return;
        const issues       = _buildPinpointIssues(r);
        const eventsTimeline = r.eventsTimeline || [];
        const table = issues.map(i => {
            const rawStack      = (i.callStacks || [])[0] || null;
            const filteredStack = rawStack ? _filterAppStack(rawStack) : null;
            const lineNumber    = _extractLineNumber(filteredStack || rawStack);
            const related       = _findRelatedComponents(i.component, eventsTimeline);

            const readHint = lineNumber
                ? `Read ${i.filePath} lines ${Math.max(1, lineNumber - 10)} to ${lineNumber + 10} for context`
                : `Read ${i.filePath}`;

            const promptText = [
                `Fix a ${i.severity} ${i.issueType} issue in <${i.component}>.`,
                `File: ${i.filePath}${lineNumber ? ` (around line ${lineNumber})` : ''}.`,
                i.details.split('\n')[0],
                `Recommendation: ${i.recommendation}`,
                related.length ? `Related components (via events): ${related.join(', ')}.` : '',
            ].filter(Boolean).join(' ');

            const vf = this._verifiedIssues[i.id];
            const evidenceCapsule = {
                problem:        i.issueType,
                component:      i.component,
                file:           i.filePath,
                line:           lineNumber,
                evidenceLevel:  i.evidenceLevel || 'observation',
                observed:       i.observed || {},
                callStack:      filteredStack ? filteredStack.split('\n').slice(0, 6) : [],
                recommendation: i.recommendation,
                relatedComponents: related,
                claudePrompt:   promptText,
                verification:   vf ? {
                    status:     vf.comparison.overallVerified ? 'verified' : 'not-confirmed',
                    metrics:    vf.comparison.metrics,
                    comparedAt: vf.comparison.comparedAt,
                } : null,
            };

            return {
                id:                i.id,
                component:         i.component,
                filePath:          i.filePath,
                issueType:         i.issueType,
                severity:          i.severity,
                details:           i.details,
                recommendation:    i.recommendation,
                lineNumber,
                readHint,
                relatedComponents: related,
                evidenceCapsule,
                filteredCallStack: filteredStack,
                callStack:         rawStack,
                reportedAt:        r.reportTime,
                sessionId:         r.sessionId,
            };
        });
        const blob = new Blob([JSON.stringify(table, null, 2)], { type: 'application/json' });
        this._triggerBlob(blob, `lds-fix-table-${Date.now()}.json`);
    }

    // ── Render ─────────────────────────────────────────────────────────────
    render() {
        const errorCount = (window.__LDS_ERRORS__ || []).length;
        return html`
            <input id="lds-import-input" type="file" accept=".json" style="display:none" @change=${this._onImportFile}>
            <button class="trigger${errorCount > 0 ? ' has-errors' : ''}" title="LDS Debug Panel" @click=${this._togglePanel}>
                🐞${errorCount > 0 ? html`<span class="badge">${errorCount}</span>` : ''}
            </button>
            ${this._open ? html`
                <div class="backdrop" @click=${this._closePanel}></div>
                <div class="panel">
                    ${this._renderHeader()}
                    ${this._renderNoteRow()}
                    ${this._renderTabs()}
                    ${this._renderContent()}
                </div>` : ''}
        `;
    }

    _renderHeader() {
        const isHistory = this._isHistoryMode();
        const source    = isHistory ? (window.__LDS_HISTORY__||[]).find(h => h.report === this._activeReport)?.source || 'history' : null;
        return html`
            <div class="panel-header">
                <span class="panel-title">🐞 LDS Debug</span>
                ${isHistory
                    ? html`<span class="mode-badge ${source==='imported'?'imported':'history'}">${source==='imported'?'📥 IMPORTED':'📋 HISTORY'}</span>`
                    : html`<span class="session-id" title="${window.__LDS_SESSION_ID__}">${window.__LDS_SESSION_ID__}</span>`}
                ${isHistory
                    ? html`<button class="header-btn live-btn" @click=${this._backToLive}>↩ Live</button>`
                    : html`<button class="header-btn" @click=${this._refresh}>↻ Refresh</button>`}
                <button class="header-btn accent" @click=${this._triggerImport}>📥 Import</button>
                <button class="header-btn" @click=${this._download}>⬇ JSON</button>
                <button class="header-btn accent" @click=${this._downloadHtml}>📄 HTML</button>
                <button class="header-btn close" @click=${this._closePanel}>✕</button>
            </div>`;
    }

    _renderNoteRow() {
        return html`
            <div class="note-row">
                <span class="note-label">📝 Note:</span>
                <textarea class="note-input" rows="1" placeholder="Add context before downloading (e.g. 'happened on save')"
                    .value=${this._reportNote}
                    @input=${e => { this._reportNote = e.target.value; }}></textarea>
            </div>`;
    }

    _renderTabs() {
        return html`
            <div class="tabs">
                ${TABS.map(t => html`<button class="tab${this._tab===t.key?' active':''}" @click=${()=>this._setTab(t.key)}>${t.label}</button>`)}
            </div>`;
    }

    _renderContent() {
        if (!this._report && !this._activeReport) return html`<div class="tab-content"><p class="empty">Loading…</p></div>`;
        const map = {
            summary:  this._renderSummary,
            pinpoint: this._renderPinpoint,
            vitals:   this._renderVitals,
            network:  this._renderNetwork,
            falcor:   this._renderFalcor,
            perf:     this._renderPerf,
            errors:   this._renderErrors,
            console:  this._renderConsole,
            events:   this._renderEvents,
            slowapi:  this._renderSlowApi,
            memory:   this._renderMemory,
            history:  this._renderHistory,
            env:      this._renderEnv,
        };
        const fn = map[this._tab];
        return html`<div class="tab-content">${fn ? fn.call(this) : ''}</div>`;
    }

    // ── Summary ────────────────────────────────────────────────────────────
    _renderSummary() {
        const r = this._getActiveReport();
        if (!r) return html`<p class="empty">No data</p>`;
        const findings = _computeFindings(r);
        const score    = _pageHealthScore(r);
        const { grade, color } = _gradeFromScore(score);
        const env = r.environment;
        const v   = r.vitals;
        return html`
            <div class="health-block">
                <span class="health-grade" style="color:${color}">${grade}</span>
                <div><div class="health-score" style="color:${color}">${score}/100</div><div class="health-meta">Page Health</div></div>
                ${v?.lcp ? html`<div><div style="font-size:13px;font-weight:bold;color:${v.lcp.valueMs<2500?'#a6e3a1':v.lcp.valueMs<4000?'#f9e2af':'#f38ba8'}">${v.lcp.valueMs}ms</div><div class="health-meta">LCP</div></div>` : ''}
                ${v?.cls ? html`<div><div style="font-size:13px;font-weight:bold;color:${v.cls.value<0.1?'#a6e3a1':v.cls.value<0.25?'#f9e2af':'#f38ba8'}">${v.cls.value.toFixed(3)}</div><div class="health-meta">CLS</div></div>` : ''}
                ${v?.inp ? html`<div><div style="font-size:13px;font-weight:bold;color:${v.inp.valueMs<200?'#a6e3a1':v.inp.valueMs<500?'#f9e2af':'#f38ba8'}">${v.inp.valueMs}ms</div><div class="health-meta">INP</div></div>` : ''}
            </div>

            <div class="stats-row">
                <div class="stat-chip"><div class="num">${(r.errors||[]).length}</div><div class="lbl">Crashes</div></div>
                <div class="stat-chip"><div class="num">${(r.storms||[]).length}</div><div class="lbl">Storms</div></div>
                <div class="stat-chip"><div class="num">${(r.slowApi||[]).length}</div><div class="lbl">Slow APIs</div></div>
                <div class="stat-chip"><div class="num">${(r.network||[]).filter(n=>n.isError).length}</div><div class="lbl">Net Errors</div></div>
                <div class="stat-chip"><div class="num">${Object.keys(r.perf||{}).length}</div><div class="lbl">Components</div></div>
                ${(r.thrash||[]).length > 0 ? html`<div class="stat-chip"><div class="num" style="color:#fab387">${(r.thrash||[]).length}</div><div class="lbl">Prop Thrash</div></div>` : ''}
                ${(r.cycles||[]).length > 0 ? html`<div class="stat-chip"><div class="num" style="color:#f38ba8">${(r.cycles||[]).length}</div><div class="lbl">Cycles</div></div>` : ''}
                ${r.domStats ? html`<div class="stat-chip"><div class="num" style="color:${r.domStats.totalNodes>1500?'#f9e2af':'#89b4fa'}">${r.domStats.totalNodes.toLocaleString()}</div><div class="lbl">DOM Nodes</div></div>` : ''}
            </div>

            <div class="section-title">Findings</div>
            ${findings.map(f => html`<div class="finding ${f.severity}"><span>${f.icon}</span><span>${f.text}</span></div>`)}

            ${env ? html`
                <div class="section-title">Environment</div>
                ${this._kvRow('Browser', env.browser?.version || '—')}
                ${env.hardware?.deviceMemoryGB !== 'unknown' ? this._kvRow('Device RAM', `${env.hardware.deviceMemoryGB} GB`) : ''}
                ${this._kvRow('CPU cores', String(env.hardware?.cpuCores || '?'))}
                ${env.heap ? this._kvRow('JS Heap', `${env.heap.usedMB}MB used / ${env.heap.limitMB}MB limit`) : ''}
                ${env.pageLoad ? this._kvRow('Page load', `${env.pageLoad.loadMs}ms (TTFB ${env.pageLoad.ttfbMs}ms)`) : ''}` : ''}

            ${this._renderWorkflowBaseline(r)}
        `;
    }

    // ── Pinpoint ───────────────────────────────────────────────────────────
    _renderPinpoint() {
        const r = this._getActiveReport();
        if (!r) return html`<p class="empty">No data</p>`;
        const issues = _buildPinpointIssues(r);
        if (!issues.length) return html`<p class="empty">✅ No pinpointable issues.<br>Ensure perf, memory, errorBoundary, network tools are enabled.</p>`;
        const baselineLabel = this._baseline
            ? new Date(this._baseline.capturedAt).toLocaleTimeString()
            : null;
        return html`
            <div class="filter-bar" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
                <button class="stack-filter-toggle" @click=${()=>{ this._stackFilterOn=!this._stackFilterOn; }}>
                    ${this._stackFilterOn ? '📦 App frames only (click for all)' : '🌐 All frames (click for app only)'}
                </button>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                    ${baselineLabel
                        ? html`<span class="baseline-badge">📸 Baseline: ${baselineLabel}<button class="baseline-clear" @click=${this._clearBaseline} title="Clear baseline">✕</button></span>`
                        : html`<button class="header-btn" @click=${this._captureBaseline} title="Snapshot current metrics as baseline for post-fix comparison">📸 Capture Baseline</button>`}
                    <button class="header-btn accent" @click=${this._exportFixTable}>📋 Export Fix Table (${issues.length})</button>
                </div>
            </div>
            ${this._renderReplayBanner()}
            ${issues.map(i => this._renderIssueCard(i))}`;
    }

    _renderIssueCard(issue) {
        const expanded  = this._expandedIssue === issue.id;
        const stacksExp = this._expandedStacks[issue.id];
        const r         = this._getActiveReport();
        const lineNum   = _extractLineNumber(
            (issue.callStacks || [])[0] ? _filterAppStack((issue.callStacks || [])[0]) : null
        );
        const related = _findRelatedComponents(issue.component, r?.eventsTimeline || []);
        return html`
            <div class="issue-card">
                <div class="issue-header" @click=${()=>{ this._expandedIssue = expanded ? null : issue.id; }}>
                    <span class="issue-sev ${issue.severity}">${issue.severity.toUpperCase()}</span>
                    ${issue.evidenceLevel ? html`<span class="evidence-badge evl-${issue.evidenceLevel}" title="Evidence level: ${issue.evidenceLevel}">${issue.evidenceLevel}</span>` : ''}
                    ${this._verifiedIssues[issue.id]?.comparison.overallVerified ? html`<span class="fix-verified-badge">✅ VERIFIED</span>` : ''}
                    <div class="issue-info">
                        <span class="issue-component">&lt;${issue.component}&gt;</span>
                        <span class="issue-type">${issue.issueType}</span>
                        ${issue.filePath ? html`<div class="issue-filepath" title="${issue.filePath}">
                            ${issue.filePath}${lineNum ? html`<span style="color:#6c7086"> :${lineNum}</span>` : ''}
                        </div>` : ''}
                    </div>
                    <span style="color:#6c7086;font-size:14px">${expanded?'▲':'▼'}</span>
                </div>
                ${expanded ? html`
                    <div class="issue-body">
                        <div class="issue-details">${issue.details}</div>
                        <div class="issue-rec">💡 ${issue.recommendation}</div>
                        ${related.length ? html`
                            <div style="margin-top:8px;font-size:10px;color:#6c7086">Event-related components:</div>
                            <div style="margin-top:2px">${related.map(t => html`<span class="tag-pill">${t}</span>`)}</div>
                        ` : ''}
                        ${this._renderVerificationBlock(issue)}
                        <div style="margin-top:8px">
                            ${(this._replayState?.issueId !== issue.id || this._replayState?.status === 'done')
                                ? html`<button class="header-btn" style="font-size:10px;padding:2px 8px" @click=${()=>this._startReplay(issue)}>▶ Replay to verify fix</button>`
                                : html`<span style="font-size:10px;color:#a6e3a1">⏳ Replay active — click ✓ Done above when finished</span>`}
                        </div>
                        ${issue.callStacks?.length > 0 ? html`
                            <button class="stack-toggle" @click=${()=>{ this._expandedStacks={...this._expandedStacks,[issue.id]:!stacksExp}; }}>
                                ${stacksExp?'▲ Hide':'▼ Show'} call stack (${issue.callStacks.length})
                            </button>
                            ${stacksExp ? issue.callStacks.map((s,idx) => html`
                                <div style="color:#6c7086;font-size:10px;margin:2px 0">Stack #${idx+1}</div>
                                <pre class="stack-pre">${this._applyStack(s)}</pre>`) : ''}
                        ` : html`<div style="color:#45475a;font-size:10px;margin-top:6px">No call stack available</div>`}
                    </div>` : ''}
            </div>`;
    }

    // ── Vitals ─────────────────────────────────────────────────────────────
    _renderVitals() {
        const r = this._getActiveReport();
        const v = r?.vitals;
        if (!v) return html`<p class="empty">No vitals data — enable vitals tool (window.__LDS_VITALS_ENABLED__ = true)</p>`;

        const lcpClass = !v.lcp ? '' : v.lcp.valueMs < 2500 ? 'vital-good' : v.lcp.valueMs < 4000 ? 'vital-needs' : 'vital-poor';
        const clsClass = !v.cls ? '' : v.cls.value < 0.1 ? 'vital-good' : v.cls.value < 0.25 ? 'vital-needs' : 'vital-poor';
        const inpClass = !v.inp ? '' : v.inp.valueMs < 200 ? 'vital-good' : v.inp.valueMs < 500 ? 'vital-needs' : 'vital-poor';

        return html`
            <div class="vital-card">
                <div class="vital-val ${lcpClass}">${v.lcp ? `${v.lcp.valueMs}ms` : '—'}</div>
                <div class="vital-info"><div class="vital-name">LCP — Largest Contentful Paint</div><div class="vital-desc">Good &lt;2500ms · Needs improvement &lt;4000ms · Poor ≥4000ms${v.lcp?.element ? ` · Element: &lt;${v.lcp.element}&gt;` : ''}</div></div>
            </div>
            <div class="vital-card">
                <div class="vital-val ${clsClass}">${v.cls ? v.cls.value.toFixed(3) : '—'}</div>
                <div class="vital-info"><div class="vital-name">CLS — Cumulative Layout Shift</div><div class="vital-desc">Good &lt;0.1 · Needs improvement &lt;0.25 · Poor ≥0.25 · ${v.cls?.entries?.length || 0} shift event(s)</div></div>
            </div>
            <div class="vital-card">
                <div class="vital-val ${inpClass}">${v.inp ? `${v.inp.valueMs}ms` : '—'}</div>
                <div class="vital-info"><div class="vital-name">INP — Interaction to Next Paint</div><div class="vital-desc">Good &lt;200ms · Needs improvement &lt;500ms · Poor ≥500ms${v.inp?.eventType ? ` · Event: ${v.inp.eventType}` : ''}</div></div>
            </div>

            <div class="section-title">Long Tasks (${(v.longTasks||[]).length})</div>
            ${!(v.longTasks||[]).length ? html`<p class="empty">No long tasks recorded</p>` : html`
                <table>
                    <thead><tr><th>Duration ms</th><th>Time</th></tr></thead>
                    <tbody>${(v.longTasks||[]).slice().reverse().slice(0,50).map(t => html`
                        <tr><td class="${t.durationMs>150?'slow':''}">${t.durationMs}</td><td>${(t.ts||'').slice(11,19)}</td></tr>`)}</tbody>
                </table>`}
        `;
    }

    // ── Network ────────────────────────────────────────────────────────────
    _renderNetwork() {
        const r   = this._getActiveReport();
        const all = r?.network || [];
        if (!all.length) return html`<p class="empty">No network data — enable network tool (window.__LDS_NETWORK_ENABLED__ = true)</p>`;

        const f        = this._networkFilter;
        const searchLc = f.search.toLowerCase();
        const filtered = all.slice().reverse().filter(n => {
            if (f.status === 'error'   && !n.isError)  return false;
            if (f.status === 'slow'    && !n.isSlow)   return false;
            if (f.status === 'large'   && !n.isLarge)  return false;
            if (f.status === 'decoded' && !n.decoded)  return false;
            if (searchLc) {
                const urlMatch  = n.url?.toLowerCase().includes(searchLc);
                const decMatch  = n.decoded ? JSON.stringify(n.decoded).toLowerCase().includes(searchLc) : false;
                if (!urlMatch && !decMatch) return false;
            }
            return true;
        }).slice(0, 100);

        const errCount     = all.filter(n => n.isError).length;
        const slowCount    = all.filter(n => n.isSlow).length;
        const largeCount   = all.filter(n => n.isLarge).length;
        const decodedCount = all.filter(n => n.decoded).length;

        return html`
            <div class="filter-bar">
                <select class="filter-select" .value=${f.status} @change=${e=>{ this._networkFilter={...f,status:e.target.value}; this._expandedNetIdx=null; }}>
                    <option value="all">All (${all.length})</option>
                    <option value="error">Errors (${errCount})</option>
                    <option value="slow">Slow (${slowCount})</option>
                    <option value="large">Large (${largeCount})</option>
                    ${decodedCount > 0 ? html`<option value="decoded">Decoded (${decodedCount})</option>` : ''}
                </select>
                <input class="filter-input" type="text" placeholder="Filter URL or decoded content…"
                    .value=${f.search} @input=${e=>{ this._networkFilter={...f,search:e.target.value}; this._expandedNetIdx=null; }}>
            </div>
            <table>
                <thead><tr><th>Method</th><th>URL / Decoded</th><th>Status</th><th>ms</th><th>KB</th><th>Type</th><th></th></tr></thead>
                <tbody>${filtered.map((n, idx) => {
                    const dc    = n.decoded;
                    const isExp = this._expandedNetIdx === idx;
                    const rowCls = n.isError ? 'slow' : n.isSlow ? 'warn-cell' : '';
                    return html`
                    <tr style="cursor:pointer" @click=${() => { this._expandedNetIdx = isExp ? null : idx; }}>
                        <td>${n.method}</td>
                        <td class="${rowCls}" style="max-width:220px">
                            ${dc ? html`
                                <div style="color:#cba6f7;font-weight:bold;font-size:11px">${dc.operation || dc.method || '?'}${dc.domain ? html` <span style="color:#6c7086;font-weight:normal">· ${dc.domain}</span>` : ''}</div>
                                <div style="color:#89b4fa;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dc.callPath || ''}</div>
                                ${dc.types?.length ? html`<div>${dc.types.slice(0,4).map(t => html`<span class="tag-pill">${t}</span>`)}</div>` : ''}
                            ` : html`
                                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;font-size:11px" title="${n.fullUrl||n.url}">${n.url}</span>
                            `}
                        </td>
                        <td class="${n.isError?'slow':''}">${n.status || (n.error ? 'ERR' : '—')}</td>
                        <td class="${n.isSlow?'slow':''}">${n.durationMs}</td>
                        <td class="${n.isLarge?'warn-cell':''}">${n.responseSizeKB != null ? n.responseSizeKB : '—'}</td>
                        <td style="color:${dc?'#cba6f7':'#6c7086'}">${dc ? 'decoded' : n.type}</td>
                        <td style="color:#6c7086;font-size:11px;text-align:center">${isExp ? '▲' : '▼'}</td>
                    </tr>
                    ${isExp ? html`<tr><td colspan="7" style="padding:0">${this._renderNetExpand(n)}</td></tr>` : ''}`;
                })}</tbody>
            </table>`;
    }

    _renderNetExpand(n) {
        const dc = n.decoded;
        const kv = (k, v) => v != null ? html`
            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                <span class="net-kv-key">${k}</span><span class="net-kv-val">${v}</span>
            </div>` : '';

        return html`
            <div class="net-expand">
                ${dc ? html`
                    <div class="decoded-section">
                        <div class="decoded-header">🔮 Decoded Request</div>
                        ${kv('Call path',    dc.callPath)}
                        ${kv('Path segments', dc.callPathArr?.join(' → '))}
                        ${kv('Method',       dc.method)}
                        ${kv('Operation',    dc.operation)}
                        ${kv('Domain',       dc.domain)}
                        ${kv('App',          dc.appName)}
                        ${dc.types?.length ? html`
                            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                                <span class="net-kv-key">Entity types</span>
                                <span class="net-kv-val">${dc.types.map(t => html`<span class="tag-pill">${t}</span>`)}</span>
                            </div>` : ''}
                        ${dc.options ? html`
                            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                                <span class="net-kv-key">Pagination</span>
                                <span class="net-kv-val" style="color:#f9e2af">from ${dc.options.from ?? '?'} · to ${dc.options.to ?? '?'} · maxRecords ${dc.options.maxRecords ?? '?'}</span>
                            </div>` : ''}
                        ${dc.sort?.length ? html`
                            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                                <span class="net-kv-key">Sort</span>
                                <span class="net-kv-val">${dc.sort.map(s => `${s.field} ${s.dir}${s.type ? ` (${s.type})` : ''}`).join(', ')}</span>
                            </div>` : ''}
                        ${dc.filters ? html`
                            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                                <span class="net-kv-key">Extra filters</span>
                                <span class="net-kv-val" style="font-size:10px;color:#6c7086">${JSON.stringify(dc.filters).slice(0, 200)}</span>
                            </div>` : ''}
                    </div>
                ` : ''}

                <div style="color:#89b4fa;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px${dc ? ';margin-top:10px' : ''}">Request Details</div>
                ${kv('Full URL', html`<span style="word-break:break-all;font-size:10px">${n.fullUrl || n.url}</span>`)}
                ${kv('Timestamp', n.ts?.slice(0, 19).replace('T', ' '))}
                ${kv('Duration', html`<span class="${n.isSlow ? 'slow' : ''}">${n.durationMs}ms${n.isSlow ? ' ⚠️ slow' : ''}</span>`)}
                ${kv('Response size', n.responseSizeKB != null ? `${n.responseSizeKB} KB${n.isLarge ? ' ⚠️ large' : ''}` : 'unknown')}
                ${n.error ? html`
                    <div style="display:flex;gap:8px;padding:3px 0">
                        <span class="net-kv-key" style="color:#f38ba8">Error</span>
                        <span class="net-kv-val" style="color:#f38ba8">${n.error}</span>
                    </div>` : ''}
            </div>`;
    }

    // ── Falcor ─────────────────────────────────────────────────────────────
    _renderFalcor() {
        const r   = this._getActiveReport();
        const all = r?.network || [];
        const falcorAll = all.filter(n => n.decoded?.protocol === 'falcor');

        if (!all.length) {
            return html`<p class="empty">No network data — enable network tool first: <code>window.__LDS_NETWORK_ENABLED__ = true</code></p>`;
        }
        if (!falcorAll.length) {
            return html`<p class="empty">No Falcor calls captured yet. Enable network monitoring and navigate to a page that loads entity data.</p>`;
        }

        // ── helpers ──────────────────────────────────────────────────────
        const finalizeBurst = (g) => {
            const dis = new Set(); const ets = new Set(); let totalMs = 0;
            for (const c of g.calls) {
                if (c.decoded?.dataIndex) dis.add(c.decoded.dataIndex);
                (c.decoded?.entityTypes || []).forEach(t => ets.add(t));
                totalMs += c.durationMs || 0;
            }
            return { calls: g.calls, totalMs, dataIndexes: [...dis], entityTypes: [...ets] };
        };

        const getBurstGroups = (log) => {
            const BURST = 200;
            const sorted = log.slice().sort((a, b) => {
                const ta = a.ts ? new Date(a.ts).getTime() : 0;
                const tb = b.ts ? new Date(b.ts).getTime() : 0;
                return ta - tb;
            });
            const groups = [];
            let cur = null;
            for (const e of sorted) {
                const ms = e.ts ? new Date(e.ts).getTime() : 0;
                if (!cur || ms - cur._last > BURST) {
                    if (cur) groups.push(finalizeBurst(cur));
                    cur = { calls: [e], _last: ms };
                } else {
                    cur.calls.push(e);
                    cur._last = ms;
                }
            }
            if (cur) groups.push(finalizeBurst(cur));
            return groups.reverse();
        };

        const getDataIndexGroups = (log) => {
            const out = {};
            for (const e of log) {
                const di = e.decoded?.dataIndex || 'unknown';
                if (!out[di]) out[di] = [];
                out[di].push(e);
            }
            return out;
        };

        const getSearchSessions = (log) => {
            const calls = log.filter(e => e.decoded?.isSearch && e.decoded?.method === 'call');
            const gets  = log.filter(e => e.decoded?.isSearch && e.decoded?.method !== 'call');
            return calls.map((c, i) => {
                const cMs = c.ts ? new Date(c.ts).getTime() : 0;
                const linked = gets.filter(g => g.decoded?.dataIndex === c.decoded?.dataIndex && new Date(g.ts||0).getTime() >= cMs);
                const rid = linked[0]?.decoded?.searchRequestId || null;
                return { sessionId: i, initiateCall: c, resultCalls: rid ? linked.filter(g=>g.decoded?.searchRequestId===rid) : linked.slice(0,10), requestId: rid };
            });
        };

        // ── session-wide analytics (computed once) ───────────────────────
        let totalPaths = 0; const diCounts = {};
        const fieldFreq = {}; const etFreq = {};
        const pathKeyCount = {};   // for duplicate detection
        for (const e of falcorAll) {
            totalPaths += e.decoded?.pathCount || 0;
            const di = e.decoded?.dataIndex || 'unknown';
            diCounts[di] = (diCounts[di] || 0) + 1;
            (e.decoded?.fields      ||[]).forEach(f=>{ fieldFreq[f]=(fieldFreq[f]||0)+1; });
            (e.decoded?.entityTypes ||[]).forEach(t=>{ etFreq[t]=(etFreq[t]||0)+1; });
            (e.decoded?.paths       ||[]).forEach(p=>{ const k=JSON.stringify(p); pathKeyCount[k]=(pathKeyCount[k]||0)+1; });
        }
        const diList    = Object.keys(diCounts).sort();
        const topFields = Object.entries(fieldFreq).sort((a,b)=>b[1]-a[1]).slice(0,10);
        const topTypes  = Object.entries(etFreq).sort((a,b)=>b[1]-a[1]).slice(0,8);
        const dupePaths = Object.keys(pathKeyCount).filter(k=>pathKeyCount[k]>1).length;

        // ── filter ───────────────────────────────────────────────────────
        const search = this._falcorPathSearch.toLowerCase();
        const filtered = falcorAll.filter(e => {
            if (this._falcorDiFilter !== 'all' && e.decoded?.dataIndex !== this._falcorDiFilter) return false;
            if (search) {
                const dc = e.decoded;
                const hay = [dc?.dataIndex, ...(dc?.entityTypes||[]), ...(dc?.fields||[]), ...(dc?.entityIds||[])].join(' ').toLowerCase();
                if (!hay.includes(search) && !e.url?.toLowerCase().includes(search)) return false;
            }
            return true;
        });

        // ── render helpers ────────────────────────────────────────────────
        const pill = (t, color='#cba6f7') => html`<span class="tag-pill" style="background:${color}20;color:${color};border:1px solid ${color}40">${t}</span>`;

        // dupeCount for a single call: how many of its paths were seen in other calls
        const callDupes = (entry) => (entry.decoded?.paths||[]).filter(p=>pathKeyCount[JSON.stringify(p)]>1).length;

        const renderCallRow = (entry, callKey, offsetMs) => {
            const dc      = entry.decoded;
            const isExp   = this._falcorExpandedCall === callKey;
            const ms      = entry.durationMs || 0;
            const msColor = ms > 1000 ? '#f38ba8' : ms > 500 ? '#f9e2af' : '#a6e3a1';
            const dupes   = callDupes(entry);
            const idCount = dc?.entityIds?.length || 0;
            return html`
            <div style="border-bottom:1px solid #1a1a28;padding:5px 0;cursor:pointer" @click=${()=>{ this._falcorExpandedCall = isExp ? null : callKey; }}>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span style="color:#a6e3a1;font-size:10px;font-weight:bold;min-width:28px">${(dc?.method||'?').toUpperCase()}</span>
                    <span style="color:#89b4fa;font-size:11px;font-weight:bold">${dc?.dataIndex || '?'}</span>
                    <span style="color:${msColor};font-size:10px;font-weight:bold">${ms}ms</span>
                    ${offsetMs != null ? html`<span style="color:#6c7086;font-size:10px">+${offsetMs}ms</span>` : ''}
                    <span style="color:#6c7086;font-size:10px">${dc?.pathCount||0}p</span>
                    ${idCount ? html`<span style="color:#f9e2af;font-size:10px">${idCount} ID${idCount===1?'':'s'}</span>` : ''}
                    ${dupes ? html`<span style="color:#fab387;font-size:10px" title="${dupes} paths seen in other calls">⚠ ${dupes} dup${dupes===1?'':'s'}</span>` : ''}
                    ${(dc?.entityTypes||[]).map(t=>pill(t))}
                    ${entry.responseSizeKB != null ? html`<span style="color:#6c7086;font-size:10px;margin-left:auto">${entry.responseSizeKB}KB</span>` : ''}
                    <span style="color:#6c7086;font-size:11px">${isExp?'▲':'▼'}</span>
                </div>
                ${isExp ? html`
                <div style="background:#0d0d1a;border-radius:4px;margin-top:6px;padding:8px;font-size:11px">
                    ${dc?.entityIds?.length ? html`
                    <div style="margin-bottom:6px">
                        <span style="color:#6c7086">Entity IDs (${dc.entityIds.length}): </span>
                        <span style="color:#f9e2af;font-size:10px;word-break:break-all">${dc.entityIds.slice(0,12).join(', ')}${dc.entityIds.length>12?` … +${dc.entityIds.length-12} more`:''}</span>
                    </div>` : ''}
                    ${dc?.fields?.length ? html`
                    <div style="margin-bottom:6px">
                        <span style="color:#6c7086">Fields (${dc.fields.length}): </span>
                        ${dc.fields.map(f => {
                            const fc = fieldFreq[f]||0;
                            return html`<span class="tag-pill" style="background:#89b4fa20;color:#89b4fa;border:1px solid #89b4fa40">${f}${fc>1?html` <span style="color:#6c7086">${fc}×</span>`:''}` + '</span>';
                        })}
                    </div>` : ''}
                    ${dc?.paths?.length ? html`
                    <div style="margin-top:4px">
                        <div style="color:#6c7086;font-size:10px;margin-bottom:4px">${dc.paths.length} path${dc.paths.length===1?'':'s'}:</div>
                        ${dc.paths.slice(0,20).map((p,i) => {
                            const k=JSON.stringify(p); const isDup=(pathKeyCount[k]||0)>1;
                            return html`<div style="font-size:10px;padding:2px 0;border-bottom:1px solid #1a1a2810;color:${isDup?'#fab387':'#cdd6f4'}">
                                <span style="color:#6c7086;margin-right:6px">${i}</span>${k}${isDup?html` <span style="color:#fab387;font-size:9px">DUP</span>`:''}
                            </div>`;
                        })}
                        ${dc.paths.length>20 ? html`<div style="color:#6c7086;font-size:10px;margin-top:2px">… ${dc.paths.length-20} more</div>` : ''}
                    </div>` : ''}
                    <div style="margin-top:6px;color:#6c7086;font-size:10px;display:flex;gap:12px">
                        <span>${entry.ts?.slice(11,19)||'?'}</span>
                        ${entry.responseSizeKB!=null?html`<span>${entry.responseSizeKB} KB</span>`:''}
                        ${entry.error?html`<span style="color:#f38ba8">${entry.error}</span>`:''}
                    </div>
                </div>` : ''}
            </div>`;
        };

        // ── view mode buttons ─────────────────────────────────────────────
        const viewBtn = (key, label) => html`
            <button class="tab${this._falcorViewMode===key?' active':''}" style="font-size:11px;padding:4px 10px"
                @click=${()=>{ this._falcorViewMode=key; this._falcorExpandedGrp=null; this._falcorExpandedCall=null; }}>
                ${label}
            </button>`;

        let content;

        if (this._falcorViewMode === 'grouped') {
            const groups = getBurstGroups(filtered);
            if (!groups.length) {
                content = html`<p class="empty">No Falcor calls match current filter.</p>`;
            } else {
                content = groups.map((g, gi) => {
                    const isOpen   = this._falcorExpandedGrp === gi;
                    const msColor  = g.totalMs > 2000 ? '#f38ba8' : g.totalMs > 800 ? '#f9e2af' : '#a6e3a1';
                    // burst start ms for relative offsets
                    const bStartMs = g.calls.reduce((mn,c)=>{ const t=c.ts?new Date(c.ts).getTime():0; return t<mn?t:mn; }, Infinity);
                    // dataIndex breakdown: entityData×3, entityGovernData×2
                    const diBreak  = {}; g.calls.forEach(c=>{ const d=c.decoded?.dataIndex||'?'; diBreak[d]=(diBreak[d]||0)+1; });
                    // unique entity IDs across burst
                    const burstIds = new Set(); g.calls.forEach(c=>(c.decoded?.entityIds||[]).forEach(id=>burstIds.add(id)));
                    // total duplicate paths in burst
                    const burstDupes = g.calls.reduce((s,c)=>s+callDupes(c),0);
                    // parallel vs sequential: are all calls within 100ms of each other?
                    const callTimes = g.calls.map(c=>c.ts?new Date(c.ts).getTime():0);
                    const isParallel = g.calls.length > 1 && (Math.max(...callTimes) - Math.min(...callTimes)) < 100;
                    return html`
                    <div style="border:1px solid #313244;border-radius:6px;margin-bottom:6px">
                        <div style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap"
                            @click=${()=>{ this._falcorExpandedGrp = isOpen ? null : gi; this._falcorExpandedCall=null; }}>
                            <span style="color:#cba6f7;font-weight:bold;font-size:11px">Burst ${gi+1}</span>
                            <span style="color:${msColor};font-size:11px;font-weight:bold">${g.totalMs}ms</span>
                            ${Object.entries(diBreak).map(([di,cnt])=>pill(`${di}×${cnt}`,'#89dceb'))}
                            ${burstIds.size ? html`<span style="color:#f9e2af;font-size:10px">${burstIds.size} ID${burstIds.size===1?'':'s'}</span>` : ''}
                            ${isParallel ? html`<span style="color:#a6e3a1;font-size:10px">parallel</span>` : g.calls.length>1 ? html`<span style="color:#f9e2af;font-size:10px">sequential</span>` : ''}
                            ${burstDupes ? html`<span style="color:#fab387;font-size:10px">⚠ ${burstDupes} dup path${burstDupes===1?'':'s'}</span>` : ''}
                            <span style="color:#6c7086;font-size:11px;margin-left:auto">${isOpen?'▲':'▼'}</span>
                        </div>
                        ${isOpen ? html`
                        <div style="padding:0 12px 10px">
                            ${g.calls.map((c,ci) => {
                                const cMs = c.ts?new Date(c.ts).getTime():0;
                                return renderCallRow(c, `${gi}-${ci}`, bStartMs===Infinity?null:cMs-bStartMs);
                            })}
                        </div>` : ''}
                    </div>`;
                });
            }
        } else if (this._falcorViewMode === 'dataindex') {
            const groups = getDataIndexGroups(filtered);
            content = Object.entries(groups).sort((a,b)=>b[1].length-a[1].length).map(([di, calls]) => {
                const isOpen  = this._falcorExpandedGrp === di;
                const totalMs = calls.reduce((s,c)=>s+(c.durationMs||0),0);
                const totalP  = calls.reduce((s,c)=>s+(c.decoded?.pathCount||0),0);
                const totalId = new Set(calls.flatMap(c=>c.decoded?.entityIds||[])).size;
                const msColor = totalMs > 3000 ? '#f38ba8' : totalMs > 1000 ? '#f9e2af' : '#a6e3a1';
                return html`
                <div style="border:1px solid #313244;border-radius:6px;margin-bottom:6px">
                    <div style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap"
                        @click=${()=>{ this._falcorExpandedGrp = isOpen ? null : di; this._falcorExpandedCall=null; }}>
                        ${pill(di,'#89dceb')}
                        <span style="color:#6c7086;font-size:11px">${calls.length} call${calls.length===1?'':'s'}</span>
                        <span style="color:#6c7086;font-size:11px">${totalP} paths</span>
                        ${totalId ? html`<span style="color:#f9e2af;font-size:10px">${totalId} unique ID${totalId===1?'':'s'}</span>` : ''}
                        <span style="color:${msColor};font-size:11px;font-weight:bold">${totalMs}ms</span>
                        <span style="color:#6c7086;font-size:11px;margin-left:auto">${isOpen?'▲':'▼'}</span>
                    </div>
                    ${isOpen ? html`
                    <div style="padding:0 12px 10px">
                        ${calls.map((c,ci) => renderCallRow(c, `di-${di}-${ci}`, null))}
                    </div>` : ''}
                </div>`;
            });
        } else {
            const sessions = getSearchSessions(filtered);
            if (!sessions.length) {
                content = html`<p class="empty">No search sessions detected. Search sessions require a Falcor CALL to searchResults.create followed by paginated GETs.</p>`;
            } else {
                content = sessions.map((s, si) => {
                    const isOpen = this._falcorExpandedGrp === si;
                    const totalMs = (s.initiateCall.durationMs||0) + s.resultCalls.reduce((sum,c)=>sum+(c.durationMs||0),0);
                    return html`
                    <div style="border:1px solid #313244;border-radius:6px;margin-bottom:6px">
                        <div style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap"
                            @click=${()=>{ this._falcorExpandedGrp = isOpen ? null : si; this._falcorExpandedCall=null; }}>
                            <span style="color:#cba6f7;font-weight:bold;font-size:11px">Search ${si+1}</span>
                            ${s.requestId ? html`<span style="color:#f9e2af;font-size:10px">${s.requestId.slice(0,16)}…</span>` : ''}
                            <span style="color:#6c7086;font-size:11px">${s.resultCalls.length} page${s.resultCalls.length===1?'':'s'}</span>
                            <span style="color:#a6e3a1;font-size:11px">${totalMs}ms total</span>
                            <span style="color:#6c7086;font-size:11px;margin-left:auto">${isOpen?'▲':'▼'}</span>
                        </div>
                        ${isOpen ? html`
                        <div style="padding:0 12px 10px">
                            <div style="color:#a6e3a1;font-size:10px;padding:4px 0">CALL — searchResults.create</div>
                            ${renderCallRow(s.initiateCall, `s-${si}-init`, null)}
                            ${s.resultCalls.length ? html`<div style="color:#89b4fa;font-size:10px;padding:6px 0 4px">GET — result pages</div>` : ''}
                            ${s.resultCalls.map((c,ci) => renderCallRow(c, `s-${si}-r${ci}`, null))}
                        </div>` : ''}
                    </div>`;
                });
            }
        }

        return html`
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;flex-wrap:wrap;border-bottom:1px solid #313244;margin-bottom:8px">
                <div class="tabs" style="margin:0">
                    ${viewBtn('grouped','Grouped')}
                    ${viewBtn('dataindex','By DataIndex')}
                    ${viewBtn('search','Search Sessions')}
                </div>
                <span style="color:#6c7086;font-size:11px;margin-left:8px">${falcorAll.length} calls · ${totalPaths} paths · ${diList.length} dataIndex${diList.length===1?'':'es'}${dupePaths?html` · <span style="color:#fab387">${dupePaths} dup path${dupePaths===1?'':'s'}</span>`:''}
                </span>
            </div>
            <div class="filter-bar">
                <select class="filter-select" .value=${this._falcorDiFilter} @change=${e=>{ this._falcorDiFilter=e.target.value; this._falcorExpandedGrp=null; this._falcorExpandedCall=null; }}>
                    <option value="all">All dataIndexes</option>
                    ${diList.map(di=>html`<option value="${di}">${di} (${diCounts[di]})</option>`)}
                </select>
                <input class="filter-input" type="text" placeholder="Filter by entityType, field, entityId…"
                    .value=${this._falcorPathSearch}
                    @input=${e=>{ this._falcorPathSearch=e.target.value; this._falcorExpandedGrp=null; this._falcorExpandedCall=null; }}>
            </div>
            <div style="padding:4px 0">${content}</div>
            <div style="border-top:1px solid #313244;margin-top:8px;padding-top:8px">
                <div style="color:#6c7086;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Session analytics</div>
                ${topTypes.length ? html`
                <div style="margin-bottom:6px;display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap">
                    <span style="color:#6c7086;font-size:10px;min-width:90px;padding-top:2px">Entity types:</span>
                    <div style="display:flex;flex-wrap:wrap;gap:3px">${topTypes.map(([t,c])=>html`<span class="tag-pill">${t} <span style="color:#6c7086">${c}×</span></span>`)}</div>
                </div>` : ''}
                ${topFields.length ? html`
                <div style="margin-bottom:6px;display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap">
                    <span style="color:#6c7086;font-size:10px;min-width:90px;padding-top:2px">Top fields:</span>
                    <div style="display:flex;flex-wrap:wrap;gap:3px">${topFields.map(([f,c])=>html`<span class="tag-pill" style="background:#89b4fa20;color:#89b4fa;border:1px solid #89b4fa40">${f} <span style="color:#6c7086">${c}×</span></span>`)}</div>
                </div>` : ''}
                ${dupePaths ? html`
                <div style="display:flex;align-items:center;gap:6px;padding:4px 0">
                    <span style="color:#fab387;font-size:10px">⚠ ${dupePaths} duplicate path${dupePaths===1?'':'s'} detected — same data requested in multiple separate calls. Consider batching these.</span>
                </div>` : html`
                <div style="color:#a6e3a1;font-size:10px">No duplicate paths — all requests are unique.</div>`}
            </div>`;
    }

    // ── Performance ────────────────────────────────────────────────────────
    _renderPerf() {
        const r = this._getActiveReport();
        if (!r) return html`<p class="empty">No data</p>`;
        const entries = Object.entries(r.perf||{}).sort((a,b)=>b[1].totalMs/b[1].count - a[1].totalMs/a[1].count);
        if (!entries.length) return html`<p class="empty">No data — enable perf tool and remount components</p>`;
        const reasons = r.renderReasons || {};
        return html`
            <table>
                <thead><tr><th>Component</th><th>Renders</th><th>Avg ms</th><th>Max ms</th><th>Min ms</th><th>Health</th><th></th></tr></thead>
                <tbody>${entries.map(([tag,d]) => {
                    const avg = Math.round(d.totalMs/d.count);
                    const hs  = _componentHealthScore(tag, r);
                    const { grade: hg, color: hc } = _gradeFromScore(hs);
                    const tagReasons = (reasons[tag] || []).slice(-10).reverse();
                    const isExpanded = this._expandedPerfTag === tag;
                    const thrashProps = (r.thrash || []).filter(t => t.tag === tag).map(t => t.prop);
                    return html`
                        <tr style="cursor:${tagReasons.length ? 'pointer' : 'default'}" @click=${() => { this._expandedPerfTag = isExpanded ? null : tag; }}>
                            <td>&lt;${tag}&gt;${thrashProps.length ? html` <span title="Property thrash: ${thrashProps.join(', ')}" style="color:#fab387;font-size:10px">🔄</span>` : ''}</td>
                            <td>${d.count}</td>
                            <td class="${avg>500?'slow':''}">${avg}</td>
                            <td class="${d.maxMs>1000?'slow':''}">${Math.round(d.maxMs)}</td>
                            <td>${d.minMs===Infinity?'-':Math.round(d.minMs)}</td>
                            <td style="color:${hc};font-weight:bold">${hg}</td>
                            <td style="color:#6c7086;font-size:11px">${tagReasons.length ? (isExpanded ? '▲' : '▼') : ''}</td>
                        </tr>
                        ${isExpanded && tagReasons.length ? html`
                        <tr><td colspan="7" style="padding:0">
                            <div style="background:#13131f;border-top:1px solid #313244;padding:8px 12px">
                                <div style="color:#89b4fa;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Last ${tagReasons.length} changes that triggered updates</div>
                                <table style="margin:0">
                                    <thead><tr><th>Property</th><th>Old value</th><th>New value</th><th>Same ref?</th><th>Time</th></tr></thead>
                                    <tbody>${tagReasons.map(rr => html`<tr>
                                        <td style="color:#cba6f7">.${rr.prop}</td>
                                        <td style="color:#f38ba8;font-size:10px">${rr.oldSummary}</td>
                                        <td style="color:#a6e3a1;font-size:10px">${rr.newSummary}</td>
                                        <td style="color:${rr.sameRef ? '#f38ba8' : '#6c7086'};font-size:10px">${rr.sameRef ? '⚠️ yes' : 'no'}</td>
                                        <td>${(rr.ts||'').slice(11,19)}</td>
                                    </tr>`)}</tbody>
                                </table>
                            </div>
                        </td></tr>` : ''}`;
                })}</tbody>
            </table>`;
    }

    // ── Errors ─────────────────────────────────────────────────────────────
    _renderErrors() {
        const r = this._getActiveReport();
        if (!r) return html`<p class="empty">No data</p>`;
        const f = this._errorFilter;
        const errors = (r.errors||[]).filter(e =>
            !f.search || e.message?.toLowerCase().includes(f.search.toLowerCase()) || e.tag?.toLowerCase().includes(f.search.toLowerCase())
        );
        return html`
            <div class="filter-bar">
                <input class="filter-input" type="text" placeholder="Filter by component or message…" .value=${f.search} @input=${e=>{ this._errorFilter={...f,search:e.target.value}; }}>
            </div>
            ${!errors.length ? html`<p class="empty">${(r.errors||[]).length ? 'No matches' : 'No crashes ✅'}</p>` : html`
            <table>
                <thead><tr><th>Component</th><th>Phase</th><th>Message</th><th>Time</th></tr></thead>
                <tbody>${errors.map(e => html`<tr>
                    <td>&lt;${e.tag}&gt;</td><td>${e.phase}</td>
                    <td title="${e.stack||''}">${e.message}</td>
                    <td>${(e.ts||'').slice(11,19)}</td>
                </tr>`)}</tbody>
            </table>`}`;
    }

    // ── Console ────────────────────────────────────────────────────────────
    _renderConsole() {
        const r = this._getActiveReport();
        if (!r) return html`<p class="empty">No data</p>`;
        const f = this._consoleFilter;
        const entries = (r.console||[]).filter(e => {
            if (f.level !== 'all' && e.level !== f.level) return false;
            if (f.search && !e.message?.toLowerCase().includes(f.search.toLowerCase())) return false;
            return true;
        }).slice().reverse();

        const errCount  = (r.console||[]).filter(e=>e.level==='error').length;
        const warnCount = (r.console||[]).filter(e=>e.level==='warn').length;

        return html`
            <div class="filter-bar">
                <select class="filter-select" .value=${f.level} @change=${e=>{ this._consoleFilter={...f,level:e.target.value}; }}>
                    <option value="all">All (${(r.console||[]).length})</option>
                    <option value="error">Error (${errCount})</option>
                    <option value="warn">Warn (${warnCount})</option>
                </select>
                <input class="filter-input" type="text" placeholder="Filter message…" .value=${f.search} @input=${e=>{ this._consoleFilter={...f,search:e.target.value}; }}>
            </div>
            ${!entries.length ? html`<p class="empty">No entries match</p>` :
                entries.map(e => html`<div class="log-entry">
                    <span class="level-badge ${e.level}">${e.level}</span>
                    <span class="log-msg">${e.message}</span>
                    <span class="log-ts">${(e.ts||'').slice(11,19)}</span>
                </div>`)}`;
    }

    // ── Events Timeline / Frequency ────────────────────────────────────────
    _renderEvents() {
        const r = this._getActiveReport();
        if (!r) return html`<p class="empty">No data</p>`;

        const hasTimeline = (r.eventsTimeline||[]).length > 0;
        const hasFreq     = r.eventsFreq && Object.keys(r.eventsFreq).length > 0;

        if (!hasTimeline && !hasFreq) return html`<p class="empty">No events recorded — set window.__LDS_EVENTS_TRACE__ = true, or wire your event bus with LdsEventTracer.patchDispatch()</p>`;

        return html`
            <div class="filter-bar" style="margin-bottom:10px">
                <button class="header-btn${this._eventsView==='timeline'?' accent':''}" @click=${()=>{ this._eventsView='timeline'; }}>📋 Timeline (${(r.eventsTimeline||[]).length})</button>
                <button class="header-btn${this._eventsView==='freq'?' accent':''}" @click=${()=>{ this._eventsView='freq'; }}>📊 Frequency (${hasFreq ? Object.keys(r.eventsFreq).length : 0})</button>
            </div>
            ${this._eventsView === 'freq' ? this._renderEventsFreq(r) : this._renderEventsTimeline(r)}`;
    }

    _renderEventsTimeline(r) {
        const entries = (r.eventsTimeline||[]).slice(-100).reverse();
        if (!entries.length) return html`<p class="empty">No timeline entries</p>`;
        return html`
            <table>
                <thead><tr><th>#</th><th>Event</th><th>From</th><th>+ms</th></tr></thead>
                <tbody>${entries.map(e => html`<tr>
                    <td>${e.seq??''}</td>
                    <td>${e.name??JSON.stringify(e).slice(0,60)}</td>
                    <td style="color:#6c7086;font-size:10px">${e.from ? `<${e.from}>` : '—'}</td>
                    <td>${e.elapsed!=null?e.elapsed:''}</td>
                </tr>`)}</tbody>
            </table>`;
    }

    _renderEventsFreq(r) {
        const freq    = r.eventsFreq || {};
        const entries = Object.entries(freq).sort((a,b)=>b[1].count-a[1].count);
        if (!entries.length) return html`<p class="empty">No frequency data</p>`;
        return html`
            <table>
                <thead><tr><th>Event</th><th>Count</th><th>Sources</th></tr></thead>
                <tbody>${entries.map(([name, d]) => {
                    const hot = d.count > 20;
                    return html`<tr>
                        <td style="color:${hot?'#f38ba8':'#cdd6f4'}">${name}${hot ? html` <span title="High frequency" style="color:#f38ba8;font-size:10px">🔥</span>` : ''}</td>
                        <td class="${hot?'freq-hot':''}">${d.count}</td>
                        <td style="color:#6c7086;font-size:10px">${(d.sources||[]).map(s=>`<${s}>`).join(', ') || '—'}</td>
                    </tr>`;
                })}</tbody>
            </table>`;
    }

    // ── Slow API ──────────────────────────────────────────────────────────
    _renderSlowApi() {
        const r = this._getActiveReport();
        if (!r) return html`<p class="empty">No data</p>`;
        const entries = (r.slowApi||[]).slice().reverse();
        if (!entries.length) return html`<p class="empty">No slow API calls recorded</p>`;
        return html`
            <table>
                <thead><tr><th>Method</th><th>Duration ms</th><th>Component</th><th>Time</th></tr></thead>
                <tbody>${entries.map(e => html`<tr>
                    <td>${e.method??'-'}</td><td class="slow">${e.ms??e.durationMs??'-'}</td>
                    <td>${e.tag??'-'}</td><td>${String(e.ts||'').slice(11,19)}</td>
                </tr>`)}</tbody>
            </table>`;
    }

    // ── Memory ────────────────────────────────────────────────────────────
    _renderMemory() {
        const r = this._getActiveReport();
        if (!r) return html`<p class="empty">No data</p>`;
        const entries = Object.entries(r.memory||{}).sort((a,b)=>b[1].mounted-a[1].mounted);
        if (!entries.length) return html`<p class="empty">No memory data</p>`;
        return html`
            <table>
                <thead><tr><th>Component</th><th>Mounted</th><th>Unmounted</th><th>Alive</th><th>GC freed</th></tr></thead>
                <tbody>${entries.map(([tag,v]) => {
                    const alive = (v.mounted||0)-(v.unmounted||0);
                    const leak  = alive>3 && (v.gcCount||0)<alive*0.5;
                    return html`<tr>
                        <td>&lt;${tag}&gt;</td><td>${v.mounted??0}</td><td>${v.unmounted??0}</td>
                        <td class="${alive>100?'slow':leak?'warn-cell':''}">${alive}${leak?' ⚠️':''}</td>
                        <td>${v.gcCount??0}</td>
                    </tr>`;
                })}</tbody>
            </table>`;
    }

    // ── History ───────────────────────────────────────────────────────────
    _renderHistory() {
        const h            = (window.__LDS_HISTORY__||[]).slice().reverse();
        const activeReport = this._activeReport;
        const sel          = this._diffSelected;
        const canCompare   = sel.size === 2;

        if (this._diffView) return this._renderDiff();

        return html`
            <div class="history-bar">
                <span style="color:#6c7086;font-size:11px">${h.length} snapshot${h.length!==1?'s':''} (max 20)</span>
                <div style="display:flex;gap:6px">
                    ${canCompare ? html`<button class="header-btn accent" @click=${this._runDiff}>🔀 Compare ${sel.size}</button>` : ''}
                    ${sel.size > 0 ? html`<button class="header-btn" @click=${()=>{ this._diffSelected=new Set(); }}>Clear sel.</button>` : ''}
                    ${h.length>0 ? html`<button class="header-btn" style="color:#f38ba8" @click=${this._clearHistory}>Clear All</button>` : ''}
                </div>
            </div>
            ${sel.size === 1 ? html`<p style="color:#6c7086;font-size:11px;margin-bottom:8px">Select one more snapshot to compare</p>` : ''}
            ${!h.length ? html`<p class="empty">No history yet. ↻ Refresh a few times or use ⬇ to build history.</p>` : html`
            <table>
                <thead><tr><th>☑</th><th>Time</th><th>Source</th><th>Session</th><th>Issues</th><th></th></tr></thead>
                <tbody>${h.map(item => {
                    const isViewing  = item.report === activeReport;
                    const isSelected = sel.has(item.id);
                    const issues = _buildPinpointIssues(item.report||{});
                    const crit   = issues.filter(i=>i.severity==='critical').length;
                    const high   = issues.filter(i=>i.severity==='high').length;
                    return html`<tr class="${isViewing?'viewing-row':''}${isSelected?' viewing-row':''}">
                        <td>
                            <input type="checkbox" .checked=${isSelected}
                                @change=${e => {
                                    const next = new Set(sel);
                                    if (e.target.checked) { if (next.size < 2) next.add(item.id); else e.target.checked = false; }
                                    else next.delete(item.id);
                                    this._diffSelected = next;
                                }}>
                        </td>
                        <td>${(item.capturedAt||'').slice(0,10)}<br><span style="color:#6c7086">${(item.capturedAt||'').slice(11,19)}</span></td>
                        <td><span class="source-pill ${item.source}">${item.source}</span></td>
                        <td style="font-size:10px;color:#6c7086">…${(item.sessionId||'').slice(-10)}</td>
                        <td style="font-size:10px">
                            ${crit>0?html`<span style="color:#f38ba8">🔴${crit}</span> `:''}
                            ${high>0?html`<span style="color:#fab387">🟠${high}</span>`:''}
                            ${crit===0&&high===0?html`<span style="color:#a6e3a1">✅</span>`:''}
                        </td>
                        <td>${isViewing
                            ? html`<span style="color:#a6e3a1;font-size:10px">viewing</span>`
                            : html`<button class="header-btn" @click=${()=>this._viewHistoryItem(item)}>View</button>`}
                        </td>
                    </tr>`;
                })}</tbody>
            </table>`}`;
    }

    _runDiff() {
        const h   = (window.__LDS_HISTORY__||[]);
        const sel = this._diffSelected;
        const two = h.filter(item => sel.has(item.id));
        if (two.length < 2) return;
        two.sort((x, y) => (x.capturedAt||'').localeCompare(y.capturedAt||''));
        const [a, b] = two;
        this._diffView = { a, b, result: _buildDiff(a.report, b.report) };
    }

    _renderDiff() {
        const { a, b, result } = this._diffView;
        return html`
            <div class="history-bar">
                <div>
                    <span style="color:#6c7086;font-size:11px">Comparing:</span>
                    <span style="color:#a6e3a1;font-size:11px;margin:0 6px">${(a.capturedAt||'').slice(11,19)} (older)</span>
                    <span style="color:#6c7086">→</span>
                    <span style="color:#89b4fa;font-size:11px;margin-left:6px">${(b.capturedAt||'').slice(11,19)} (newer)</span>
                </div>
                <button class="header-btn" @click=${()=>{ this._diffView=null; }}>← Back</button>
            </div>

            <div class="section-title">Metrics</div>
            <table>
                <thead><tr><th>Metric</th><th style="color:#a6e3a1">Older</th><th style="color:#89b4fa">Newer</th><th>Change</th></tr></thead>
                <tbody>${result.metrics.map(m => html`<tr>
                    <td>${m.label}</td>
                    <td style="color:#a6e3a1">${m.aVal}</td>
                    <td style="color:#89b4fa">${m.bVal}</td>
                    <td class="${m.dir==='better'?'diff-better':m.dir==='worse'?'diff-worse':'diff-same'}">${m.dir==='better'?'▼ better':m.dir==='worse'?'▲ worse':'—'} ${m.delta || ''}</td>
                </tr>`)}</tbody>
            </table>

            ${result.newIssues.length ? html`
                <div class="section-title" style="color:#f38ba8">New Issues (appeared in newer)</div>
                ${result.newIssues.map(i => html`<div class="finding high"><span class="issue-sev ${i.severity}" style="display:inline-block">${i.severity}</span> <span style="color:#89b4fa">&lt;${i.component}&gt;</span> ${i.issueType}</div>`)}
            ` : ''}

            ${result.fixedIssues.length ? html`
                <div class="section-title" style="color:#a6e3a1">Fixed Issues (gone in newer)</div>
                ${result.fixedIssues.map(i => html`<div class="finding ok"><span>✅</span> <span style="color:#89b4fa">&lt;${i.component}&gt;</span> ${i.issueType} resolved</div>`)}
            ` : ''}

            ${result.newComponents.length ? html`
                <div class="section-title">New Components</div>
                <div>${result.newComponents.map(t => html`<span class="tag-pill" style="color:#a6e3a1">${t}</span>`)}</div>
            ` : ''}

            ${result.removedComponents.length ? html`
                <div class="section-title">Removed Components</div>
                <div>${result.removedComponents.map(t => html`<span class="tag-pill" style="color:#6c7086">${t}</span>`)}</div>
            ` : ''}
        `;
    }

    // ── Environment ───────────────────────────────────────────────────────
    _renderEnv() {
        const r = this._getActiveReport();
        if (!r) return html`<p class="empty">No data</p>`;
        const env = r.environment;
        if (!env) return html`<p class="empty">No environment data</p>`;
        const { browser: b, hardware: h, network: n, heap, pageLoad: pl } = env;
        return html`
            <div class="section-title">Browser</div>
            ${this._kvRow('Browser / Version', b?.version || '—')}
            ${this._kvRow('User Agent', b?.userAgent || '—')}
            ${this._kvRow('Language', b?.language || '—')}
            ${this._kvRow('Online', String(b?.onLine))}

            <div class="section-title">Hardware</div>
            ${this._kvRow('CPU Cores', String(h?.cpuCores))}
            ${this._kvRow('Device Memory', h?.deviceMemoryGB!=='unknown'?`${h.deviceMemoryGB} GB`:'unavailable')}
            ${this._kvRow('Screen', h?.screen || '—')}

            ${n ? html`<div class="section-title">Network</div>
                ${this._kvRow('Effective Type', n.effectiveType)}
                ${this._kvRow('Downlink', `${n.downlinkMbps} Mbps`)}
                ${this._kvRow('RTT', `${n.rttMs} ms`)}` :
                html`<div class="section-title">Network</div>${this._kvRow('Status','unavailable (non-Chrome)')}`}

            ${heap ? html`<div class="section-title">JS Heap</div>
                ${this._kvRow('Used', `${heap.usedMB} MB`)}
                ${this._kvRow('Total Allocated', `${heap.totalMB} MB`)}
                ${this._kvRow('Limit', `${heap.limitMB} MB`)}` : ''}

            ${pl ? html`<div class="section-title">Page Load Timing</div>
                ${this._kvRow('DNS', `${pl.dnsMs} ms`)}
                ${this._kvRow('TTFB', `${pl.ttfbMs} ms`)}
                ${this._kvRow('DOM Interactive', `${pl.domInteractiveMs} ms`)}
                ${this._kvRow('Full Load', `${pl.loadMs} ms`)}` : ''}

            <div class="section-title">Session</div>
            ${this._kvRow('Session ID', env.sessionId)}
            ${this._kvRow('Captured At', env.capturedAt)}
            ${this._kvRow('URL', env.url)}`;
    }

    _kvRow(key, value) {
        return html`<div class="kv-row"><span class="kv-key">${key}</span><span class="kv-value">${value}</span></div>`;
    }
}

customElements.define('lds-debug-panel', LdsDebugPanel);
export { LdsDebugPanel };
