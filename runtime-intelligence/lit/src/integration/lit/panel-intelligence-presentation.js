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
            ${model.likelyCause ? html`<div style="margin-bottom:7px;"><strong style="color:#89b4fa;">Likely cause</strong><div style="margin-top:2px;color:#cdd6f4;">${model.likelyCause}</div></div>` : ''}
            ${model.source ? html`<div style="margin-bottom:7px;"><strong style="color:#89b4fa;">Where</strong><div style="margin-top:2px;color:#cdd6f4;overflow-wrap:anywhere;">${model.source}</div></div>` : ''}
            ${Array.isArray(model.impact) && model.impact.length ? html`<div style="margin-bottom:7px;"><strong style="color:#89b4fa;">Impact</strong><div style="margin-top:2px;color:#cdd6f4;">${model.impact.join(' · ')}</div></div>` : ''}
            ${model.nextAction ? html`<div style="margin-bottom:7px;"><strong style="color:#a6e3a1;">Do next</strong><div style="margin-top:2px;color:#cdd6f4;">${model.nextAction}</div></div>` : ''}
            ${model.verification?.outcome ? html`<div><strong style="color:#89b4fa;">Verification</strong><div style="margin-top:2px;color:#cdd6f4;">${model.verification.outcome}</div></div>` : ''}
        </div>
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

    const originalCompleteReplay = proto._completeReplay;
    if (typeof originalCompleteReplay === 'function') {
        proto._completeReplay = function (...args) {
            const result = originalCompleteReplay.apply(this, args);
            const comparison = this._replayState?.comparison;
            if (this._replayState?.status === 'done' && comparison) {
                target.__LDS_INTELLIGENCE_PIPELINE__?.recordVerification?.({
                    source: 'panel-replay',
                    outcome: comparison.overallVerified ? 'confirmed' : 'not-confirmed',
                    confirmed: comparison.overallVerified === true,
                    metrics: comparison.metrics || [],
                    comparedAt: comparison.comparedAt || new Date().toISOString(),
                });
            }
            return result;
        };
    }

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
                if (panel._tab === INTELLIGENCE_TAB_KEY) panel.requestUpdate?.();
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
