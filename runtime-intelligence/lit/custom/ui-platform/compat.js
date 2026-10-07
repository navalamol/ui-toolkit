/**
 * compat.js — backwards-compatibility aliases: __RUF_* → __LDS_*
 *
 * For apps that already read window.__RUF_* globals directly
 * (e.g., custom DevTools scripts, dashboard queries, existing tooling).
 *
 * Import this once at app bootstrap AFTER the debug suite initialises:
 *   import 'lit-debug-suite/custom/ui-platform/compat.js';
 *
 * Each alias is a live getter — reads the current value of the __LDS_* global
 * at access time, so it always reflects the latest data.
 */

if (typeof window !== 'undefined') {
    const aliases = [
        ['__RUF_DEBUG__',          '__LDS_DEBUG__'],
        ['__RUF_ERRORS__',         '__LDS_ERRORS__'],
        ['__RUF_PERF__',           '__LDS_PERF__'],
        ['__RUF_SLOW_RENDERS__',   '__LDS_SLOW_RENDERS__'],
        ['__RUF_MEMORY__',         '__LDS_MEMORY__'],
        ['__RUF_STORMS__',         '__LDS_STORMS__'],
        ['__RUF_CONSOLE__',        '__LDS_CONSOLE__'],
        ['__RUF_NETWORK_LOG__',    '__LDS_NETWORK_LOG__'],
        ['__RUF_VITALS__',         '__LDS_VITALS__'],
        ['__RUF_RENDER_REASONS__', '__LDS_RENDER_REASONS__'],
        ['__RUF_THRASH__',         '__LDS_THRASH__'],
        ['__RUF_CYCLES__',         '__LDS_CYCLES__'],
        ['__RUF_ACI_TIMELINE__',   '__LDS_EVENTS_TIMELINE__'],
        ['__RUF_ACI_FREQ__',       '__LDS_EVENTS_FREQ__'],
        ['__RUF_SLOW_API_LOG__',   '__LDS_SLOW_API_LOG__'],
        ['__RUF_MEMORY_REPORT__',  '__LDS_MEMORY_REPORT__'],
        ['__RUF_SESSION_ID__',     '__LDS_SESSION_ID__'],
    ];

    aliases.forEach(([rufKey, ldsKey]) => {
        if (rufKey in window) return; // don't overwrite if set by old code
        try {
            Object.defineProperty(window, rufKey, {
                get() { return window[ldsKey]; },
                set(v) { window[ldsKey] = v; },
                configurable: true,
                enumerable:   false,
            });
        } catch (_e) {
            // Silently ignore — some environments lock window properties
        }
    });
}
