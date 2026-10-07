import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const mainPlatformFiles = [
    'custom/ui-platform/AciPlugin.js',
    'custom/ui-platform/FalcorDecoder.js',
    'custom/ui-platform/FalcorNetworkEnhancer.js',
    'custom/ui-platform/SyndigoSlowApiPlugin.js',
    'custom/ui-platform/compat.js',
    'custom/ui-platform/index.js',
];

const featureDocs = [
    '00-overview.md',
    '00b-quick-start.md',
    '00c-pinpoint-tab.md',
    '01-perf-monitor.md',
    '02-prop-audit.md',
    '03-inspector.md',
    '04-event-tracer.md',
    '05-slow-api.md',
    '06-console.md',
    '07-vitals.md',
    '08-network.md',
    '09-cycle-detector.md',
    '10-resource-tracker.md',
    '11-workflow-baseline.md',
    '12-memory-counters.md',
    '13-tool-by-symptom.md',
    '14-troubleshooting.md',
    '15-falcor-tab.md',
];

test('Main Platform compatibility bundle remains present and exported', () => {
    for (const file of mainPlatformFiles) {
        assert.equal(existsSync(join(root, file)), true, `missing Main Platform compatibility file: ${file}`);
    }

    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(
        pkg.exports?.['./custom/ui-platform']?.import,
        './custom/ui-platform/index.js',
        'Main Platform package export must not be removed by generic runtime-intelligence work',
    );
});

test('debug panel compatibility surface remains separately exported and built', () => {
    const panelSource = 'src/panel/LdsDebugPanel.js';
    assert.equal(existsSync(join(root, panelSource)), true, `missing debug panel compatibility file: ${panelSource}`);

    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(
        pkg.exports?.['./panel']?.import,
        './src/panel/LdsDebugPanel.js',
        'debug panel package export must remain available at ./panel',
    );

    const rollup = readFileSync(join(root, 'rollup.lib.config.js'), 'utf8');
    assert.match(
        rollup,
        /input:\s*['"]src\/panel\/LdsDebugPanel\.js['"]/,
        'Rollup must keep the panel as a dedicated input',
    );
    assert.match(
        rollup,
        /file:\s*['"]lib\/panel\/LdsDebugPanel\.js['"]/,
        'Rollup must emit the dedicated panel build at lib/panel/LdsDebugPanel.js',
    );

    const rootBarrel = readFileSync(join(root, 'src/index.js'), 'utf8');
    assert.doesNotMatch(
        rootBarrel,
        /LdsDebugPanel|\.\/panel\//,
        'debug panel must stay out of the root barrel and remain opt-in',
    );
});

test('Runtime Intelligence remains a dedicated panel tab instead of a global banner', () => {
    const bridge = readFileSync(join(root, 'src/integration/lit/panel-intelligence-presentation.js'), 'utf8');
    assert.match(bridge, /INTELLIGENCE_TAB_KEY\s*=\s*['"]intelligence['"]/);
    assert.match(bridge, /textContent\s*=\s*['"]✨ Intelligence['"]/);
    assert.match(bridge, /this\._tab\s*===\s*INTELLIGENCE_TAB_KEY/);
    assert.match(bridge, /_renderIntelligenceTab/);
    assert.doesNotMatch(
        bridge,
        /lds-runtime-intelligence-banner/,
        'Runtime Intelligence must not inject a banner into every existing tab',
    );
});

test('baseline feature documentation remains intact as a product compatibility surface', () => {
    for (const file of featureDocs) {
        const path = join(root, 'docs/features', file);
        assert.equal(existsSync(path), true, `missing baseline feature guide: docs/features/${file}`);
    }
});
