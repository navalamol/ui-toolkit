import { html } from 'lit';

const INTELLIGENCE_TAB_KEY = 'intelligence';

function _masterFlag(target) {
    if (target?.__LDS_DEBUG__ !== undefined) return target.__LDS_DEBUG__;
    return target?.__LDS_APP_CONFIG__?.debugEnabled ?? false;
}

function _toolEnabled(target, key) {
    const standalone = {
        intelligence: '__LDS_INTELLIGENCE_ENABLED__',
        perf: '__LDS_PERF_ENABLED__',
        network: '__LDS_NETWORK_ENABLED__',
    }[key];
    if (standalone && target?.[standalone]) return true;
    const master = _masterFlag(target);
    if (master === true) return true;
    return !!(master && typeof master === 'object' && master[key]);
}

function _toolState(target) {
    return {
        intelligence: _toolEnabled(target, 'intelligence') || !!target?.__LDS_INTELLIGENCE_PIPELINE__,
        perf: _toolEnabled(target, 'perf'),
        perfSamples: Object.keys(target?.__LDS_PERF__ || {}).length,
        network: _toolEnabled(target, 'network'),
        networkSamples: (target?.__LDS_NETWORK_LOG__ || []).length,
    };
}

function _statusPill(label, enabled, count = null) {
    const suffix = enabled && Number.isFinite(count) && count > 0 ? ` · ${count}` : '';
    return html`<span style="
        display:inline-block;
        font-size:9px;
        padding:2px 7px;
        border-radius:999px;
        border:1px solid ${enabled ? '#458588' : '#585b70'};
        color:${enabled ? '#a6e3a1' : '#a6adc8'};
        margin-right:5px;
        margin-bottom:5px;
    ">${label} ${enabled ? 'ON' : 'OFF'}${suffix}</span>`;
}

function _infoCard(title, body, tone = 'blue') {
    const border = tone === 'green' ? '#a6e3a1' : tone === 'yellow' ? '#f9e2af' : '#89b4fa';
    return html`
        <div style="background:#181825;border:1px solid #313244;border-left:3px solid ${border};border-radius:7px;padding:10px 12px;margin-bottom:10px;">
            <div style="font-weight:700;color:${border};margin-bottom:5px;">${title}</div>
            <div style="color:#bac2de;line-height:1.5;">${body}</div>
        </div>
    `;
}

function _causeLabel(confidence) {
    if (confidence === 'Confirmed') return 'Confirmed cause';
    if (confidence === 'High confidence') return 'Likely cause';
    return 'Strongest signal';
}

function _renderFinding(model) {
    if (!model || model.status === 'ready') {
        return html`
            <div style="background:#181825;border:1px solid #313244;border-radius:7px;padding:12px;">
                <div style="font-weight:700;color:#a6e3a1;margin-bottom:6px;">No issue captured yet</div>
                <div style="color:#bac2de;line-height:1.5;">
                    Use the application normally. Runtime Intelligence watches the same diagnostic signals and will summarize a meaningful slow Lit update or runtime error when one occurs.
                </div>
            </div>
        `;
    }

    return html`
        <div style="background:#181825;border:1px solid #313244;border-left:3px solid #f9e2af;border-radius:7px;padding:12px;">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px;">
                <div style="font-size:13px;font-weight:700;color:#f9e2af;">${model.headline || 'Runtime finding'}</div>
                <span style="font-size:9px;padding:2px 7px;border:1px solid #45475a;border-radius:999px;color:#bac2de;white-space:nowrap;">${model.confidence || 'Possible'}</span>
            </div>
            ${model.problem ? html`<div style="margin-bottom:7px;"><strong style="color:#89b4fa;">Problem</strong><div style="margin-top:2px;color:#cdd6f4;">${model.problem}</div></div>` : ''}
            ${model.likelyCause ? html`<div style="margin-bottom:7px;"><strong style="color:#89b4fa;">${_causeLabel(model.confidence)}</strong><div style="margin-top:2px;color:#cdd6f4;">${model.likelyCause}</div></div>` : ''}
            ${model.source ? html`<div style="margin-bottom:7px;"><strong style="color:#89b4fa;">Where</strong><div style="margin-top:2px;color:#cdd6f4;overflow-wrap:anywhere;">${model.source}</div></div>` : ''}
            ${Array.isArray(model.impact) && model.impact.length ? html`<div style="margin-bottom:7px;"><strong style="color:#89b4fa;">Impact</strong><div style="margin-top:2px;color:#cdd6f4;">${model.impact.join(' · ')}</div></div>` : ''}
            ${model.nextAction ? html`<div style="margin-bottom:7px;"><strong style="color:#a6e3a1;">Do next</strong><div style="margin-top:2px;color:#cdd6f4;">${model.nextAction}</div></div>` : ''}
            ${model.verification?.outcome ? html`<div><strong style="color:#89b4fa;">Verification</strong><div style="margin-top:2px;color:#cdd6f4;">${model.verification.outcome}</div></div>` : ''}
        </div>
    `;
}

function _renderBudgetViolationSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    if (!store) return '';
    const violations = store.snapshot?.({ type: 'diagnostic' })
        ?.filter?.(e => e.payload?.budgetViolation === true) ?? [];
    if (violations.length === 0) return '';

    // Deduplicate by tag — keep worst (highest updateCount)
    const byTag = new Map();
    for (const v of violations) {
        const tag = v.payload.tag;
        const prev = byTag.get(tag);
        if (!prev || v.payload.updateCount > prev.updateCount) byTag.set(tag, v.payload);
    }

    return html`
        <details style="margin-top:10px;border:1px solid #313244;border-left:3px solid #f9e2af;border-radius:7px;padding:8px 10px;">
            <summary style="cursor:pointer;color:#f9e2af;font-weight:700;">
                Over-rendering — ${byTag.size} component${byTag.size === 1 ? '' : 's'} exceeded update budget
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                <div style="margin-bottom:6px;color:#6c7086;">These components updated more times than their budget allows within the rolling window. They may be reacting to state changes they don't need.</div>
                <ul style="margin:0;padding-left:16px;">
                    ${[...byTag.values()].map(p => html`
                        <li>
                            <code style="color:#cba6f7;">&lt;${p.tag}&gt;</code>
                            — ${p.updateCount} updates in ${p.windowMs}ms
                            (budget: ${p.countPerWindow})
                        </li>
                    `)}
                </ul>
                <div style="margin-top:6px;color:#6c7086;font-size:10px;">Set per-tag budget: <code style="color:#cba6f7;">window.__LDS_INTELLIGENCE_PIPELINE__.budgetMonitor().setBudget('tag-name', &#123;countPerWindow, windowMs&#125;)</code></div>
            </div>
        </details>
    `;
}

function _renderNetworkCorrelationSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    if (!store) return '';
    const links = store.snapshot?.({ type: 'diagnostic' })
        ?.filter?.(e => e.payload?.networkCorrelation === true) ?? [];
    if (links.length === 0) return '';

    // Group by networkPath+method — accumulate count and keep the most-recent tracedMs.
    // This shows total state-change pressure per path across the whole session (no "replacing").
    const byPath = new Map();
    for (const d of links) {
        const { networkPath, networkMethod, tracedMs } = d.payload;
        const key  = `${networkMethod ?? 'GET'}:${networkPath ?? '(unknown)'}`;
        const prev = byPath.get(key) ?? { count: 0, tracedMs: 0, networkPath, networkMethod };
        byPath.set(key, { ...prev, count: prev.count + 1, tracedMs: Math.max(prev.tracedMs, tracedMs ?? 0) });
    }
    const rows = [...byPath.values()].sort((a, b) => b.count - a.count).slice(0, 20);

    return html`
        <details style="margin-top:10px;border:1px solid #313244;border-left:3px solid #cba6f7;border-radius:7px;padding:8px 10px;">
            <summary style="cursor:pointer;color:#cba6f7;font-weight:700;">
                Network → State — ${byPath.size} path${byPath.size === 1 ? '' : 's'} · ${links.length} total correlations
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                <div style="margin-bottom:6px;color:#6c7086;">State changes that occurred within the correlation window after a network call completed. Counts accumulate across the session.</div>
                <ul style="margin:0;padding-left:16px;">
                    ${rows.map(r => {
                        const method = r.networkMethod ?? 'GET';
                        const path   = r.networkPath ?? '(unknown)';
                        return html`<li>
                            <code style="color:#89b4fa;">${method} ${path}</code>
                            → ${r.count} state change${r.count === 1 ? '' : 's'}
                            <span style="color:#6c7086;">(latest: ${r.tracedMs}ms)</span>
                        </li>`;
                    })}
                </ul>
                <div style="margin-top:6px;color:#6c7086;font-size:10px;">Evidence level: correlation (temporal). EvidenceGraph TRACE_CONTEXT edges link these events.</div>
            </div>
        </details>
    `;
}

function _renderOrphanSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    if (!store) return '';
    const orphanDiagnostics = store.snapshot?.({ type: 'diagnostic' })
        ?.filter?.(e => e.payload?.orphanSuspect === true) ?? [];
    if (orphanDiagnostics.length === 0) return '';

    // Deduplicate by ownerId — keep highest survivedNavigationCount
    const byOwner = new Map();
    for (const d of orphanDiagnostics) {
        const id = d.payload.ownerId;
        const prev = byOwner.get(id);
        if (!prev || d.payload.survivedNavigationCount > prev.survivedNavigationCount) {
            byOwner.set(id, d.payload);
        }
    }

    return html`
        <details style="margin-top:10px;border:1px solid #313244;border-left:3px solid #f38ba8;border-radius:7px;padding:8px 10px;">
            <summary style="cursor:pointer;color:#f38ba8;font-weight:700;">
                Orphan Suspects — ${byOwner.size} component${byOwner.size === 1 ? '' : 's'} survived navigation without disconnect
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                <div style="margin-bottom:6px;color:#6c7086;">These components were alive before a route change but were never destroyed. They may be holding event listeners or references that prevent GC.</div>
                <ul style="margin:0;padding-left:16px;">
                    ${[...byOwner.values()].map(p => html`
                        <li><code style="color:#cba6f7;">&lt;${p.tag}&gt;</code> — survived ${p.survivedNavigationCount} navigation${p.survivedNavigationCount === 1 ? '' : 's'}</li>
                    `)}
                </ul>
                <div style="margin-top:6px;color:#6c7086;font-size:10px;">Evidence level: correlation (temporal). Confirm with DevTools Memory snapshot.</div>
            </div>
        </details>
    `;
}

function _renderBackgroundHistorySection(target) {
    const pipeline = target?.__LDS_INTELLIGENCE_PIPELINE__;
    if (!pipeline) return '';
    const history = pipeline.backgroundHistory?.() ?? [];
    if (!history.length) return '';

    // Consolidated summary: count by issue type + top components + page coverage
    const titleFreq = new Map();
    const rootFreq  = new Map();
    let netTotal = 0, budgetTotal = 0, cascadeTotal = 0;
    const pageSet = new Set();

    for (const e of history) {
        pageSet.add(e.pageUrl || 'unknown');
        if (e.title) titleFreq.set(e.title, (titleFreq.get(e.title) || 0) + 1);
        if (e.rootLabel) rootFreq.set(e.rootLabel, (rootFreq.get(e.rootLabel) || 0) + 1);
        netTotal    += e.networkCorrelationCount || 0;
        budgetTotal += e.budgetViolationCount || 0;
        cascadeTotal += e.cascadeSummary ? 1 : 0;
    }

    const topIssues = [...titleFreq.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([t, n]) => html`<li><span style="color:#f9e2af">${t}</span> <span style="color:#585b70">×${n}</span></li>`);

    const topRoots = [...rootFreq.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([r, n]) => html`<li><span style="color:#cba6f7">${r}</span> <span style="color:#585b70">×${n}</span></li>`);

    const openReport = () => {
        const html = pipeline.exportSessionReport?.();
        if (!html) return;
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
    };

    return html`
        <div style="margin-top:10px;border:1px solid #313244;border-left:3px solid #89b4fa;border-radius:7px;padding:10px 12px;background:#181825">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="color:#89b4fa;font-weight:700;font-size:12px;">
                    Session Monitor — ${history.length} finding${history.length > 1 ? 's' : ''} · ${pageSet.size} page${pageSet.size > 1 ? 's' : ''}
                </span>
                <button @click=${openReport}
                    style="font-size:10px;padding:3px 10px;background:#313244;border:1px solid #458588;color:#a6e3a1;border-radius:4px;cursor:pointer;">
                    Open Full Report
                </button>
            </div>
            <div style="display:flex;gap:12px;margin-bottom:8px;font-size:11px;color:#6c7086">
                ${cascadeTotal ? html`<span style="color:#cba6f7">${cascadeTotal} cascade${cascadeTotal > 1 ? 's' : ''}</span>` : ''}
                ${netTotal ? html`<span style="color:#89b4fa">${netTotal} net correlations</span>` : ''}
                ${budgetTotal ? html`<span style="color:#f9e2af">${budgetTotal} budget violations</span>` : ''}
            </div>
            ${topIssues.length ? html`
                <div style="margin-bottom:6px">
                    <div style="font-size:10px;color:#585b70;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em">Top issues</div>
                    <ul style="margin:0;padding-left:14px;font-size:11px;color:#cdd6f4;line-height:1.7">${topIssues}</ul>
                </div>` : ''}
            ${topRoots.length ? html`
                <div>
                    <div style="font-size:10px;color:#585b70;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em">Root signals</div>
                    <ul style="margin:0;padding-left:14px;font-size:11px;color:#cdd6f4;line-height:1.7">${topRoots}</ul>
                </div>` : ''}
        </div>
    `;
}

function _renderCascadeSection(target) {
    const cascade = target?.__LDS_CASCADE_REPORT__;
    if (!cascade?.hasCascade) return '';

    const overReacting = cascade.overReactingOwners?.length
        ? html`<div style="margin-top:6px;color:#f9e2af;font-size:11px;">
            ⚠ Over-reacting: ${cascade.overReactingOwners.map(o => html`<code style="color:#cba6f7;">&lt;${o.tag}&gt;</code> ×${o.triggerCount} `)}
          </div>`
        : '';

    const refreshedAt = cascade.capturedAt
        ? new Date(cascade.capturedAt).toLocaleTimeString()
        : null;

    return html`
        <details style="margin-top:10px;border:1px solid #313244;border-left:3px solid #a6e3a1;border-radius:7px;padding:8px 10px;">
            <summary style="cursor:pointer;color:#a6e3a1;font-weight:700;display:flex;justify-content:space-between;align-items:center">
                <span>Reactive Cascade — 1 change → ${cascade.componentCount} component${cascade.componentCount === 1 ? '' : 's'} · depth ${cascade.depth} · ${cascade.totalUpdateMs}ms total</span>
                ${refreshedAt ? html`<span style="color:#585b70;font-size:10px;font-weight:400">updated ${refreshedAt}</span>` : ''}
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                <div style="margin-bottom:4px;"><strong style="color:#cdd6f4;">${cascade.triggerCount} cascade trigger${cascade.triggerCount === 1 ? '' : 's'}</strong> detected in this incident.</div>
                ${cascade.branches?.length ? html`
                    <div style="margin-bottom:2px;color:#6c7086;text-transform:uppercase;letter-spacing:.04em;font-size:10px;">Components in cascade</div>
                    <ul style="margin:0;padding-left:16px;">
                        ${cascade.branches.map(b => html`<li><code style="color:#cba6f7;">&lt;${b.tag}&gt;</code> — depth ${b.depth}, triggered ${b.triggerCount}×</li>`)}
                    </ul>
                ` : ''}
                ${overReacting}
                <div style="margin-top:6px;color:#6c7086;font-size:10px;">Access full data: <code style="color:#cba6f7;">window.__LDS_CASCADE_REPORT__</code></div>
            </div>
        </details>
    `;
}

function _renderIntelligenceTab(target) {
    const model = target?.__LDS_INTELLIGENCE__;
    const tools = _toolState(target);
    const evidenceCount = target?.__LDS_EVIDENCE_STORE__?.size?.() ?? 0;

    return html`
        <div style="margin-bottom:14px;">
            <div style="font-size:15px;font-weight:700;color:#89b4fa;margin-bottom:4px;">Runtime Intelligence</div>
            <div style="color:#6c7086;font-size:11px;line-height:1.5;">
                The original tabs show measurements. This tab tries to turn those measurements into one useful developer answer: <strong style="color:#cdd6f4;">what happened, why it likely happened, where to look, and what to do next.</strong>
            </div>
        </div>

        <div style="margin-bottom:12px;">
            ${_statusPill('Intelligence', tools.intelligence)}
            ${_statusPill('Perf', tools.perf, tools.perfSamples)}
            ${_statusPill('Network', tools.network, tools.networkSamples)}
            ${_statusPill('Evidence', evidenceCount > 0, evidenceCount)}
        </div>

        ${_infoCard(
            'What is different from the original toolkit?',
            html`Instead of asking you to manually correlate <strong>Perf + Network + Errors + component lifecycle</strong>, Runtime Intelligence keeps a bounded evidence timeline, correlates the strongest related signals, and produces a compact finding. The existing tabs remain the detailed source views.`,
        )}

        ${_infoCard(
            'How should I use it?',
            html`1. Reproduce the UI problem normally.<br>2. Open this tab.<br>3. Read <strong>Problem → Likely cause → Where → Impact → Do next</strong>.<br>4. Use Pinpoint/Perf/Network only when you need the supporting detail.`,
            'green',
        )}

        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6c7086;margin:14px 0 7px;">Current finding</div>
        ${_renderFinding(model)}

        ${tools.perf && tools.perfSamples === 0 ? html`
            <div style="margin-top:10px;color:#f9e2af;font-size:11px;line-height:1.45;">
                Perf is enabled but has no samples yet. Navigate/remount Lit components or exercise the screen before judging Perf coverage.
            </div>
        ` : ''}

        ${_renderCascadeSection(target)}
        ${_renderOrphanSection(target)}
        ${_renderNetworkCorrelationSection(target)}
        ${_renderBudgetViolationSection(target)}
        ${_renderBackgroundHistorySection(target)}

        <details style="margin-top:14px;border-top:1px solid #313244;padding-top:8px;">
            <summary style="cursor:pointer;color:#89b4fa;">Technical evidence (optional)</summary>
            <div style="color:#a6adc8;font-size:11px;line-height:1.5;margin-top:6px;">
                ${model?.technicalEvidence?.available
                    ? html`${model.technicalEvidence.eventCount || 0} captured signals contributed to the current analysis.`
                    : html`No incident evidence is needed yet.`}
                Raw forensic data is intentionally hidden from normal UI. Use
                <code style="color:#cba6f7;">window.__LDS_INTELLIGENCE_PIPELINE__.exportCapsule()</code>
                only for deep investigation or AI handoff.
            </div>
        </details>
    `;
}

function _ensureTabButton(panel, target) {
    const root = panel?.shadowRoot;
    const tabs = root?.querySelector('.tabs');
    if (!tabs || root.querySelector('#lds-intelligence-tab')) return;

    const button = target.document.createElement('button');
    button.id = 'lds-intelligence-tab';
    button.className = `tab${panel._tab === INTELLIGENCE_TAB_KEY ? ' active' : ''}`;
    button.textContent = '✨ Intelligence';
    button.addEventListener('click', () => {
        if (typeof panel._setTab === 'function') panel._setTab(INTELLIGENCE_TAB_KEY);
        else {
            panel._tab = INTELLIGENCE_TAB_KEY;
            panel.requestUpdate?.();
        }
    });

    const tabButtons = [...tabs.querySelectorAll('.tab')];
    const pinpoint = tabButtons.find(item => item.textContent?.includes('Pinpoint'));
    if (pinpoint?.nextSibling) tabs.insertBefore(button, pinpoint.nextSibling);
    else tabs.appendChild(button);
}

function _syncTabButton(panel, target) {
    _ensureTabButton(panel, target);
    const button = panel?.shadowRoot?.querySelector('#lds-intelligence-tab');
    if (button) button.className = `tab${panel._tab === INTELLIGENCE_TAB_KEY ? ' active' : ''}`;
}

function _syncAll(target) {
    const panels = target?.document?.querySelectorAll?.('lds-debug-panel') || [];
    for (const panel of panels) {
        _syncTabButton(panel, target);
        if (panel._tab === INTELLIGENCE_TAB_KEY) panel.requestUpdate?.();
    }
}

function _patchPanelClass(target) {
    const Panel = target?.customElements?.get?.('lds-debug-panel');
    if (!Panel || Panel.prototype.__ldsIntelligencePresentationPatched) return !!Panel;

    const proto = Panel.prototype;

    const originalConnected = proto.connectedCallback;
    proto.connectedCallback = function (...args) {
        const result = originalConnected?.apply(this, args);
        Promise.resolve(this.updateComplete).finally(() => _syncTabButton(this, target));
        return result;
    };

    const originalUpdated = proto.updated;
    proto.updated = function (...args) {
        const result = originalUpdated?.apply(this, args);
        _syncTabButton(this, target);
        return result;
    };

    const originalRenderContent = proto._renderContent;
    proto._renderContent = function (...args) {
        if (this._tab === INTELLIGENCE_TAB_KEY) {
            return html`<div class="tab-content">${_renderIntelligenceTab(target)}</div>`;
        }
        return originalRenderContent?.apply(this, args);
    };

    // Verification feedback is now handled via the lds-replay-complete CustomEvent
    // dispatched from LdsDebugPanel._completeReplay() — no private method patching needed.

    Object.defineProperty(proto, '__ldsIntelligencePresentationPatched', {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false,
    });

    _syncAll(target);
    return true;
}

/**
 * Adds Runtime Intelligence as a dedicated tab in the mature LDS panel.
 * Existing tabs remain unchanged. No global/banner UI is injected into them.
 */
function installLitIntelligencePanelPresentation({ target = typeof window !== 'undefined' ? window : null } = {}) {
    if (!target?.customElements) return false;

    if (!target.__LDS_INTELLIGENCE_PANEL_BRIDGE_INSTALLED__) {
        target.__LDS_INTELLIGENCE_PANEL_BRIDGE_INSTALLED__ = true;
        target.addEventListener?.('lds-intelligence-updated', () => {
            const panels = target.document?.querySelectorAll?.('lds-debug-panel') || [];
            for (const panel of panels) {
                // Update Intelligence tab AND Falcor tab (hosts Sequential Opportunities section)
                if (panel._tab === INTELLIGENCE_TAB_KEY || panel._tab === 'falcor') {
                    panel.requestUpdate?.();
                }
            }
        });
        target.addEventListener?.('lds-replay-complete', (e) => {
            const { comparison, status } = e.detail || {};
            if (status === 'done' && comparison) {
                target.__LDS_INTELLIGENCE_PIPELINE__?.recordVerification?.({
                    source: 'panel-replay',
                    outcome: comparison.overallVerified ? 'confirmed' : 'not-confirmed',
                    confirmed: comparison.overallVerified === true,
                    metrics: comparison.metrics || [],
                    comparedAt: comparison.comparedAt || new Date().toISOString(),
                });
            }
        });
    }

    if (!_patchPanelClass(target) && typeof target.customElements.whenDefined === 'function') {
        target.customElements.whenDefined('lds-debug-panel')
            .then(() => _patchPanelClass(target))
            .catch(() => {});
    }
    _syncAll(target);
    return true;
}

export { installLitIntelligencePanelPresentation };
