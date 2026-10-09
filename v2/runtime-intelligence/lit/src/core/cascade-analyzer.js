/**
 * CascadeAnalyzer — framework-neutral.
 *
 * Analyzes an EvidenceGraph for reactive cascade patterns: one component update
 * triggering one or more child/sibling component updates (DEPENDENCY_TRIGGERED events).
 *
 * Input: any EvidenceGraph built from UREP events.
 * Output: CascadeReport | null (null = no cascade detected).
 */
import { RuntimeEventType } from './evidence-protocol.js';

const DEFAULT_OVER_REACTING_THRESHOLD = 3;

class CascadeAnalyzer {
    #overReactingThreshold;

    constructor({ overReactingThreshold = DEFAULT_OVER_REACTING_THRESHOLD } = {}) {
        this.#overReactingThreshold = overReactingThreshold > 0 ? overReactingThreshold : DEFAULT_OVER_REACTING_THRESHOLD;
    }

    /**
     * @param {import('./evidence-graph.js').EvidenceGraph} graph
     * @returns {CascadeReport | null}
     */
    analyze(graph) {
        const nodes = graph.nodes();
        const triggerEvents = nodes.filter(n => n.type === RuntimeEventType.DEPENDENCY_TRIGGERED);
        if (triggerEvents.length === 0) return null;

        // Map: UPDATE_STARTED.id → DEPENDENCY_TRIGGERED[] caused by that start event
        const startIdToTriggers = new Map();
        for (const ev of triggerEvents) {
            const parentStartId = ev.correlation?.causedByEventId;
            if (!parentStartId) continue;
            if (!startIdToTriggers.has(parentStartId)) startIdToTriggers.set(parentStartId, []);
            startIdToTriggers.get(parentStartId).push(ev);
        }

        // Map: ownerId → last UPDATE_STARTED.id for that owner (for cascade tree traversal)
        const startEvents = nodes.filter(n => n.type === RuntimeEventType.UPDATE_STARTED);
        const ownerIdToLastStartId = new Map();
        for (const ev of startEvents) {
            if (ev.owner?.id) ownerIdToLastStartId.set(ev.owner.id, ev.id);
        }

        // Find the cascade root start event (UPDATE_STARTED that kicked off the cascade)
        // Use the first DEPENDENCY_TRIGGERED's causedByEventId as the root start
        const rootStartIds = new Set(startIdToTriggers.keys());
        // A root start has no incoming DEPENDENCY_TRIGGERED pointing to it from another start
        // i.e., no DEPENDENCY_TRIGGERED whose owner's last startId matches this start
        let rootStartId = null;
        for (const startId of rootStartIds) {
            // Check if this startId belongs to a component that was itself triggered
            const startEvent = nodes.find(n => n.id === startId);
            const ownerId = startEvent?.owner?.id;
            const wasCascadeTrigger = ownerId && triggerEvents.some(e => e.owner?.id === ownerId);
            if (!wasCascadeTrigger) {
                rootStartId = startId;
                break;
            }
        }
        // Fallback: use the start with the lowest sequence number
        if (!rootStartId) {
            let lowestSeq = Infinity;
            for (const startId of rootStartIds) {
                const ev = nodes.find(n => n.id === startId);
                if ((ev?.sequence ?? Infinity) < lowestSeq) {
                    lowestSeq = ev?.sequence ?? Infinity;
                    rootStartId = startId;
                }
            }
        }

        // Find the STATE_CHANGED or INTERACTION root event (walk up causedBy chain)
        const rootEventId = this.#findCascadeRoot(rootStartId, nodes);

        // Compute max cascade depth from rootStartId
        const depth = this.#computeDepth(rootStartId, startIdToTriggers, ownerIdToLastStartId, new Map());

        // Count triggers per owner (for over-reacting detection)
        const ownerTriggerCount = new Map(); // ownerId → { count, tag }
        for (const ev of triggerEvents) {
            const id = ev.owner?.id;
            if (!id) continue;
            if (!ownerTriggerCount.has(id)) ownerTriggerCount.set(id, { count: 0, tag: ev.owner?.name ?? id });
            ownerTriggerCount.get(id).count += 1;
        }

        // Add root component (the one whose start kicked off the cascade)
        const rootStartEvent = nodes.find(n => n.id === rootStartId);
        const rootOwnerId = rootStartEvent?.owner?.id;
        const componentCount = ownerTriggerCount.size + (rootOwnerId && !ownerTriggerCount.has(rootOwnerId) ? 1 : 0);

        // Sum totalUpdateMs for cascaded owners (their UPDATE_COMPLETED durationMs)
        const cascadedOwnerIds = new Set(ownerTriggerCount.keys());
        let totalUpdateMs = 0;
        for (const ev of nodes) {
            if (ev.type === RuntimeEventType.UPDATE_COMPLETED &&
                cascadedOwnerIds.has(ev.owner?.id) &&
                Number.isFinite(ev.payload?.durationMs)) {
                totalUpdateMs += ev.payload.durationMs;
            }
        }

        // Build per-owner branch summaries
        const branches = [];
        for (const [ownerId, { count, tag }] of ownerTriggerCount) {
            branches.push({
                ownerId,
                tag,
                triggerCount: count,
                depth: this.#ownerDepth(ownerId, rootStartId, startIdToTriggers, ownerIdToLastStartId),
            });
        }
        branches.sort((a, b) => a.depth - b.depth || b.triggerCount - a.triggerCount);

        const overReactingOwners = branches
            .filter(b => b.triggerCount > this.#overReactingThreshold)
            .map(({ ownerId, tag, triggerCount }) => Object.freeze({ ownerId, tag, triggerCount }));

        return Object.freeze({
            hasCascade: true,
            rootEventId: rootEventId ?? null,
            triggerCount: triggerEvents.length,
            componentCount,
            depth,
            totalUpdateMs: Math.round(totalUpdateMs * 100) / 100,
            branches: Object.freeze(branches.map(b => Object.freeze(b))),
            overReactingOwners: Object.freeze(overReactingOwners),
        });
    }

    // Walk from a start event up the causedBy chain to find a STATE_CHANGED or INTERACTION event
    #findCascadeRoot(startId, nodes) {
        let currentId = startId;
        const seen = new Set();
        while (currentId && !seen.has(currentId)) {
            seen.add(currentId);
            const ev = nodes.find(n => n.id === currentId);
            if (!ev) break;
            if (ev.type === RuntimeEventType.STATE_CHANGED || ev.type === RuntimeEventType.INTERACTION) {
                return ev.id;
            }
            currentId = ev.correlation?.causedByEventId;
        }
        return startId;
    }

    // Recursively compute max depth of cascade tree from a given start event
    #computeDepth(startId, startIdToTriggers, ownerIdToLastStartId, memo) {
        if (!startId) return 0;
        if (memo.has(startId)) return memo.get(startId);

        const children = startIdToTriggers.get(startId) || [];
        if (children.length === 0) {
            memo.set(startId, 0);
            return 0;
        }

        let max = 0;
        for (const child of children) {
            const childOwnerId = child.owner?.id;
            const childStartId = childOwnerId ? ownerIdToLastStartId.get(childOwnerId) : null;
            const childDepth = this.#computeDepth(childStartId, startIdToTriggers, ownerIdToLastStartId, memo);
            max = Math.max(max, 1 + childDepth);
        }
        memo.set(startId, max);
        return max;
    }

    // BFS from rootStartId to find depth at which ownerId first appears
    #ownerDepth(ownerId, rootStartId, startIdToTriggers, ownerIdToLastStartId) {
        const queue = [{ startId: rootStartId, depth: 0 }];
        const visited = new Set();
        while (queue.length > 0) {
            const { startId, depth } = queue.shift();
            if (!startId || visited.has(startId)) continue;
            visited.add(startId);
            const children = startIdToTriggers.get(startId) || [];
            for (const child of children) {
                if (child.owner?.id === ownerId) return depth + 1;
                const nextStartId = child.owner?.id ? ownerIdToLastStartId.get(child.owner.id) : null;
                queue.push({ startId: nextStartId, depth: depth + 1 });
            }
        }
        return 1;
    }
}

export { CascadeAnalyzer };
