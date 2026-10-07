/**
 * Framework-neutral runtime source resolution.
 * Resolves runtime/generated locations without changing evidence certainty.
 */

import { AttributionQuality } from './evidence-protocol.js';

const SourceResolutionBasis = Object.freeze({
  DIRECT: 'direct-source',
  FRAMEWORK: 'framework-source',
  SOURCE_MAP: 'source-map',
  REGISTRY: 'registry-source',
  GENERATED: 'generated-location',
  UNRESOLVED: 'unresolved',
});

function _finite(value) {
  return Number.isFinite(value) ? value : null;
}

function _clampConfidence(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function _generatedScheme(file) {
  return /^(?:https?:|blob:|data:|webpack:|vite:)/i.test(file || '');
}

function _safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function sanitizeSourceFile(file) {
  if (typeof file !== 'string') return null;
  let value = file.trim();
  if (!value) return null;

  // Source locations must never retain URL query values or fragments.
  value = value.split(/[?#]/, 1)[0].replace(/\\/g, '/');

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host}${_safeDecode(url.pathname)}`;
    } catch {
      return value;
    }
  }

  if (/^blob:/i.test(value)) {
    return `blob:${sanitizeSourceFile(value.slice(5)) || ''}`;
  }

  value = value
    .replace(/^webpack:\/\/+/, '')
    .replace(/^vite:\/\/+/, '')
    .replace(/^file:\/\/+/, '')
    .replace(/^\/@fs\//, '')
    .replace(/^\.\//, '');

  return _safeDecode(value);
}

function parseRuntimeSourceLocation(input) {
  if (!input) return null;

  if (typeof input === 'object') {
    const rawFile = input.file || input.url || input.generatedFile || null;
    if (!rawFile) return null;
    return Object.freeze({
      file: sanitizeSourceFile(rawFile),
      line: _finite(input.line ?? input.generatedLine),
      column: _finite(input.column ?? input.generatedColumn),
      functionName: input.functionName || input.function || null,
      generated: _generatedScheme(rawFile),
    });
  }

  if (typeof input !== 'string') return null;
  let text = input.trim();
  if (!text) return null;

  let functionName = null;
  const stackFrame = text.match(/^at\s+(.*?)\s+\((.*)\)$/);
  if (stackFrame) {
    functionName = stackFrame[1] || null;
    text = stackFrame[2];
  } else {
    text = text.replace(/^at\s+/, '').replace(/^\((.*)\)$/, '$1');
  }

  const match = text.match(/^(.*):(\d+):(\d+)$/);
  const rawFile = match ? match[1] : text;
  return Object.freeze({
    file: sanitizeSourceFile(rawFile),
    line: match ? Number(match[2]) : null,
    column: match ? Number(match[3]) : null,
    functionName,
    generated: _generatedScheme(rawFile),
  });
}

function _canonicalCandidate(input) {
  if (!input) return null;
  if (typeof input === 'object' && input.originalFile) {
    return Object.freeze({
      file: sanitizeSourceFile(input.originalFile),
      line: _finite(input.originalLine),
      column: _finite(input.originalColumn),
      functionName: input.functionName || input.function || null,
      generated: false,
    });
  }
  const parsed = parseRuntimeSourceLocation(input);
  return parsed && !parsed.generated ? parsed : null;
}

function _result(original, generated, {
  resolver,
  basis,
  confidence,
  attributionQuality,
}) {
  const effective = original || generated;
  return Object.freeze({
    file: effective?.file || null,
    line: effective?.line ?? null,
    column: effective?.column ?? null,
    functionName: effective?.functionName || generated?.functionName || null,
    originalFile: original?.file || null,
    originalLine: original?.line ?? null,
    originalColumn: original?.column ?? null,
    generatedFile: generated?.file || null,
    generatedLine: generated?.line ?? null,
    generatedColumn: generated?.column ?? null,
    resolver,
    basis,
    confidence,
    attributionQuality,
  });
}

function _providerIdentity(provider, index) {
  return provider?.id || provider?.name || provider?.constructor?.name || `provider-${index + 1}`;
}

class SourceResolver {
  constructor({ providers = [] } = {}) {
    this.providers = [];
    for (const provider of providers) this.addProvider(provider);
  }

  addProvider(provider) {
    const valid = typeof provider === 'function' || typeof provider?.resolve === 'function';
    if (!valid) throw new TypeError('Source resolver provider must be a function or expose resolve().');
    this.providers.push(provider);
    return this;
  }

  async resolve(input = {}) {
    if (typeof input === 'string') input = { source: input };

    // 1. Preserve an already-canonical source location.
    const direct = _canonicalCandidate(input.source);
    if (direct) {
      return _result(direct, null, {
        resolver: 'direct',
        basis: SourceResolutionBasis.DIRECT,
        confidence: 0.95,
        attributionQuality: AttributionQuality.SOURCE_ATTRIBUTED,
      });
    }

    // 2. Prefer framework-reported canonical metadata over inferred mapping.
    const framework = _canonicalCandidate(input.frameworkSource || input.frameworkHint);
    if (framework) {
      return _result(framework, null, {
        resolver: 'framework',
        basis: SourceResolutionBasis.FRAMEWORK,
        confidence: 0.9,
        attributionQuality: AttributionQuality.FRAMEWORK_REPORTED,
      });
    }

    const runtime = parseRuntimeSourceLocation(input.source)
      || parseRuntimeSourceLocation(input.generatedSource)
      || parseRuntimeSourceLocation(input.stackFrame);
    const generated = runtime?.generated ? runtime : null;

    // 3. Allow source-map or other mapping providers without a core network dependency.
    if (generated) {
      for (let index = 0; index < this.providers.length; index += 1) {
        const provider = this.providers[index];
        try {
          const resolved = typeof provider === 'function'
            ? await provider({ generated, input })
            : await provider.resolve({ generated, input });
          const original = _canonicalCandidate(resolved);
          if (!original) continue;
          return _result(original, generated, {
            resolver: _providerIdentity(provider, index),
            basis: SourceResolutionBasis.SOURCE_MAP,
            confidence: _clampConfidence(resolved?.confidence, 0.9),
            attributionQuality: AttributionQuality.SOURCE_ATTRIBUTED,
          });
        } catch {
          // Resolution is best-effort. One provider failure must not break diagnostics.
        }
      }
    }

    // 4. Registry/component hints are useful but weaker than source maps.
    const registry = _canonicalCandidate(input.registrySource || input.componentSource);
    if (registry) {
      return _result(registry, generated, {
        resolver: 'registry',
        basis: SourceResolutionBasis.REGISTRY,
        confidence: 0.7,
        attributionQuality: AttributionQuality.SOURCE_ATTRIBUTED,
      });
    }

    // 5/6. Degrade to a sanitized generated location, or an explicit unresolved result.
    if (generated) {
      return _result(null, generated, {
        resolver: 'runtime-normalizer',
        basis: SourceResolutionBasis.GENERATED,
        confidence: 0.25,
        attributionQuality: AttributionQuality.UNKNOWN,
      });
    }

    return _result(null, null, {
      resolver: 'unresolved',
      basis: SourceResolutionBasis.UNRESOLVED,
      confidence: 0,
      attributionQuality: AttributionQuality.UNKNOWN,
    });
  }
}

export {
  SourceResolutionBasis,
  SourceResolver,
  parseRuntimeSourceLocation,
  sanitizeSourceFile,
};
