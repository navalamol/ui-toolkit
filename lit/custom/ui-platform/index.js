/**
 * lit-debug-suite/custom/ui-platform — Syndigo-specific plugin bundle.
 *
 * Import this once in your app entry point (after the main suite is active):
 *   import 'lit-debug-suite/custom/ui-platform';
 *
 * What this module does:
 *  1. Registers the Falcor decoder with LdsNetwork so requests are decoded
 *  2. Installs SyndigoSlowApiPlugin to patch window.__dataObjectManager__
 *  3. Exports AciPlugin helpers for per-element ACI tracing
 *  4. Exports the compat aliases (__RUF_* → __LDS_*)
 *
 * Nothing in this file belongs in the generic core.
 */

import { LdsNetwork } from '../../src/core/network.js';
import { decodeFalcor } from './FalcorDecoder.js';
import { install as installSlowApi } from './SyndigoSlowApiPlugin.js';
import './compat.js';

// Register Falcor decoder
LdsNetwork.registerDecoder(decodeFalcor);

// Install DataObjectManager slow-API monitor (retries until DOM is ready)
installSlowApi();

// Re-export AciPlugin helpers for use in element connectedCallback
export { attachToElement, installGlobalAciPatch } from './AciPlugin.js';
export { decodeFalcor } from './FalcorDecoder.js';
export { install as installSlowApi } from './SyndigoSlowApiPlugin.js';
export { getBurstGroups, getDataIndexGroups, getSearchSessions, getPathAnalytics, getDuplicatePaths } from './FalcorNetworkEnhancer.js';
