/**
 * Rollup config for the Chrome extension panel bundle.
 * Bundles LdsDebugPanel (+ Lit) into a self-contained IIFE for extension injection.
 *
 * Run: npx rollup -c rollup.extension.config.js
 * Output: extension/panel.bundle.js
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const isProd = process.env.NODE_ENV === 'production';

export default {
    input: 'src/panel/LdsDebugPanel.js',
    output: {
        file: 'extension/panel.bundle.js',
        format: 'iife',
        name: 'LdsPanel',
        // The panel self-registers its custom element on import; no exports needed.
        // sourcemap helps during development; omit in prod for smaller size.
        sourcemap: !isProd,
    },
    plugins: [
        // Resolve Lit and its transitive deps from node_modules.
        // Lit is bundled inline because Chrome extensions have no import-map support.
        nodeResolve(),
        ...(isProd ? [terser()] : []),
    ],
};
