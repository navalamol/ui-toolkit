/**
 * RufConsole — captures console.error and console.warn into a bounded ring buffer.
 *
 * Enable:  activated automatically when window.__RUF_DEBUG__ includes 'console'
 * Access:  window.__RUF_CONSOLE__         — array of captured entries
 * Clear:   window.__RUF_CONSOLE_CLEAR__() — empties the buffer
 *
 * Each entry: { level: 'error'|'warn', message: string, ts: ISO-string }
 * Buffer cap: 200 entries (oldest dropped when full)
 *
 * The console patch is session-global and applied once; subsequent attach()
 * calls on new elements are no-ops.
 */

const _MAX = 200;
const _log = [];
let _patched = false;

if (typeof window !== 'undefined') {
    window.__RUF_CONSOLE__ = _log;
    window.__RUF_CONSOLE_CLEAR__ = function () {
        _log.length = 0;
        console.log('%c[RufConsole] Buffer cleared', 'color:#89b4fa;font-weight:bold;');
    };
}

function _push(level, args) {
    const entry = {
        level,
        message: args.map(a => (typeof a === 'string' ? a : _safe(a))).join(' '),
        ts: new Date().toISOString(),
    };
    _log.push(entry);
    if (_log.length > _MAX) _log.shift();
}

function _safe(val) {
    try {
        return JSON.stringify(val);
    } catch (_) {
        return String(val);
    }
}

function attach(_el) {
    if (_patched) return;
    _patched = true;

    const _origError = console.error.bind(console);
    const _origWarn = console.warn.bind(console);
    const _origLog = console.log.bind(console);

    console.error = (...args) => {
        _push('error', args);
        _origError(...args);
    };
    console.warn = (...args) => {
        _push('warn', args);
        _origWarn(...args);
    };
    // Capture [RufErrorBoundary] logs which arrive via console.error
    // Other console.log traffic intentionally excluded to keep buffer lean

    _origLog('%c[RufConsole] Active — capturing console.error and console.warn', 'color:#89b4fa;font-weight:bold;');
}

function detach(_el) {
    // The console patch is session-global — not reversed per-element.
    // Resetting requires restoring _origError/_origWarn; that is intentionally
    // omitted because partial detach would silently drop subsequent captures.
}

export const RufConsole = { attach, detach };
