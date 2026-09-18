/**
 * content.js — minimal content script for LDS Debug Panel extension.
 *
 * Runs in ISOLATED world at document_idle.
 * Panel mounting/unmounting is handled entirely by background.js in MAIN world.
 * This script only handles the case where window.__LDS_DEBUG__ was already
 * set by the app itself (not by the extension) so the panel auto-mounts.
 *
 * NOTE: We cannot call customElements.define here — isolated world has a
 * separate customElements registry from the page. All element work stays in
 * background.js (MAIN world injection).
 */
(function () {
    'use strict';

    // If the APP itself set __LDS_DEBUG__ = true before extension loaded,
    // tell background to mount the panel via message passing.
    if (window.__LDS_DEBUG__) {
        chrome.runtime.sendMessage({ type: 'LDS_AUTO_ENABLE' }).catch(() => {});
    }
})();
