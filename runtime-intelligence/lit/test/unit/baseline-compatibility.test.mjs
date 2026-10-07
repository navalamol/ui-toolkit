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

test('baseline feature documentation remains intact as a product compatibility surface', () => {
    for (const file of featureDocs) {
        const path = join(root, 'docs/features', file);
        assert.equal(existsSync(path), true, `missing baseline feature guide: docs/features/${file}`);
    }
});
