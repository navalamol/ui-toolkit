/**
 * panel-host.js — DEPRECATED / DEV-ONLY helper.
 *
 * This file is no longer injected by the extension. Panel registration and
 * mounting is now done directly by background.js using:
 *   chrome.scripting.executeScript({ world: 'MAIN', files: ['panel.bundle.js'] })
 *
 * This file is kept for reference and for manual development use only.
 * You can load it directly in a dev page (not via the extension) like:
 *   <script type="module" src="./panel-host.js"></script>
 * adjusting the import path to point at the source panel file.
 */

// Dev-only: import the panel directly from source (no bundle needed)
// Adjust this path relative to where this file is served from.
import '../src/panel/LdsDebugPanel.js';

window.dispatchEvent(new CustomEvent('__lds-panel-ready__'));
