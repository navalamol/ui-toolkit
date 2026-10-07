import { AttributionQuality, EvidenceLevel } from './evidence-protocol.js';

const EdgeRelation = Object.freeze({
  CAUSES: 'causes',
  PARENT: 'parent',
  INTERACTION_CONTEXT: 'interaction-context',
  TRACE_CONTEXT: 'trace-context',
});

function _edgeEvidence(event, relation) {
  if (relation === EdgeRelation.CAUSES) {
    return Object.freeze({
      level: event.evidence?.level || EvidenceLevel.OBSERVATION,
      attribution: event.evidence?.attribution || AttributionQuality.UNKNOWN,
      confidence: event.evidence?.confidence ?? null,
    });
  }
  if (relation === EdgeRelation.PARENT) {
    return Object.freeze({
      level: EvidenceLevel.CORRELATION,
      attribution: event.evidence?.attribution || AttributionQuality.UNKNOWN,
      confidence: event.evidence?.confidence ?? null,
    });
  }
  return Object.freeze({
    level: EvidenceLevel.CORRELATION,
    attribution: AttributionQuality.TEMPORAL_INFERENCE,
    confidence: relation === EdgeRelation.INTERACTION_CONTEXT ? 0.7 : 0.6,
  });
}

function _freezeEdge(edge) {
  return Object.freeze({ ...edge, evidence: Object.freeze({ ...edge.evidence }) });
}

class EvidenceGraph {
  #nodes = new Map();
  #edges = [];
  #outgoing = new Map();
  #incoming = new Map();

  constructor(events = [], { includeContextEdges = true } = {}) {
    this.#build(events, includeContextEdges);
  }

  #build(events, includeContextEdges) {
    const ordered = [...events]
      .filter(event => event?.id && Number.isFinite(event.sequence))
      .sort((a, b) => a.sequence - b.sequence);

    for (const event of ordered) this.#nodes.set(event.id, event);

    for (const event of ordered) {
      const causedBy = event.correlation?.causedByEventId;
      if (causedBy && this.#isEarlier(causedBy, event)) {
        this.#addEdge(causedBy, event.id, EdgeRelation.CAUSES, 'explicit-causedByEventId', event);
      }
      const parent = event.correlation?.parentEventId;
      if (parent && parent !== causedBy && this.#isEarlier(parent, event)) {
        this.#addEdge(parent, event.id, EdgeRelation.PARENT, 'explicit-parentEventId', event);
      }
    }

    if (includeContextEdges) {
      this.#addContextEdges(ordered, 'interactionId', EdgeRelation.INTERACTION_CONTEXT);
      this.#addContextEdges(ordered, 'traceId', EdgeRelation.TRACE_CONTEXT);
    }
  }

  #isEarlier(sourceId, target) {
    const source = this.#nodes.get(sourceId);
    return !!source && source.sequence < target.sequence;
  }

  #addEdge(fromEventId, toEventId, relation, basis, targetEvent) {
    if (fromEventId === toEventId) return;
    const from = this.#nodes.get(fromEventId);
    const to = this.#nodes.get(toEventId);
    if (!from || !to || from.sequence >= to.sequence) return;
    const key = `${fromEventId}>${toEventId}:${relation}`;
    if (this.#edges.some(edge => edge.id === key)) return;
    const edge = _freezeEdge({
      id: key,
      fromEventId,
      toEventId,
      relation,
      basis,
      inferred: relation === EdgeRelation.INTERACTION_CONTEXT || relation === EdgeRelation.TRACE_CONTEXT,
      evidence: _edgeEvidence(targetEvent, relation),
    });
    this.#edges.push(edge);
    if (!this.#outgoing.has(fromEventId)) this.#outgoing.set(fromEventId, []);
    if (!this.#incoming.has(toEventId)) this.#incoming.set(toEventId, []);
    this.#outgoing.get(fromEventId).push(edge);
    this.#incoming.get(toEventId).push(edge);
  }

  #addContextEdges(events, field, relation) {
    const groups = new Map();
    for (const event of events) {
      const value = event.correlation?.[field];
      if (!value) continue;
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(event);
    }
    for (const group of groups.values()) {
      const anchor = group[0];
      for (const event of group) {
        if (event.id === anchor.id || this.#hasDirectPath(anchor.id, event.id)) continue;
        this.#addEdge(anchor.id, event.id, relation, `shared-${field}`, event);
      }
    }
  }

  #hasDirectPath(fromEventId, toEventId) {
    return (this.#outgoing.get(fromEventId) || []).some(edge => edge.toEventId === toEventId);
  }

  node(id) { return this.#nodes.get(id) || null; }
  nodes() { return [...this.#nodes.values()]; }
  edges() { return [...this.#edges]; }
  outgoing(id) { return [...(this.#outgoing.get(id) || [])]; }
  incoming(id) { return [...(this.#incoming.get(id) || [])]; }

  descendants(id, { relations = null } = {}) {
    const allowed = relations ? new Set(relations) : null;
    const seen = new Set();
    const queue = [id];
    while (queue.length) {
      const current = queue.shift();
      for (const edge of this.#outgoing.get(current) || []) {
        if (allowed && !allowed.has(edge.relation)) continue;
        if (seen.has(edge.toEventId)) continue;
        seen.add(edge.toEventId);
        queue.push(edge.toEventId);
      }
    }
    return [...seen].map(eventId => this.#nodes.get(eventId)).filter(Boolean);
  }

  connectedComponents() {
    const remaining = new Set(this.#nodes.keys());
    const components = [];
    while (remaining.size) {
      const seed = remaining.values().next().value;
      const ids = [];
      const queue = [seed];
      remaining.delete(seed);
      while (queue.length) {
        const id = queue.shift();
        ids.push(id);
        const neighbors = [
          ...(this.#outgoing.get(id) || []).map(edge => edge.toEventId),
          ...(this.#incoming.get(id) || []).map(edge => edge.fromEventId),
        ];
        for (const neighbor of neighbors) {
          if (!remaining.has(neighbor)) continue;
          remaining.delete(neighbor);
          queue.push(neighbor);
        }
      }
      components.push(ids);
    }
    return components;
  }
}

export { EdgeRelation, EvidenceGraph };
