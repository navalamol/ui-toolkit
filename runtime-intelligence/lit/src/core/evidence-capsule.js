import { sanitizeSourceFile } from './source-resolver.js';
import {
  ENTERPRISE_SAFE_PRIVACY_POLICY,
  sanitizeForExport,
  sanitizeForExportWithAudit,
} from './enterprise-privacy.js';

const EVIDENCE_CAPSULE_SCHEMA_VERSION = '1.0';
const MAX_EXPORTED_EVIDENCE_REFERENCES = 40;
const MAX_ROOT_SYMPTOMS = 20;
const MAX_ROOT_CANDIDATES = 10;

function _portableClone(value, memo = new WeakMap(), stack = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (stack.has(value)) return '[Circular]';
  if (memo.has(value)) return memo.get(value);
  const out = Array.isArray(value) ? [] : {};
  memo.set(value, out);
  stack.add(value);
  for (const [key, child] of Object.entries(value)) out[key] = _portableClone(child, memo, stack);
  stack.delete(value);
  return out;
}

function _deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) _deepFreeze(child, seen);
  return Object.freeze(value);
}

function _eventReference(event) {
  return {
    id: event?.id || null,
    sequence: Number.isFinite(event?.sequence) ? event.sequence : null,
    timestamp: Number.isFinite(event?.timestamp) ? event.timestamp : null,
    type: event?.type || null,
    owner: event?.owner ? {
      id: event.owner.id || null,
      kind: event.owner.kind || null,
      name: event.owner.name || null,
      lifecycleGeneration: Number.isFinite(event.owner.lifecycleGeneration) ? event.owner.lifecycleGeneration : null,
    } : null,
    evidence: event?.evidence ? {
      level: event.evidence.level || null,
      attribution: event.evidence.attribution || null,
      confidence: Number.isFinite(event.evidence.confidence) ? event.evidence.confidence : null,
    } : null,
    correlation: event?.correlation ? {
      parentEventId: event.correlation.parentEventId || null,
      causedByEventId: event.correlation.causedByEventId || null,
      hasTraceContext: !!event.correlation.traceId,
      hasInteractionContext: !!event.correlation.interactionId,
    } : null,
  };
}

function _sourceSummary(source) {
  if (!source) return null;
  return {
    file: sanitizeSourceFile(source.file),
    line: Number.isFinite(source.line) ? source.line : null,
    column: Number.isFinite(source.column) ? source.column : null,
    functionName: source.functionName || null,
    originalFile: sanitizeSourceFile(source.originalFile),
    originalLine: Number.isFinite(source.originalLine) ? source.originalLine : null,
    originalColumn: Number.isFinite(source.originalColumn) ? source.originalColumn : null,
    generatedFile: sanitizeSourceFile(source.generatedFile),
    generatedLine: Number.isFinite(source.generatedLine) ? source.generatedLine : null,
    generatedColumn: Number.isFinite(source.generatedColumn) ? source.generatedColumn : null,
    resolver: source.resolver || null,
    basis: source.basis || null,
    confidence: Number.isFinite(source.confidence) ? source.confidence : null,
    attributionQuality: source.attributionQuality || null,
  };
}

function _rootSummary(rootCause) {
  if (!rootCause) return null;
  const symptoms = Array.isArray(rootCause.symptoms) ? rootCause.symptoms : [];
  const candidates = Array.isArray(rootCause.candidates) ? rootCause.candidates : [];
  return {
    clusterId: rootCause.id || null,
    strength: rootCause.strength || null,
    rootEventId: rootCause.rootEventId || null,
    rootLabel: rootCause.rootLabel || null,
    score: Number.isFinite(rootCause.score) ? rootCause.score : null,
    symptoms: _portableClone(symptoms.slice(0, MAX_ROOT_SYMPTOMS)),
    omittedSymptoms: Math.max(0, symptoms.length - MAX_ROOT_SYMPTOMS),
    candidates: _portableClone(candidates.slice(0, MAX_ROOT_CANDIDATES)),
    omittedCandidates: Math.max(0, candidates.length - MAX_ROOT_CANDIDATES),
  };
}

function buildEvidenceCapsuleAIPrompt(capsule) {
  const problem = capsule.problem?.summary || capsule.problem?.title || 'runtime issue';
  const root = capsule.rootCause?.rootLabel || capsule.rootCause?.rootEventId || 'unresolved root';
  const source = capsule.source?.file
    ? `${capsule.source.file}${capsule.source.line ? `:${capsule.source.line}` : ''}${capsule.source.column ? `:${capsule.source.column}` : ''}`
    : 'unresolved source';
  const verification = capsule.verification?.outcome || 'not verified';
  return `Investigate ${problem}. Likely root: ${root}. Source: ${source}. Verification: ${verification}. Use the evidence references and causal chain, preserve stated evidence levels, and do not promote correlation to causality without verification.`;
}

function createEvidenceCapsule({
  id,
  createdAt = Date.now(),
  problem,
  trigger = null,
  owner = null,
  source = null,
  incident = null,
  rootCause = null,
  causalChain = [],
  attribution = null,
  recommendation = null,
  verification = null,
  environment = {},
  aiPrompt = null,
  privacyPolicy = ENTERPRISE_SAFE_PRIVACY_POLICY,
  maxEvidenceReferences = MAX_EXPORTED_EVIDENCE_REFERENCES,
} = {}) {
  if (!id) throw new TypeError('Evidence Capsule requires id.');
  if (!problem) throw new TypeError('Evidence Capsule requires problem.');

  const events = Array.isArray(incident?.events) ? incident.events : [];
  const referenceLimit = Number.isFinite(maxEvidenceReferences)
    ? Math.max(1, Math.floor(maxEvidenceReferences))
    : MAX_EXPORTED_EVIDENCE_REFERENCES;
  const referencedEvents = events.slice(-referenceLimit);
  const raw = {
    schema: 'RUF Evidence Capsule',
    schemaVersion: EVIDENCE_CAPSULE_SCHEMA_VERSION,
    id,
    createdAt,
    problem: _portableClone(problem),
    trigger: _portableClone(trigger || (incident ? {
      eventId: incident.triggerEventId || null,
      sequence: incident.triggerSequence ?? null,
      reason: incident.reason || null,
    } : null)),
    owner: _portableClone(owner),
    source: _sourceSummary(source),
    evidence: {
      eventCount: events.length,
      payloadsIncluded: false,
      references: referencedEvents.map(_eventReference),
      eventIds: referencedEvents.map(event => event?.id || null).filter(Boolean),
      omittedReferences: Math.max(0, events.length - referencedEvents.length),
    },
    rootCause: _rootSummary(rootCause),
    causalChain: _portableClone(Array.isArray(causalChain) ? causalChain.slice(-20) : []),
    attribution: _portableClone(attribution || (source?.attributionQuality ? {
      quality: source.attributionQuality,
      confidence: source.confidence ?? null,
    } : null)),
    recommendation: _portableClone(recommendation),
    verification: _portableClone(verification),
    environment: _portableClone(environment),
  };

  let capsule;
  if (privacyPolicy === false) {
    capsule = _portableClone(raw);
    capsule.privacy = { enforced: false, boundary: 'export' };
  } else {
    const effective = privacyPolicy || ENTERPRISE_SAFE_PRIVACY_POLICY;
    const sanitized = sanitizeForExportWithAudit(raw, effective);
    capsule = sanitized.value;
    capsule.privacy = sanitized.audit;
  }

  capsule.aiPrompt = aiPrompt == null
    ? buildEvidenceCapsuleAIPrompt(capsule)
    : (privacyPolicy === false
      ? String(aiPrompt)
      : sanitizeForExport(String(aiPrompt), privacyPolicy || ENTERPRISE_SAFE_PRIVACY_POLICY));

  return _deepFreeze(capsule);
}

export {
  EVIDENCE_CAPSULE_SCHEMA_VERSION,
  MAX_EXPORTED_EVIDENCE_REFERENCES,
  createEvidenceCapsule,
  buildEvidenceCapsuleAIPrompt,
};
