import { EvidenceLevel, RuntimeEventType } from './evidence-protocol.js';
import { EdgeRelation, EvidenceGraph } from './evidence-graph.js';

const _rootTypeWeight = Object.freeze({
  [RuntimeEventType.STATE_CHANGED]: 5,
  [RuntimeEventType.DEPENDENCY_TRIGGERED]: 5,
  [RuntimeEventType.INTERACTION]: 4,
  [RuntimeEventType.UPDATE_REQUESTED]: 3,
  [RuntimeEventType.RESOURCE_ACQUIRED]: 2,
  [RuntimeEventType.NETWORK_STARTED]: 1,
  [RuntimeEventType.UPDATE_STARTED]: 1,
});

const _symptomTypes = new Set([
  RuntimeEventType.UPDATE_COMPLETED,
  RuntimeEventType.NETWORK_COMPLETED,
  RuntimeEventType.BROWSER_FRAME,
  RuntimeEventType.ERROR,
  RuntimeEventType.OWNER_DESTROYED,
]);

const _attributedOrHigher = new Set([
  EvidenceLevel.ATTRIBUTION,
  EvidenceLevel.LIFETIME_VIOLATION,
  EvidenceLevel.RETAINER_CONFIRMED,
  EvidenceLevel.CAUSALITY_CONFIRMED,
]);

function _reachable(graph, id) {
  return graph.descendants(id, { relations: [
    EdgeRelation.CAUSES,
    EdgeRelation.PARENT,
  ] });
}

function _candidateScore(graph, event, componentIds) {
  const descendants = _reachable(graph, event.id).filter(item => componentIds.has(item.id));
  const causalOut = graph.outgoing(event.id).filter(edge => edge.relation === EdgeRelation.CAUSES).length;
  const incomingCausal = graph.incoming(event.id).filter(edge => edge.relation === EdgeRelation.CAUSES).length;
  const symptomReach = descendants.filter(item => _symptomTypes.has(item.type)).length;
  const evidenceBonus = event.evidence?.level === EvidenceLevel.CAUSALITY_CONFIRMED ? 6
    : event.evidence?.level === EvidenceLevel.ATTRIBUTION ? 3
    : event.evidence?.level === EvidenceLevel.CORRELATION ? 1 : 0;
  return (_rootTypeWeight[event.type] || 0) + descendants.length + (causalOut * 2) + (symptomReach * 2) + evidenceBonus - (incomingCausal * 2);
}

function _clusterStrength(graph, componentIds) {
  const edges = graph.edges().filter(edge => componentIds.has(edge.fromEventId) && componentIds.has(edge.toEventId));
  const levels = edges.map(edge => edge.evidence?.level);
  if (levels.includes(EvidenceLevel.CAUSALITY_CONFIRMED)) return 'confirmed';
  if (levels.some(level => _attributedOrHigher.has(level))) return 'attributed';
  return 'correlated';
}

function _symptomSummary(events) {
  const counts = new Map();
  for (const event of events) {
    if (!_symptomTypes.has(event.type)) continue;
    counts.set(event.type, (counts.get(event.type) || 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => Object.freeze({ type, count }));
}

function _rootLabel(event) {
  if (!event) return 'Unknown root';
  const property = event.payload?.property || event.payload?.key;
  const owner = event.owner?.name;
  if (property && owner) return `${owner}.${property}`;
  if (property) return property;
  return owner || event.type;
}

class RootCauseGrouper {
  constructor({ minClusterSize = 2 } = {}) {
    this.minClusterSize = Math.max(2, minClusterSize);
  }

  group(input) {
    const graph = input instanceof EvidenceGraph ? input : new EvidenceGraph(input);
    const clusters = [];
    let clusterSequence = 0;

    for (const ids of graph.connectedComponents()) {
      if (ids.length < this.minClusterSize) continue;
      const componentIds = new Set(ids);
      const events = ids.map(id => graph.node(id)).filter(Boolean).sort((a, b) => a.sequence - b.sequence);
      const candidates = events
        .map(event => ({ event, score: _candidateScore(graph, event, componentIds) }))
        .filter(candidate => candidate.score > 0)
        .sort((a, b) => b.score - a.score || a.event.sequence - b.event.sequence);
      const best = candidates[0] || null;
      const strength = _clusterStrength(graph, componentIds);
      const edges = graph.edges().filter(edge => componentIds.has(edge.fromEventId) && componentIds.has(edge.toEventId));

      clusters.push(Object.freeze({
        id: `cluster-${++clusterSequence}`,
        strength,
        rootEventId: best?.event.id || events[0]?.id || null,
        rootLabel: _rootLabel(best?.event || events[0]),
        score: best?.score || 0,
        eventIds: Object.freeze(events.map(event => event.id)),
        edgeIds: Object.freeze(edges.map(edge => edge.id)),
        symptoms: Object.freeze(_symptomSummary(events)),
        candidates: Object.freeze(candidates.slice(0, 3).map(candidate => Object.freeze({
          eventId: candidate.event.id,
          label: _rootLabel(candidate.event),
          score: candidate.score,
          evidenceLevel: candidate.event.evidence?.level || EvidenceLevel.OBSERVATION,
        }))),
      }));
    }

    return Object.freeze(clusters.sort((a, b) => b.score - a.score));
  }
}

export { RootCauseGrouper };
