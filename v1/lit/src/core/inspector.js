/**
 * LdsInspector — dev-time component snapshot tool.
 *
 * Usage:
 *   window.__LDS_INSPECTOR__ = true   // enable hover badge on all elements
 *   window.createComponentWithData(el) // programmatic snapshot of any element
 *   window.createComponentWithData('my-element') // by CSS selector
 *
 * The snapshot JSON contains:
 *   - inputProps:    all declared static properties with live values
 *   - privateState:  all _* instance fields
 *   - replayHint:    HTML snippet + mock-setup code
 *
 * Customise:
 *   window.__LDS_TAG_TO_FILE__ = tag => `src/components/${tag}/${tag}.js`
 *   window.__LDS_INSPECTOR_OPTS__ = { maxDepth, maxArrayItems, maxObjKeys, maxStrLen }
 */

const _active = { el: null };
let _overlayBtn = null;

function _getOverlay() {
    if (_overlayBtn && document.body.contains(_overlayBtn)) return _overlayBtn;

    const btn = document.createElement('button');
    btn.id = '__lds-inspector-btn__';
    Object.assign(btn.style, {
        position: 'fixed',
        zIndex: '2147483647',
        background: '#1a73e8',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        padding: '3px 8px',
        fontSize: '11px',
        fontFamily: 'monospace',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        pointerEvents: 'auto',
        whiteSpace: 'nowrap',
        display: 'none',
        lineHeight: '18px',
    });

    btn.addEventListener('mouseenter', () => { clearTimeout(_active._hideTimer); });
    btn.addEventListener('mouseleave', () => {
        _active._hideTimer = setTimeout(_hideOverlay, 150);
    });
    btn.addEventListener('click', e => {
        e.stopPropagation();
        if (_active.el) _captureAndCopy(_active.el);
    });

    document.body.appendChild(btn);
    _overlayBtn = btn;
    return btn;
}

function _showOverlay(el) {
    const btn = _getOverlay();
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    btn.textContent = `📸 ${el.tagName.toLowerCase()}`;
    btn.style.top = `${Math.max(0, rect.top + 2)}px`;
    btn.style.left = `${Math.min(window.innerWidth - 160, rect.right - 155)}px`;
    btn.style.display = 'block';
    btn.style.background = '#1a73e8';
}

function _hideOverlay() {
    if (_overlayBtn) _overlayBtn.style.display = 'none';
    _active.el = null;
}

const _DEFAULTS = {
    maxDepth: 4,
    maxArrayItems: 5,
    maxObjKeys: 20,
    maxStrLen: 300,
};

function _opts() {
    return Object.assign({}, _DEFAULTS, window.__LDS_INSPECTOR_OPTS__ || {});
}

const _FRAMEWORK_KEY_RE = /^__/;

function _isDomNode(v) {
    return v instanceof EventTarget || (v && typeof v === 'object' && typeof v.tagName === 'string');
}

function _trim(val, depth, seen) {
    const { maxArrayItems, maxObjKeys, maxStrLen } = _opts();

    if (val === null || val === undefined) return val;
    if (typeof val === 'function') return '[Function]';
    if (typeof val === 'symbol') return val.toString();

    if (typeof val === 'string') {
        return val.length > maxStrLen ? val.slice(0, maxStrLen) + `…(+${val.length - maxStrLen})` : val;
    }

    if (typeof val !== 'object') return val;

    if (_isDomNode(val)) return `[DOMNode <${val.tagName ? val.tagName.toLowerCase() : 'node'}>]`;

    if (seen.has(val)) return '[Circular]';

    if (depth <= 0) {
        if (Array.isArray(val)) return `[Array(${val.length})]`;
        return `[Object]`;
    }

    seen.add(val);

    if (Array.isArray(val)) {
        const items = val.slice(0, maxArrayItems).map(item => _trim(item, depth - 1, seen));
        if (val.length > maxArrayItems) items.push(`…+${val.length - maxArrayItems} more`);
        seen.delete(val);
        return items;
    }

    const keys = Object.keys(val);
    const result = {};
    let shown = 0;
    for (const k of keys) {
        if (shown >= maxObjKeys) {
            result['…'] = `+${keys.length - shown} more keys`;
            break;
        }
        try { result[k] = _trim(val[k], depth - 1, seen); } catch (_) { result[k] = '[Error]'; }
        shown++;
    }
    seen.delete(val);
    return result;
}

function _trimVal(val) {
    return _trim(val, _opts().maxDepth, new WeakSet());
}

function _tagToFilePath(tag) {
    if (typeof window.__LDS_TAG_TO_FILE__ === 'function') return window.__LDS_TAG_TO_FILE__(tag);
    return `src/components/${tag}/${tag}.js`;
}

function _buildSnapshot(el) {
    const tagName  = el.tagName.toLowerCase();
    const declared = el.constructor.properties || {};

    // 1. Public declared properties
    const inputProps = {};
    for (const key of Object.keys(declared)) {
        try {
            const v = el[key];
            if (v !== undefined) inputProps[key] = _trimVal(v);
        } catch (_) {}
    }

    // 2. Private state — single-underscore _* keys only
    const privateState = {};
    for (const key of Object.getOwnPropertyNames(el)) {
        if (key.startsWith('_') && !_FRAMEWORK_KEY_RE.test(key) && !(key in declared)) {
            try { privateState[key] = _trimVal(el[key]); } catch (_) {}
        }
    }

    // 3. Generic context (app can expose via window.__LDS_CONTEXT_GETTER__)
    const context = typeof window.__LDS_CONTEXT_GETTER__ === 'function'
        ? window.__LDS_CONTEXT_GETTER__(el)
        : {};

    // 4. Replay hint
    const replayHint = _buildReplayHint(tagName, inputProps, privateState);

    return {
        element: tagName,
        filePath: _tagToFilePath(tagName),
        capturedAt: new Date().toISOString(),
        inputProps,
        privateState,
        context,
        replayHint,
    };
}

// Props to skip when building HTML/mock replay (framework internals)
const _SKIP_REPLAY_PROPS = new Set([
    'id', 'state', 'isComponentErrored',
]);

function _buildReplayHint(tagName, inputProps, privateState) {
    const attrLines = [];
    const propLines = [];

    for (const [k, v] of Object.entries(inputProps)) {
        if (_SKIP_REPLAY_PROPS.has(k) || v === null || v === undefined || v === '' || v === false) continue;
        if (typeof v === 'object') {
            propLines.push(`el.${k} = snapshot.inputProps['${k}'];`);
        } else {
            attrLines.push(`  ${k}="${v}"`);
        }
    }

    const stateLines = Object.keys(privateState)
        .map(k => `el.${k} = snapshot.privateState['${k}'];`);

    const htmlSnippet = [`<${tagName}`, ...attrLines, `></${tagName}>`].join('\n');
    const mockSetup = [
        `// 1. Set object/array props:`,
        ...propLines,
        ``,
        `// 2. Restore captured private state (bypasses API calls):`,
        ...stateLines,
    ].join('\n');

    return { html: htmlSnippet, mockSetup };
}

function _captureAndCopy(el) {
    const snapshot = _buildSnapshot(el);
    const json = JSON.stringify(snapshot, null, 2);
    const tag = el.tagName.toLowerCase();

    navigator.clipboard.writeText(json).then(
        () => console.log(`%c[LdsInspector] Snapshot for <${tag}> copied to clipboard`, 'color:#1a73e8;font-weight:bold;'),
        () => console.log(`%c[LdsInspector] Snapshot for <${tag}> (clipboard unavailable — see below)`, 'color:#f57c00;font-weight:bold;')
    );

    console.groupCollapsed(`%c[LdsInspector] <${tag}>`, 'color:#1a73e8;font-weight:bold;font-size:13px;');
    console.log('%cInput Props',    'color:#34a853;font-weight:bold;', snapshot.inputProps);
    console.log('%cPrivate State',  'color:#ea4335;font-weight:bold;', snapshot.privateState);
    console.log('%cContext',        'color:#fbbc05;font-weight:bold;', snapshot.context);
    console.log('%cReplay HTML',    'color:#9c27b0;font-weight:bold;', snapshot.replayHint.html);
    console.log('%cMock Setup',     'color:#9c27b0;font-weight:bold;', snapshot.replayHint.mockSetup);
    console.groupEnd();

    if (_overlayBtn) {
        _overlayBtn.textContent = '✅ Copied!';
        _overlayBtn.style.background = '#34a853';
        setTimeout(() => {
            if (_overlayBtn) {
                _overlayBtn.textContent = `📸 ${tag}`;
                _overlayBtn.style.background = '#1a73e8';
            }
        }, 1500);
    }

    return snapshot;
}

function attach(el) {
    const onOver = e => {
        if (!window.__LDS_INSPECTOR__) return;
        e.stopPropagation();
        clearTimeout(_active._hideTimer);
        _active.el = el;
        _showOverlay(el);
    };
    const onLeave = e => {
        if (!window.__LDS_INSPECTOR__) return;
        if (e.relatedTarget === _overlayBtn) return;
        _active._hideTimer = setTimeout(() => {
            if (_active.el === el) _hideOverlay();
        }, 150);
    };

    el.addEventListener('mouseover', onOver);
    el.addEventListener('mouseleave', onLeave);
    el.__ldsInspector = { onOver, onLeave };
}

function detach(el) {
    const h = el.__ldsInspector;
    if (!h) return;
    el.removeEventListener('mouseover', h.onOver);
    el.removeEventListener('mouseleave', h.onLeave);
    delete el.__ldsInspector;
    if (_active.el === el) _hideOverlay();
}

const LdsInspector = { attach, detach, snapshot: _buildSnapshot, capture: _captureAndCopy };

if (typeof window !== 'undefined') {
    window.createComponentWithData = function (elOrSelector) {
        let el = elOrSelector;
        if (typeof elOrSelector === 'string') {
            el = document.querySelector(elOrSelector);
        }
        if (!el || typeof el.tagName === 'undefined') {
            console.warn('[LdsInspector] Element not found:', elOrSelector);
            return null;
        }
        return LdsInspector.capture(el);
    };
}

export { LdsInspector };
