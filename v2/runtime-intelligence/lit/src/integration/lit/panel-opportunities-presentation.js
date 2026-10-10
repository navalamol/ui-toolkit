import { html } from 'lit';

const OPPORTUNITIES_TAB_KEY = 'opportunities';

// ── Shared empty-state chip ───────────────────────────────────────────────
function _emptyState(label) {
    return html`
        <div style="margin-top:6px;font-size:10px;color:#45475a;padding:4px 6px;
                    background:#181825;border-radius:4px;font-style:italic;">
            ${label}
        </div>
    `;
}

// ── Section renderers ─────────────────────────────────────────────────────

function _renderDomDuplicationSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    const hits = store
        ? (store.snapshot?.({ type: 'diagnostic' }) ?? []).filter(e => e.payload?.domDuplication === true)
        : [];

    const byTag = new Map();
    for (const h of hits) {
        const p = h.payload;
        const prev = byTag.get(p.duplicateTag);
        if (!prev || p.instanceCount > prev.instanceCount) byTag.set(p.duplicateTag, p);
    }
    const entries = [...byTag.values()].sort((a, b) => b.instanceCount - a.instanceCount);
    const hasData = entries.length > 0;

    return html`
        <details style="margin-top:10px;border:1px solid #313244;
                        border-left:3px solid ${hasData ? '#f38ba8' : '#45475a'};
                        border-radius:7px;padding:8px 10px;"
                 ?open=${hasData}>
            <summary style="cursor:pointer;color:${hasData ? '#f38ba8' : '#585b70'};font-weight:700;">
                🔁 DOM Duplication
                ${hasData
                    ? html`<span style="font-weight:400;margin-left:6px;font-size:11px;">
                                — ${entries.length} pattern${entries.length !== 1 ? 's' : ''} detected
                           </span>`
                    : html`<span style="font-weight:400;font-size:10px;margin-left:6px;color:#45475a;">
                                · monitoring
                           </span>`}
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                ${hasData ? entries.map(p => html`
                    <div style="margin-bottom:8px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                        <div><code style="color:#f38ba8;">&lt;${p.duplicateTag}&gt;</code> ×${p.instanceCount}
                        under <code style="color:#cba6f7;">&lt;${p.commonAncestorTag}&gt;</code>
                        ${p.identicalContent ? html`<span style="color:#a6e3a1;margin-left:6px;">· identical content</span>` : ''}
                        <span style="float:right;color:${p.strength === 'high' ? '#f38ba8' : '#f9e2af'};font-size:10px;">${p.strength}</span>
                        </div>
                        <div style="margin-top:4px;color:#6c7086;">
                            → Hoist one shared instance to <code style="color:#cba6f7;">&lt;${p.commonAncestorTag}&gt;</code> and toggle visibility/content via a property
                        </div>
                    </div>
                `) : _emptyState('Detects singleton-role elements (tooltip, dialog, overlay…) instantiated ≥3× under a shared ancestor.')}
            </div>
        </details>
    `;
}

function _renderVirtualizationSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    const hits = store
        ? (store.snapshot?.({ type: 'diagnostic' }) ?? []).filter(e => e.payload?.virtualizationOpportunity === true)
        : [];

    const byKey = new Map();
    for (const h of hits) {
        const p = h.payload;
        const key = `${p.parentTag}|${p.childTag}`;
        const prev = byKey.get(key);
        if (!prev || p.childCount > prev.childCount) byKey.set(key, p);
    }
    const entries = [...byKey.values()].sort((a, b) => b.childCount - a.childCount);
    const hasData = entries.length > 0;

    return html`
        <details style="margin-top:10px;border:1px solid #313244;
                        border-left:3px solid ${hasData ? '#94e2d5' : '#45475a'};
                        border-radius:7px;padding:8px 10px;"
                 ?open=${hasData}>
            <summary style="cursor:pointer;color:${hasData ? '#94e2d5' : '#585b70'};font-weight:700;">
                📦 Virtualization Candidates
                ${hasData
                    ? html`<span style="font-weight:400;margin-left:6px;font-size:11px;">
                                — ${entries.length} pattern${entries.length !== 1 ? 's' : ''}
                           </span>`
                    : html`<span style="font-weight:400;font-size:10px;margin-left:6px;color:#45475a;">
                                · monitoring
                           </span>`}
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                ${hasData ? entries.map(p => html`
                    <div style="margin-bottom:8px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                        <div>
                            <code style="color:#cba6f7;">&lt;${p.parentTag}&gt;</code>
                            → <code style="color:#94e2d5;">&lt;${p.childTag}&gt;</code>
                            ×${p.childCount}
                            <span style="color:#6c7086;margin-left:6px;">${Math.round(p.offScreenRatio * 100)}% off-screen</span>
                            <span style="float:right;color:${p.strength === 'high' ? '#f38ba8' : '#f9e2af'};font-size:10px;">${p.strength}</span>
                        </div>
                        <div style="margin-top:4px;color:#6c7086;">
                            → <code style="color:#a6e3a1;">@lit-labs/virtualizer</code> or <code style="color:#a6e3a1;">&lt;virtual-scroller&gt;</code>
                        </div>
                    </div>
                `) : _emptyState('Fires when a parent has ≥50 same-tag children with ≥70% off-screen. Scroll-heavy lists trigger this.')}
            </div>
        </details>
    `;
}

function _renderPaintAdvisorSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    const all = store ? (store.snapshot?.({ type: 'diagnostic' }) ?? []) : [];

    const timings = all.filter(e => e.payload?.paintTiming === true)
        .reduce((acc, e) => { acc[e.payload.metric] = e.payload.valueMs; return acc; }, {});
    const cssHits = all.filter(e => e.payload?.expensivePaint === true);
    const hasData = Object.keys(timings).length > 0 || cssHits.length > 0;

    function _paintColor(ms) {
        if (ms < 1800) return '#a6e3a1';
        if (ms < 3000) return '#f9e2af';
        return '#f38ba8';
    }

    return html`
        <details style="margin-top:10px;border:1px solid #313244;
                        border-left:3px solid ${hasData ? '#fab387' : '#45475a'};
                        border-radius:7px;padding:8px 10px;"
                 ?open=${hasData}>
            <summary style="cursor:pointer;color:${hasData ? '#fab387' : '#585b70'};font-weight:700;">
                🎨 Paint Analysis
                ${!hasData ? html`<span style="font-weight:400;font-size:10px;margin-left:6px;color:#45475a;">· monitoring</span>` : ''}
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                ${hasData ? html`
                    ${Object.keys(timings).length ? html`
                        <div style="margin-bottom:8px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                            ${timings['first-paint'] != null ? html`
                                <span style="margin-right:12px;">First Paint:
                                    <strong style="color:${_paintColor(timings['first-paint'])};">${timings['first-paint']}ms</strong>
                                </span>` : ''}
                            ${timings['first-contentful-paint'] != null ? html`
                                <span>FCP:
                                    <strong style="color:${_paintColor(timings['first-contentful-paint'])};">${timings['first-contentful-paint']}ms</strong>
                                </span>` : ''}
                            <div style="color:#6c7086;margin-top:2px;font-size:10px;">
                                Good &lt;1800ms · Needs improvement &lt;3000ms · Poor ≥3000ms
                            </div>
                        </div>
                    ` : ''}
                    ${cssHits.map(h => html`
                        <div style="margin-bottom:6px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                            <div>Expensive CSS · <code style="color:#fab387;">${h.payload.property}</code>
                            on ${h.payload.elementCount} elements
                            <span style="color:#6c7086;margin-left:4px;">(e.g. <code>&lt;${h.payload.exampleTag}&gt;</code>)</span></div>
                            <div style="margin-top:3px;color:#6c7086;">
                                → Limit to &lt;10 elements. Apply <code style="color:#a6e3a1;">will-change:transform</code> only on actively-animating elements.
                            </div>
                        </div>
                    `)}
                ` : _emptyState('Captures FP/FCP via PerformanceObserver (buffered). Scans for filter/backdrop-filter/box-shadow on ≥10 elements via requestIdleCallback.')}
            </div>
        </details>
    `;
}

function _renderWorkerOpportunitySection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    const hits = store
        ? (store.snapshot?.({ type: 'diagnostic' }) ?? []).filter(e => e.payload?.workerOpportunity === true)
        : [];

    const byUrl = new Map();
    for (const h of hits) {
        const p = h.payload;
        const key = p.scriptUrl || '(anonymous)';
        const prev = byUrl.get(key);
        if (!prev || p.durationMs > prev.durationMs) byUrl.set(key, p);
    }
    const entries = [...byUrl.values()].sort((a, b) => b.durationMs - a.durationMs);
    const hasData = entries.length > 0;

    return html`
        <details style="margin-top:10px;border:1px solid #313244;
                        border-left:3px solid ${hasData ? '#cba6f7' : '#45475a'};
                        border-radius:7px;padding:8px 10px;"
                 ?open=${hasData}>
            <summary style="cursor:pointer;color:${hasData ? '#cba6f7' : '#585b70'};font-weight:700;">
                ⚙️ Worker Offload Candidates
                ${hasData
                    ? html`<span style="font-weight:400;margin-left:6px;font-size:11px;">
                                — ${entries.length} long task${entries.length !== 1 ? 's' : ''}
                           </span>`
                    : html`<span style="font-weight:400;font-size:10px;margin-left:6px;color:#45475a;">
                                · monitoring
                           </span>`}
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                ${hasData ? entries.map(p => {
                    const urlDisplay = p.scriptUrl
                        ? p.scriptUrl.split('/').slice(-2).join('/').slice(0, 60)
                        : '(anonymous script)';
                    return html`
                        <div style="margin-bottom:8px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                            <div>
                                <code style="color:#cba6f7;">${urlDisplay}</code>
                                <span style="color:#f38ba8;margin-left:6px;">${p.durationMs}ms</span>
                                ${p.isThirdParty ? html`<span style="color:#585b70;margin-left:6px;">(3rd party)</span>` : ''}
                                <span style="float:right;color:${p.strength === 'high' ? '#f38ba8' : '#f9e2af'};font-size:10px;">${p.strength}</span>
                            </div>
                            ${p.trigger === 'large-network-response' ? html`
                                <div style="color:#89b4fa;font-size:10px;margin-top:2px;">
                                    Correlated with ${p.networkResponseKB}KB response
                                </div>
                            ` : ''}
                            <div style="margin-top:3px;color:#6c7086;">
                                → <code style="color:#a6e3a1;">new Worker(url)</code> + <code style="color:#a6e3a1;">postMessage</code> to free the main thread
                            </div>
                        </div>
                    `;
                }) : _emptyState('Watches for long tasks (≥80ms) via PerformanceObserver. Correlates with large network responses (≥100KB) from the evidence store.')}
            </div>
        </details>
    `;
}

function _renderIdleSchedulingSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    const hits = store
        ? (store.snapshot?.({ type: 'diagnostic' }) ?? []).filter(e => e.payload?.idleOpportunity === true)
        : [];

    const byTag = new Map();
    for (const h of hits) {
        const p = h.payload;
        const prev = byTag.get(p.ownerTag);
        if (!prev || p.durationMs > prev.durationMs) byTag.set(p.ownerTag, p);
    }
    const entries = [...byTag.values()].sort((a, b) => b.durationMs - a.durationMs);
    const hasData = entries.length > 0;

    return html`
        <details style="margin-top:10px;border:1px solid #313244;
                        border-left:3px solid ${hasData ? '#f9e2af' : '#45475a'};
                        border-radius:7px;padding:8px 10px;"
                 ?open=${hasData}>
            <summary style="cursor:pointer;color:${hasData ? '#f9e2af' : '#585b70'};font-weight:700;">
                💤 Idle Scheduling Candidates
                ${hasData
                    ? html`<span style="font-weight:400;margin-left:6px;font-size:11px;">
                                — ${entries.length} non-urgent update${entries.length !== 1 ? 's' : ''}
                           </span>`
                    : html`<span style="font-weight:400;font-size:10px;margin-left:6px;color:#45475a;">
                                · monitoring
                           </span>`}
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                ${hasData ? html`
                    ${entries.map(p => html`
                        <div style="margin-bottom:6px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                            <div>
                                <code style="color:#cba6f7;">&lt;${p.ownerTag}&gt;</code>
                                <span style="color:#f9e2af;margin-left:6px;">${p.durationMs}ms</span>
                                <span style="color:#6c7086;margin-left:6px;">· ${p.trigger === 'periodic' ? `periodic (no gesture)` : 'non-urgent'}</span>
                            </div>
                        </div>
                    `)}
                    <div style="margin-top:6px;color:#6c7086;line-height:1.5;">
                        → Wrap with <code style="color:#a6e3a1;">requestIdleCallback(fn, {timeout:2000})</code>
                        or <code style="color:#a6e3a1;">scheduler.postTask(fn, {priority:'background'})</code>
                    </div>
                    <div style="margin-top:4px;color:#45475a;font-size:10px;">
                        Note: interaction proxy uses STATE_CHANGED events — precision improves once
                        INTERACTION events are wired by the framework adapter.
                    </div>
                ` : _emptyState('Watches UPDATE_COMPLETED events ≥16ms with no preceding STATE_CHANGED interaction. Periodic updates (5+ with ≥2s gaps) flagged as "periodic".')}
            </div>
        </details>
    `;
}

// ── Main tab renderer ─────────────────────────────────────────────────────

function _renderOpportunitiesTab(target) {
    return html`
        <div style="font-family:monospace;font-size:12px;color:#cdd6f4;padding:0 2px;">
            <div style="font-weight:700;color:#fab387;margin-bottom:6px;font-size:13px;">⚡ Opportunities</div>
            <div style="font-size:11px;color:#6c7086;margin-bottom:12px;line-height:1.5;">
                Proactive structural and optimization analysis — distinct from the incident-driven
                Intelligence tab. Sections open automatically when a pattern is detected.
            </div>

            ${_renderDomDuplicationSection(target)}
            ${_renderVirtualizationSection(target)}
            ${_renderPaintAdvisorSection(target)}
            ${_renderWorkerOpportunitySection(target)}
            ${_renderIdleSchedulingSection(target)}
        </div>
    `;
}

// ── Tab button injection ──────────────────────────────────────────────────

function _ensureTabButton(panel, target) {
    const root = panel?.shadowRoot;
    const tabs = root?.querySelector('.tabs');
    if (!tabs || root.querySelector('#lds-opportunities-tab')) return;

    const button = target.document.createElement('button');
    button.id = 'lds-opportunities-tab';
    button.className = `tab${panel._tab === OPPORTUNITIES_TAB_KEY ? ' active' : ''}`;
    button.textContent = '⚡ Opportunities';
    button.addEventListener('click', () => {
        if (typeof panel._setTab === 'function') panel._setTab(OPPORTUNITIES_TAB_KEY);
        else { panel._tab = OPPORTUNITIES_TAB_KEY; panel.requestUpdate?.(); }
    });

    const intl = tabs.querySelector('#lds-intelligence-tab');
    if (intl?.nextSibling) tabs.insertBefore(button, intl.nextSibling);
    else tabs.appendChild(button);
}

function _syncTabButton(panel, target) {
    _ensureTabButton(panel, target);
    const btn = panel?.shadowRoot?.querySelector('#lds-opportunities-tab');
    if (btn) btn.className = `tab${panel._tab === OPPORTUNITIES_TAB_KEY ? ' active' : ''}`;
}

function _syncAll(target) {
    const panels = target?.document?.querySelectorAll?.('lds-debug-panel') || [];
    for (const panel of panels) {
        _syncTabButton(panel, target);
        if (panel._tab === OPPORTUNITIES_TAB_KEY) panel.requestUpdate?.();
    }
}

function _patchPanelClass(target) {
    const Panel = target?.customElements?.get?.('lds-debug-panel');
    if (!Panel || Panel.prototype.__ldsOpportunitiesPresentationPatched) return !!Panel;

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
        if (this._tab === OPPORTUNITIES_TAB_KEY) {
            return html`<div class="tab-content">${_renderOpportunitiesTab(target)}</div>`;
        }
        return originalRenderContent?.apply(this, args);
    };

    Object.defineProperty(proto, '__ldsOpportunitiesPresentationPatched', {
        value: true, configurable: false, enumerable: false, writable: false,
    });

    _syncAll(target);
    return true;
}

function installLitOpportunitiesPanelPresentation({
    target = typeof window !== 'undefined' ? window : null,
} = {}) {
    if (!target?.customElements) return false;

    if (!target.__LDS_OPPORTUNITIES_PANEL_BRIDGE_INSTALLED__) {
        target.__LDS_OPPORTUNITIES_PANEL_BRIDGE_INSTALLED__ = true;
        target.addEventListener?.('lds-intelligence-updated', () => {
            const panels = target.document?.querySelectorAll?.('lds-debug-panel') || [];
            for (const panel of panels) {
                if (panel._tab === OPPORTUNITIES_TAB_KEY) panel.requestUpdate?.();
            }
        });
    }

    if (target.customElements.get('lds-debug-panel')) return _patchPanelClass(target);

    target.customElements.whenDefined?.('lds-debug-panel').then(() => _patchPanelClass(target));
    return false;
}

export { installLitOpportunitiesPanelPresentation };
