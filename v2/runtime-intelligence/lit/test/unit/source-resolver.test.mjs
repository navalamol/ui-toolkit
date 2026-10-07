import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SourceResolutionBasis,
  SourceResolver,
  parseRuntimeSourceLocation,
} from '../../src/core/source-resolver.js';
import { AttributionQuality } from '../../src/core/evidence-protocol.js';

test('preserves an already-canonical source location', async () => {
  const result = await new SourceResolver().resolve({ source: { file: 'src/components/ProductGrid.js', line: 184, column: 12, functionName: 'render' } });
  assert.equal(result.file, 'src/components/ProductGrid.js');
  assert.equal(result.originalFile, 'src/components/ProductGrid.js');
  assert.equal(result.generatedFile, null);
  assert.equal(result.basis, SourceResolutionBasis.DIRECT);
  assert.equal(result.attributionQuality, AttributionQuality.SOURCE_ATTRIBUTED);
});

test('normalizes generated browser URLs and masks sensitive query/fragment data', async () => {
  const result = await new SourceResolver().resolve({ source: 'http://localhost/app.chunk.js?token=secret#route:18193:9' });
  assert.equal(result.file, 'http://localhost/app.chunk.js');
  assert.equal(result.generatedFile, 'http://localhost/app.chunk.js');
  assert.equal(result.generatedLine, 18193);
  assert.equal(result.generatedColumn, 9);
  assert.equal(result.basis, SourceResolutionBasis.GENERATED);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('prefers canonical framework source hints over generated runtime locations', async () => {
  const result = await new SourceResolver().resolve({
    source: 'webpack://bundle.js:83429:14',
    frameworkSource: { file: 'src/editor/ProductEditor.ts', line: 72, column: 5 },
  });
  assert.equal(result.file, 'src/editor/ProductEditor.ts');
  assert.equal(result.basis, SourceResolutionBasis.FRAMEWORK);
  assert.equal(result.attributionQuality, AttributionQuality.FRAMEWORK_REPORTED);
});

test('uses a pluggable source-map provider and retains generated coordinates', async () => {
  const provider = {
    id: 'test-source-map',
    resolve({ generated }) {
      assert.equal(generated.file, 'bundle.js');
      return { file: 'src/components/ProductGrid.js', line: 184, column: 12, confidence: 0.97 };
    },
  };
  const result = await new SourceResolver({ providers: [provider] }).resolve({ source: 'webpack://bundle.js:83429:14' });
  assert.equal(result.file, 'src/components/ProductGrid.js');
  assert.equal(result.originalLine, 184);
  assert.equal(result.generatedLine, 83429);
  assert.equal(result.resolver, 'test-source-map');
  assert.equal(result.basis, SourceResolutionBasis.SOURCE_MAP);
  assert.equal(result.confidence, 0.97);
});

test('provider failure degrades gracefully to generated location', async () => {
  const result = await new SourceResolver({ providers: [() => { throw new Error('map unavailable'); }] })
    .resolve({ stackFrame: 'at update (https://example.test/assets/app.js:91:7)' });
  assert.equal(result.file, 'https://example.test/assets/app.js');
  assert.equal(result.generatedLine, 91);
  assert.equal(result.basis, SourceResolutionBasis.GENERATED);
  assert.equal(result.attributionQuality, AttributionQuality.UNKNOWN);
});

test('returns an explicit unresolved result when no location can be recovered', async () => {
  const result = await new SourceResolver().resolve({});
  assert.equal(result.file, null);
  assert.equal(result.basis, SourceResolutionBasis.UNRESOLVED);
  assert.equal(result.confidence, 0);
});

test('source resolution does not mutate or upgrade evidence level', async () => {
  const event = Object.freeze({
    evidence: Object.freeze({ level: 'correlation', attribution: 'unknown' }),
    source: Object.freeze({ file: 'webpack://bundle.js', line: 10, column: 2 }),
  });
  const before = event.evidence.level;
  const result = await new SourceResolver({ providers: [() => ({ file: 'src/a.js', line: 1, column: 1 })] }).resolve({ source: event.source });
  assert.equal(result.attributionQuality, AttributionQuality.SOURCE_ATTRIBUTED);
  assert.equal(event.evidence.level, before);
  assert.equal('evidenceLevel' in result, false);
});

test('parses Windows stack locations without confusing drive colon with line numbers', () => {
  const parsed = parseRuntimeSourceLocation('at fn (C:\\repo\\src\\a.ts:42:6)');
  assert.equal(parsed.file, 'C:/repo/src/a.ts');
  assert.equal(parsed.line, 42);
  assert.equal(parsed.column, 6);
  assert.equal(parsed.functionName, 'fn');
});
