/**
 * Rollup config for the publishable npm library output.
 * Emits ES modules to lib/ so bundlers can tree-shake individual tools.
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';

export default [
    // Main barrel + generic/Lit/React runtime intelligence modules
    {
        input: 'src/index.js',
        external: [/^lit(?:\/|$)/],
        output: {
            dir: 'lib',
            format: 'esm',
            preserveModules: true,
            preserveModulesRoot: 'src',
        },
        plugins: [nodeResolve()],
    },
    // Main Platform / Syndigo-specific integration remains a first-class build.
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
