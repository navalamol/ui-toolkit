/**
 * SequentialApiDetector — detects N sequential API calls that could be
 * parallelized with Promise.all, pointing at the originating function.
 *
 * Works for BOTH direct and indirect patterns:
 *   Direct:   for(i) { await this.pqr() }             — pqr calls fetch
 *   Indirect: for(i) { this.pqr() }  where pqr→jql→DataObjectManager.initiateRequest
 *
 * In both cases the call stacks of the N fetch() calls share the loop body
 * frame as their Lowest Common Ancestor — that's what we report.
 *
 * Subscribes to LdsNetwork directly so it gets decoded payloads and call stacks
 * captured at fetch() call time (before the async operation).
 *
 * Enable: window.__LDS_INTELLIGENCE_ENABLED__ = true (auto-started by pipeline)
 */

const SEQ_GAP_MS  = 50;   // max ms between end[i] and start[i+1] to be "sequential"
const PARALLEL_MS = 50;   // if ALL starts within this window → already parallel, skip
const MIN_CALLS   = 3;    // minimum sequential calls to report
const MAX_OPPS    = 50;   // rolling cap on stored opportunities
const FLUSH_MS    = 250;  // silence window before analyzing a batch

export class SequentialApiDetector {
    #network;
    #onOpportunity;
    #minCalls;
    #unsubscribe   = null;
    #buffer        = [];   // completed entries within current analysis window
    #flushTimer    = null;
    #opportunities = [];

    /**
     * @param {object} options
     * @param {object} options.network       - LdsNetwork-compatible object with subscribe()
     * @param {function} [options.onOpportunity] - called with each SequentialOpportunity
     * @param {number} [options.minCalls=3]  - minimum sequential calls to flag
     */
    constructor({ network, onOpportunity, minCalls = MIN_CALLS }) {
        if (!network || typeof network.subscribe !== 'function') {
            throw new TypeError('SequentialApiDetector requires a network object with subscribe()');
        }
        this.#network       = network;
        this.#onOpportunity = onOpportunity;
        this.#minCalls      = minCalls;
    }

    start() {
        if (this.#unsubscribe) return;
        this.#unsubscribe = this.#network.subscribe(entry => this.#onEntry(entry));
    }

    stop() {
        this.#unsubscribe?.();
        this.#unsubscribe = null;
        clearTimeout(this.#flushTimer);
    }

    getOpportunities() { return [...this.#opportunities]; }

    #onEntry(entry) {
        if (!entry?.url) return;
        const endTs   = entry.ts ? new Date(entry.ts).getTime() : Date.now();
        const startTs = endTs - (Number.isFinite(entry.durationMs) ? entry.durationMs : 0);

        this.#buffer.push({
            startTs,
            endTs,
            durationMs: entry.durationMs ?? 0,
            url:        entry.url ?? '',
            callStack:  this.#parseStack(entry.callStack ?? ''),
        });

        clearTimeout(this.#flushTimer);
        this.#flushTimer = setTimeout(() => this.#flush(), FLUSH_MS);
    }

    #flush() {
        const calls = this.#buffer.slice().sort((a, b) => a.startTs - b.startTs);
        this.#buffer = [];
        if (calls.length < this.#minCalls) return;

        // Already parallel: all starts within PARALLEL_MS
        const startSpan = calls[calls.length - 1].startTs - calls[0].startTs;
        if (startSpan < PARALLEL_MS) return;

        // Sequential: each start is within SEQ_GAP_MS of the previous end
        let isSequential = true;
        for (let i = 1; i < calls.length; i++) {
            const gap = calls[i].startTs - calls[i - 1].endTs;
            if (gap > SEQ_GAP_MS || gap < -10) { isSequential = false; break; }
        }
        if (!isSequential) return;

        const originator = this.#findLCA(calls.map(c => c.callStack));
        const totalMs    = calls.reduce((s, c) => s + c.durationMs, 0);
        const maxMs      = Math.max(...calls.map(c => c.durationMs));
        const savedMs    = totalMs - maxMs;

        const opp = Object.freeze({
            id:                  `seq-${calls[0].startTs}`,
            callerFn:            originator.fn,
            callerFile:          originator.file,
            callerLine:          originator.line,
            callCount:           calls.length,
            urls:                calls.map(c => c.url),
            totalMs,
            estimatedSavingsMs:  savedMs,
            avgDurationMs:       totalMs / calls.length,
            timestamp:           calls[0].startTs,
        });

        this.#opportunities.push(opp);
        if (this.#opportunities.length > MAX_OPPS) this.#opportunities.shift();
        try { this.#onOpportunity?.(opp); } catch (_) {}
    }

    #parseStack(raw) {
        return String(raw ?? '').split('\n')
            .map(s => s.trim())
            .filter(s =>
                s.startsWith('at ') &&
                !s.includes('<anonymous>') &&
                !s.includes('sequential-api-detector') &&
                !s.includes('network.js')
            )
            .slice(0, 15);
    }

    #findLCA(stacks) {
        const empty = { fn: 'unknown', file: '', line: '' };
        if (!stacks.length || !stacks[0].length) return empty;
        // Scan from most-recent frame (index 0) to oldest — the first frame common
        // to ALL stacks is the most-specific shared callsite (the loop body / direct
        // caller of the API chain), which is where the developer should add Promise.all.
        for (const frame of stacks[0]) {
            if (stacks.every(s => s.includes(frame))) return this.#parseFrame(frame);
        }
        return empty;
    }

    #parseFrame(frame) {
        const m = frame.match(/at\s+(?:(\S+)\s+\()?([^)]+):(\d+):\d+\)?/);
        if (!m) return { fn: frame, file: '', line: '' };
        const file = m[2] ?? '';
        return { fn: m[1] ?? file.split('/').pop() ?? 'unknown', file, line: m[3] ?? '' };
    }
}
