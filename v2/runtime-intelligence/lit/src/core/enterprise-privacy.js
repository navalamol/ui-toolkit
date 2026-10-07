import { RuntimeEventType } from './evidence-protocol.js';

const PRIVACY_POLICY_VERSION = '1.1';

const PrivacyAction = Object.freeze({
  KEEP: 'keep',
  REDACT: 'redact',
  DROP: 'drop',
  SHAPE: 'shape',
});

const _actions = new Set(Object.values(PrivacyAction));
const _sensitiveKeys = new Set([
  'authorization', 'proxyauthorization', 'cookie', 'setcookie',
  'password', 'passwd', 'pwd', 'token', 'accesstoken', 'refreshtoken',
  'idtoken', 'apikey', 'xapikey', 'secret', 'clientsecret',
  'credential', 'credentials', 'sessionid', 'sessiontoken', 'jwt',
]);
const _sensitiveHeaders = new Set([
  'authorization', 'proxy-authorization', 'cookie', 'set-cookie',
  'x-api-key', 'x-auth-token', 'x-access-token',
]);
const _urlKeys = new Set([
  'url', 'uri', 'href', 'endpoint', 'requesturl', 'responseurl', 'sourceurl',
]);
const _headerKeys = new Set(['headers', 'requestheaders', 'responseheaders']);
const _bodyKeys = new Set([
  'requestbody', 'responsebody', 'requestpayload', 'responsepayload',
]);
const _domTextKeys = new Set([
  'domtext', 'textcontent', 'innertext', 'outertext', 'innerhtml', 'outerhtml',
]);
const _stateKeys = new Set(['oldvalue', 'newvalue', 'value', 'state', 'props']);

function _deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) _deepFreeze(child, seen);
  return Object.freeze(value);
}

function _normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function _isSensitiveKey(key) {
  const normalized = _normalizeKey(key);
  if (_sensitiveKeys.has(normalized)) return true;
  return normalized.endsWith('token')
    || normalized.endsWith('secret')
    || normalized.endsWith('password')
    || normalized.endsWith('apikey')
    || normalized.endsWith('authorization')
    || normalized.endsWith('cookie');
}

function _mergePolicy(overrides = {}) {
  const base = {
    id: 'ruf-enterprise-default',
    version: PRIVACY_POLICY_VERSION,
    sensitiveFields: PrivacyAction.REDACT,
    sensitiveHeaders: PrivacyAction.REDACT,
    headerValues: PrivacyAction.REDACT,
    safeHeaderValues: ['accept', 'content-type', 'content-length', 'cache-control'],
    urlQuery: PrivacyAction.REDACT,
    requestBody: PrivacyAction.SHAPE,
    responseBody: PrivacyAction.SHAPE,
    domText: PrivacyAction.SHAPE,
    stateValues: PrivacyAction.SHAPE,
    exportCorrelationIds: PrivacyAction.DROP,
    pii: {
      email: PrivacyAction.REDACT,
      phone: PrivacyAction.REDACT,
    },
    maxDepth: 8,
    maxKeys: 50,
    maxString: 256,
  };
  const merged = {
    ...base,
    ...overrides,
    pii: { ...base.pii, ...(overrides.pii || {}) },
    safeHeaderValues: Array.isArray(overrides.safeHeaderValues)
      ? [...overrides.safeHeaderValues]
      : [...base.safeHeaderValues],
  };
  for (const key of [
    'sensitiveFields', 'sensitiveHeaders', 'headerValues', 'urlQuery',
    'requestBody', 'responseBody', 'domText', 'stateValues',
    'exportCorrelationIds',
  ]) {
    if (!_actions.has(merged[key])) {
      throw new TypeError(`Invalid privacy action for ${key}: ${merged[key]}`);
    }
  }
  for (const key of ['email', 'phone']) {
    if (!_actions.has(merged.pii[key])) {
      throw new TypeError(`Invalid privacy action for pii.${key}: ${merged.pii[key]}`);
    }
  }
  merged.safeHeaderValues = merged.safeHeaderValues
    .map(value => String(value).toLowerCase());
  merged.maxDepth = Number.isFinite(merged.maxDepth)
    ? Math.max(1, Math.floor(merged.maxDepth))
    : base.maxDepth;
  merged.maxKeys = Number.isFinite(merged.maxKeys)
    ? Math.max(1, Math.floor(merged.maxKeys))
    : base.maxKeys;
  merged.maxString = Number.isFinite(merged.maxString)
    ? Math.max(16, Math.floor(merged.maxString))
    : base.maxString;
  return _deepFreeze(merged);
}

function createPrivacyPolicy(overrides = {}) {
  return _mergePolicy(overrides);
}

const ENTERPRISE_SAFE_PRIVACY_POLICY = createPrivacyPolicy();

function _newAudit(policy, boundary) {
  return {
    policyId: policy.id,
    policyVersion: policy.version,
    enforced: true,
    boundary,
    redacted: 0,
    dropped: 0,
    shaped: 0,
    maskedUrls: 0,
    truncated: 0,
  };
}

function _finalAudit(audit) {
  return _deepFreeze({ ...audit });
}

function _redactedValue() {
  return '[REDACTED]';
}

function _scrubString(input, policy, audit) {
  let value = String(input);
  let changed = false;

  const bearer = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
  if (bearer.test(value)) {
    value = value.replace(bearer, '$1 [REDACTED]');
    changed = true;
  }

  const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
  if (jwt.test(value)) {
    value = value.replace(jwt, '[REDACTED_TOKEN]');
    changed = true;
  }

  if (policy.pii.email !== PrivacyAction.KEEP) {
    const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
    if (email.test(value)) {
      value = value.replace(email, '[REDACTED_EMAIL]');
      changed = true;
    }
  }

  if (policy.pii.phone !== PrivacyAction.KEEP) {
    const phone = /(?<!\w)(?:\+?\d[\d\s().-]{8,}\d)(?!\w)/g;
    if (phone.test(value)) {
      value = value.replace(phone, '[REDACTED_PHONE]');
      changed = true;
    }
  }

  if (value.length > policy.maxString) {
    value = `${value.slice(0, policy.maxString)}…`;
    audit.truncated += 1;
  }
  if (changed) audit.redacted += 1;
  return value;
}

function maskUrlQuery(value, policy = ENTERPRISE_SAFE_PRIVACY_POLICY, audit = null) {
  if (typeof value !== 'string') return value;
  const localAudit = audit || _newAudit(policy, 'url');
  if (policy.urlQuery === PrivacyAction.KEEP) {
    return _scrubString(value.split('#', 1)[0], policy, localAudit);
  }

  const hashIndex = value.indexOf('#');
  const withoutFragment = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = withoutFragment.indexOf('?');
  if (queryIndex < 0) return _scrubString(withoutFragment, policy, localAudit);

  const base = withoutFragment.slice(0, queryIndex);
  const query = withoutFragment.slice(queryIndex + 1);
  if (!query) return base;

  const masked = query.split('&').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    const key = index >= 0 ? part.slice(0, index) : part;
    return `${key}=[REDACTED]`;
  }).join('&');
  localAudit.maskedUrls += 1;
  return `${base}?${masked}`;
}

function _shapeValue(value, policy, audit) {
  audit.shaped += 1;
  if (value === null) return { type: 'null', redacted: true };
  if (value === undefined) return { type: 'undefined', redacted: true };
  if (Array.isArray(value)) {
    return { type: 'array', length: value.length, redacted: true };
  }
  const type = typeof value;
  if (type === 'string') return { type, length: value.length, redacted: true };
  if (type === 'number' || type === 'boolean' || type === 'bigint') {
    return { type, redacted: true };
  }
  if (type === 'function') return { type, redacted: true };
  if (type !== 'object') return { type, redacted: true };

  if (
    typeof value.type === 'string'
    && Object.prototype.hasOwnProperty.call(value, 'summary')
  ) {
    const shaped = { type: value.type, summary: `[${value.type}]`, redacted: true };
    if (Number.isFinite(value.length)) shaped.length = value.length;
    if (Array.isArray(value.keys)) {
      shaped.keys = value.keys
        .filter(key => !_isSensitiveKey(key))
        .slice(0, Math.min(policy.maxKeys, 10))
        .map(String);
    }
    return shaped;
  }

  const keys = Object.keys(value)
    .filter(key => !_isSensitiveKey(key))
    .slice(0, Math.min(policy.maxKeys, 10));
  return { type: 'object', keys, redacted: true };
}

function _headerEntries(headers) {
  if (Array.isArray(headers)) return headers;
  if (headers && typeof headers.entries === 'function') {
    try {
      return [...headers.entries()];
    } catch {
      return [];
    }
  }
  if (headers && typeof headers === 'object') return Object.entries(headers);
  return [];
}

function _applyHeaderValuePolicy(rawValue, headerName, policy, audit) {
  const safe = new Set(policy.safeHeaderValues).has(headerName.toLowerCase());
  if (safe) {
    return typeof rawValue === 'string'
      ? _scrubString(rawValue, policy, audit)
      : _shapeValue(rawValue, policy, audit);
  }

  if (policy.headerValues === PrivacyAction.DROP) {
    audit.dropped += 1;
    return undefined;
  }
  if (policy.headerValues === PrivacyAction.SHAPE) {
    return _shapeValue(rawValue, policy, audit);
  }
  if (policy.headerValues === PrivacyAction.KEEP) {
    return typeof rawValue === 'string'
      ? _scrubString(rawValue, policy, audit)
      : _shapeValue(rawValue, policy, audit);
  }
  audit.redacted += 1;
  return _redactedValue();
}

function sanitizeHeaders(
  headers,
  policy = ENTERPRISE_SAFE_PRIVACY_POLICY,
  audit = null,
) {
  const localAudit = audit || _newAudit(policy, 'headers');
  if (!headers || typeof headers !== 'object') {
    return _shapeValue(headers, policy, localAudit);
  }

  const out = {};
  const entries = _headerEntries(headers);
  for (const entry of entries.slice(0, policy.maxKeys)) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [name, rawValue] = entry;
    const key = String(name);
    const normalized = key.toLowerCase();

    if (_sensitiveHeaders.has(normalized) || _isSensitiveKey(key)) {
      if (policy.sensitiveHeaders === PrivacyAction.DROP) {
        localAudit.dropped += 1;
        continue;
      }
      out[key] = _redactedValue();
      localAudit.redacted += 1;
      continue;
    }

    const sanitized = _applyHeaderValuePolicy(
      rawValue,
      key,
      policy,
      localAudit,
    );
    if (sanitized !== undefined) out[key] = sanitized;
  }
  if (entries.length > policy.maxKeys) localAudit.truncated += 1;
  return out;
}

function _shouldShapeBody(key, path) {
  const normalized = _normalizeKey(key);
  if (_bodyKeys.has(normalized)) return true;
  if (normalized !== 'body') return false;
  return path.some(part => /request|response|network|http/i.test(String(part)));
}

function _sanitizeValue(value, policy, audit, {
  key = null,
  path = [],
  eventType = null,
  exportMode = false,
  depth = 0,
  memo = new WeakMap(),
} = {}) {
  if (depth > policy.maxDepth) return _shapeValue(value, policy, audit);

  const normalizedKey = _normalizeKey(key);

  if (
    exportMode
    && (normalizedKey === 'traceid' || normalizedKey === 'interactionid')
  ) {
    if (policy.exportCorrelationIds === PrivacyAction.DROP) {
      audit.dropped += 1;
      return undefined;
    }
    if (policy.exportCorrelationIds === PrivacyAction.REDACT) {
      audit.redacted += 1;
      return _redactedValue();
    }
  }

  if (key != null && _isSensitiveKey(key)) {
    if (policy.sensitiveFields === PrivacyAction.DROP) {
      audit.dropped += 1;
      return undefined;
    }
    audit.redacted += 1;
    return _redactedValue();
  }

  if (_urlKeys.has(normalizedKey) && typeof value === 'string') {
    return maskUrlQuery(value, policy, audit);
  }

  if (_headerKeys.has(normalizedKey)) {
    return sanitizeHeaders(value, policy, audit);
  }

  if (_shouldShapeBody(key, path)) {
    const responseContext = normalizedKey.startsWith('response')
      || path.some(part => /response/i.test(String(part)));
    const action = responseContext ? policy.responseBody : policy.requestBody;
    if (action === PrivacyAction.DROP) {
      audit.dropped += 1;
      return undefined;
    }
    if (action === PrivacyAction.REDACT) {
      audit.redacted += 1;
      return _redactedValue();
    }
    if (action === PrivacyAction.SHAPE) return _shapeValue(value, policy, audit);
  }

  if (_domTextKeys.has(normalizedKey)) {
    if (policy.domText === PrivacyAction.DROP) {
      audit.dropped += 1;
      return undefined;
    }
    if (policy.domText === PrivacyAction.REDACT) {
      audit.redacted += 1;
      return _redactedValue();
    }
    if (policy.domText === PrivacyAction.SHAPE) {
      return _shapeValue(value, policy, audit);
    }
  }

  const stateEvent = eventType === RuntimeEventType.STATE_CHANGED
    || eventType === RuntimeEventType.UPDATE_REQUESTED;
  if (
    (stateEvent && _stateKeys.has(normalizedKey))
    || (exportMode && (normalizedKey === 'state' || normalizedKey === 'props'))
  ) {
    if (policy.stateValues === PrivacyAction.DROP) {
      audit.dropped += 1;
      return undefined;
    }
    if (policy.stateValues === PrivacyAction.REDACT) {
      audit.redacted += 1;
      return _redactedValue();
    }
    if (policy.stateValues === PrivacyAction.SHAPE) {
      return _shapeValue(value, policy, audit);
    }
  }

  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return _scrubString(value, policy, audit);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') {
    audit.redacted += 1;
    return `[${typeof value}]`;
  }

  if (memo.has(value)) return '[Circular]';
  memo.set(value, true);

  if (Array.isArray(value)) {
    const out = value.slice(0, policy.maxKeys).map((item, index) =>
      _sanitizeValue(item, policy, audit, {
        key: index,
        path: [...path, key].filter(item => item != null),
        eventType,
        exportMode,
        depth: depth + 1,
        memo,
      }));
    if (value.length > policy.maxKeys) audit.truncated += 1;
    memo.delete(value);
    return out;
  }

  const out = {};
  const entries = Object.entries(value);
  for (const [childKey, childValue] of entries.slice(0, policy.maxKeys)) {
    const sanitized = _sanitizeValue(childValue, policy, audit, {
      key: childKey,
      path: [...path, key].filter(item => item != null),
      eventType,
      exportMode,
      depth: depth + 1,
      memo,
    });
    if (sanitized !== undefined) out[childKey] = sanitized;
  }
  if (entries.length > policy.maxKeys) audit.truncated += 1;
  memo.delete(value);
  return out;
}

function _sanitizeSource(source, policy, audit) {
  if (!source) return source;
  if (typeof source === 'string') return maskUrlQuery(source, policy, audit);
  const out = { ...source };
  for (const field of ['file', 'url', 'originalFile', 'generatedFile']) {
    if (typeof out[field] === 'string') {
      out[field] = maskUrlQuery(out[field], policy, audit);
    }
  }
  if (typeof out.functionName === 'string') {
    out.functionName = _scrubString(out.functionName, policy, audit);
  }
  return out;
}

function _sanitizeOwner(owner, policy, audit) {
  if (!owner || typeof owner !== 'object') return owner;
  const out = { ...owner };
  for (const field of ['name', 'label']) {
    if (typeof out[field] === 'string') {
      out[field] = _scrubString(out[field], policy, audit);
    }
  }
  return out;
}

function applyPrivacyPolicyToEvidenceInput(
  input,
  policy = ENTERPRISE_SAFE_PRIVACY_POLICY,
) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Evidence input must be an object.');
  }
  const effective = policy || ENTERPRISE_SAFE_PRIVACY_POLICY;
  const audit = _newAudit(effective, 'capture');
  const sanitized = {
    ...input,
    owner: _sanitizeOwner(input.owner, effective, audit),
    source: _sanitizeSource(input.source, effective, audit),
    payload: _sanitizeValue(input.payload || {}, effective, audit, {
      key: 'payload',
      path: [],
      eventType: input.type || null,
      exportMode: false,
    }),
  };
  return Object.freeze({
    input: sanitized,
    audit: _finalAudit(audit),
  });
}

function sanitizeForExportWithAudit(
  value,
  policy = ENTERPRISE_SAFE_PRIVACY_POLICY,
) {
  const effective = policy || ENTERPRISE_SAFE_PRIVACY_POLICY;
  const audit = _newAudit(effective, 'export');
  const sanitized = _sanitizeValue(value, effective, audit, {
    key: 'export',
    path: [],
    eventType: null,
    exportMode: true,
  });
  return Object.freeze({
    value: sanitized,
    audit: _finalAudit(audit),
  });
}

function sanitizeForExport(
  value,
  policy = ENTERPRISE_SAFE_PRIVACY_POLICY,
) {
  return sanitizeForExportWithAudit(value, policy).value;
}

export {
  PRIVACY_POLICY_VERSION,
  PrivacyAction,
  ENTERPRISE_SAFE_PRIVACY_POLICY,
  createPrivacyPolicy,
  maskUrlQuery,
  sanitizeHeaders,
  applyPrivacyPolicyToEvidenceInput,
  sanitizeForExport,
  sanitizeForExportWithAudit,
};