/**
 * FalcorCallGraph — detects bursts of Falcor network calls and identifies the
 * originating function via Lowest Common Ancestor (LCA) of their call stacks.
 *
 * Subscribes to LdsNetwork directly (not the evidence store) so it has access
 * to decoded Falcor metadata and the call stack captured at fetch() call time.
 *
 * Enable: window.__LDS_FALCOR_VIEW__ = true
 */
const BURST_GAP_MS = 200;
const MAX_BURSTS   = 100;

export class FalcorCallGraph {
    #network;
    #unsubscribe = null;
    #pending     = [];   // raw entries collected for current burst
    #pendingLast = 0;    // endTs of most recent pending entry
    #bursts      = [];   // finalized BurstGroup[]
    #flushTimer  = null;

    constructor({ network }) {
        if (!network || typeof network.subscribe !== 'function') {
            throw new TypeError('FalcorCallGraph requires a network object with subscribe()');
        }
        this.#network = network;
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

    getBursts() { return [...this.#bursts]; }

    #onEntry(entry) {
        if (entry?.decoded?.protocol !== 'falcor') return;

        const endTs   = entry.ts ? new Date(entry.ts).getTime() : Date.now();
        const startTs = endTs - (Number.isFinite(entry.durationMs) ? entry.durationMs : 0);

        // Is this entry part of the current burst? (start within BURST_GAP_MS of last end)
        if (this.#pending.length > 0 && startTs - this.#pendingLast < BURST_GAP_MS) {
            this.#pending.push({ entry, startTs, endTs });
        } else {
            if (this.#pending.length >= 2) this.#finalizeBurst();
            this.#pending = [{ entry, startTs, endTs }];
        }
        this.#pendingLast = endTs;

        clearTimeout(this.#flushTimer);
        this.#flushTimer = setTimeout(() => {
            if (this.#pending.length >= 2) this.#finalizeBurst();
            this.#pending = [];
        }, 300);
    }

    #finalizeBurst() {
        const calls = [...this.#pending];
        const stacks = calls.map(c => this.#parseStack(c.entry.callStack ?? ''));
        const originator = this.#findLCA(stacks);

        const burst = Object.freeze({
            id:            `burst-${calls[0].startTs}`,
            startTs:       calls[0].startTs,
            endTs:         calls[calls.length - 1].endTs,
            totalMs:       calls[calls.length - 1].endTs - calls[0].startTs,
            callCount:     calls.length,
            paths:         calls.map(c => this.#firstPath(c.entry)),
            payloads:      calls.map(c => c.entry.decoded?.paths ?? null),
            originatorFrame: originator.frame,
            originatorFn:  originator.fn,
            originatorFile: originator.file,
            originatorLine: originator.line,
        });

        this.#bursts.push(burst);
        if (this.#bursts.length > MAX_BURSTS) this.#bursts.shift();
    }

    #firstPath(entry) {
        const paths = entry.decoded?.paths;
        if (Array.isArray(paths) && paths.length) return JSON.stringify(paths[0]);
        return entry.url ?? '';
    }

    #parseStack(raw) {
        return String(raw ?? '').split('\n')
            .map(s => s.trim())
            .filter(s =>
                s.startsWith('at ') &&
                !s.includes('<anonymous>') &&
                !s.includes('falcor-call-graph') &&
                !s.includes('network.js')
            )
            .slice(0, 15);
    }

    // Lowest Common Ancestor: find the most-specific frame present in ALL stacks.
    // Scans from index 0 (most-recent / closest to the API call) toward the oldest
    // frame. The first frame common to all stacks is the burst originator — the
    // function that directly caused all N Falcor calls.
    #findLCA(stacks) {
        const empty = { frame: '', fn: 'unknown', file: '', line: '' };
        if (!stacks.length || !stacks[0].length) return empty;

        for (const frame of stacks[0]) {
            if (stacks.every(s => s.includes(frame))) {
                return this.#parseFrame(frame);
            }
        }
        return empty;
    }

    // Parse "at FnName (path/to/file.js:42:8)" or "at path/to/file.js:42:8"
    #parseFrame(frame) {
        const m = frame.match(/at\s+(?:(\S+)\s+\()?([^)]+):(\d+):\d+\)?/);
        if (!m) return { frame, fn: frame, file: '', line: '' };
        const file = m[2] ?? '';
        const fn   = m[1] ?? file.split('/').pop() ?? 'unknown';
        return { frame, fn, file, line: m[3] ?? '' };
    }
}
