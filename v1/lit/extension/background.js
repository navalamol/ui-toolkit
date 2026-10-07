/**
 * background.js — MV3 service worker for LDS Debug Panel extension.
 *
 * WHY MAIN WORLD:
 *   Custom elements are registered per JavaScript realm. Chrome extensions
 *   run content scripts in an "isolated world" — a separate JS realm that
 *   shares the DOM but NOT the customElements registry with the page.
 *   If we define <lds-debug-panel> in the isolated world, document.createElement
 *   in the page context won't find it. We must inject into world: 'MAIN'.
 *
 *   Consequence: chrome.* APIs are NOT available inside MAIN-world injected
 *   functions. All chrome API calls must stay here in the service worker.
 */

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    const key     = `lds_debug_${tab.id}`;
    const stored  = await chrome.storage.session.get(key);
    const current = stored[key] ?? false;
    const next    = !current;

    await chrome.storage.session.set({ [key]: next });

    try {
        // Step 1 — set/clear window.__LDS_DEBUG__ in the page's own JS realm
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world:  'MAIN',
            func:   (enabled) => {
                window.__LDS_DEBUG__ = enabled;
                window.dispatchEvent(
                    new CustomEvent('__lds-debug-toggle__', { detail: { enabled } })
                );
            },
            args: [next],
        });

        if (next) {
            // Step 2 — inject the pre-built panel bundle into MAIN world.
            //   This registers <lds-debug-panel> in the PAGE's customElements registry.
            //   panel.bundle.js is an IIFE that self-registers on load.
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world:  'MAIN',
                files:  ['panel.bundle.js'],
            });

            // Step 3 — mount the panel element (idempotent)
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world:  'MAIN',
                func:   () => {
                    if (document.getElementById('lds-debug-panel-root')) return;
                    const el = document.createElement('lds-debug-panel');
                    el.id    = 'lds-debug-panel-root';
                    document.body.appendChild(el);
                },
            });
        } else {
            // Step 2 (off) — remove the panel element
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world:  'MAIN',
                func:   () => {
                    const el = document.getElementById('lds-debug-panel-root');
                    if (el) el.remove();
                },
            });
        }

        await chrome.action.setTitle({
            tabId: tab.id,
            title: next
                ? 'LDS Debug: ON — click to disable'
                : 'LDS Debug: OFF — click to enable',
        });

    } catch (err) {
        // Common reasons: chrome:// page, PDF, or tab that disallows scripting
        console.warn('[LDS extension] Could not inject into tab', tab.id, '—', err.message);
    }
});

// Clean up per-tab state when the tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
    await chrome.storage.session.remove(`lds_debug_${tabId}`);
});
