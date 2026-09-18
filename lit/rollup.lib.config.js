/**
 * Rollup config for the publishable npm library output.
 * Emits ES modules to lib/ so bundlers can tree-shake individual tools.
 *
 * Run: npx rollup -c rollup.lib.config.js
 * Output: lib/index.js, lib/panel/LdsDebugPanel.js, lib/custom/ui-platform/index.js
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';

export default [
    // Main barrel + core tools
    {
        input: 'src/index.js',
        external: [/^lit/],
        output: {
            dir: 'lib',
            format: 'esm',
            preserveModules: true,
            preserveModulesRoot: 'src',
        },
        plugins: [nodeResolve()],
    },
    // Panel (heavy; consumers can import separately)
    {
        input: 'src/panel/LdsDebugPanel.js',
        external: [/^lit/],
        output: {
            file: 'lib/panel/LdsDebugPanel.js',
            format: 'esm',
        },
        plugins: [nodeResolve()],
    },
    // Syndigo custom plugins
    {
        input: 'custom/ui-platform/index.js',
        external: [/^lit/, /^lit-debug-suite/],
        output: {
            dir: 'lib/custom/ui-platform',
            format: 'esm',
            preserveModules: true,
            preserveModulesRoot: 'custom/ui-platform',
        },
        plugins: [nodeResolve()],
    },
];
