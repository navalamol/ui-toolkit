import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function exportTargets(exportsField) {
  const targets = [];
  for (const value of Object.values(exportsField || {})) {
    if (typeof value === 'string') targets.push(value);
    else if (value && typeof value === 'object') targets.push(...exportTargets(value));
  }
  return targets;
}

test('every declared package export resolves to a real repository file', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const targets = exportTargets(pkg.exports);
  assert.ok(targets.length > 0);
  for (const target of targets) {
    assert.equal(
      existsSync(resolve(root, target)),
      true,
      `package export target is missing: ${target}`,
    );
  }
});

test('library build config exists and package root imports successfully', async () => {
  assert.equal(existsSync(join(root, 'rollup.lib.config.js')), true);
  const mod = await import(pathToFileURL(join(root, 'src/index.js')).href);
  for (const name of ['EvidenceStore', 'EvidenceGraph', 'RuntimeResourceOwnershipLedger', 'LitAdapter', 'ReactAdapter']) {
    assert.ok(mod[name], `missing root export: ${name}`);
  }
});
