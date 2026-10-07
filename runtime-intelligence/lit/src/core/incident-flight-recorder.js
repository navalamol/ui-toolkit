const RecorderState = Object.freeze({
  RUNNING: 'running',
  PENDING_FREEZE: 'pending-freeze',
  FROZEN: 'frozen',
  STOPPED: 'stopped',
});

function _positiveInt(value, fallback, minimum = 1) {
  return Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback;
}

function _nonNegativeInt(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function _freezeEvents(events) {
  return Object.freeze([...events]);
}

function _incidentSnapshot({ id, reason, triggerEventId, triggerSequence, frozenAt, events }) {
  const ordered = [...events].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  return Object.freeze({
    id,
    reason,
    triggerEventId,
    triggerSequence,
    frozenAt,
    eventCount: ordered.length,
    firstSequence: ordered[0]?.sequence ?? null,
    lastSequence: ordered.at(-1)?.sequence ?? null,
    firstTimestamp: ordered[0]?.timestamp ?? null,
    lastTimestamp: ordered.at(-1)?.timestamp ?? null,
    events: _freezeEvents(ordered),
  });
}

/**
 * Framework-neutral incident flight recorder for immutable UREP events.
 *
 * The recorder adds retention/freeze semantics only. It does not enrich evidence,
 * infer causality, or perform privacy redaction beyond what the evidence producer
 * already applied.
 */
class IncidentFlightRecorder {
  #store;
  #unsubscribe = null;
  #events = [];
  #state = RecorderState.STOPPED;
  #incident = null;
  #pending = null;
  #incidentSequence = 0;
  #maxEvents;
  #maxAgeMs;
  #autoFreeze;
  #clock;

  constructor({
    store,
    maxEvents = 300,
    maxAgeMs = 30_000,
    autoFreeze = null,
    clock = () => Date.now(),
    start = true,
  } = {}) {
    if (!store || typeof store.subscribe !== 'function') {
      throw new TypeError('IncidentFlightRecorder requires an EvidenceStore-compatible store.');
    }
    if (autoFreeze != null && typeof autoFreeze !== 'function') {
      throw new TypeError('autoFreeze must be a function when provided.');
    }
    if (typeof clock !== 'function') {
      throw new TypeError('IncidentFlightRecorder clock must be a function.');
    }
    this.#store = store;
    this.#maxEvents = _positiveInt(maxEvents, 300);
    this.#maxAgeMs = Number.isFinite(maxAgeMs) && maxAgeMs >= 0 ? maxAgeMs : 30_000;
    this.#autoFreeze = autoFreeze;
    this.#clock = clock;
    if (start) this.start();
  }

  start() {
    if (this.#unsubscribe) return this;
    this.#unsubscribe = this.#store.subscribe(event => this.#record(event));
    if (this.#state === RecorderState.STOPPED) this.#state = RecorderState.RUNNING;
    return this;
  }

  stop() {
    if (this.#unsubscribe) this.#unsubscribe();
    this.#unsubscribe = null;
    if (this.#state !== RecorderState.FROZEN) this.#state = RecorderState.STOPPED;
    return this;
  }

  #record(event) {
    if (this.#state === RecorderState.FROZEN || this.#state === RecorderState.STOPPED) return;

    this.#events.push(event);
    this.#trim(event);

    if (this.#pending) {
      if (event.sequence !== this.#pending.triggerSequence) this.#pending.remaining -= 1;
      if (this.#pending.remaining <= 0) this.#finalizeFreeze();
      return;
    }

    if (!this.#autoFreeze) return;

    let decision = false;
    try { decision = this.#autoFreeze(event, this); } catch { decision = false; }
    if (!decision) return;

    const options = decision === true ? {} : decision;
    this.freeze({
      reason: options.reason || 'automatic',
      triggerEvent: event,
      postTriggerEvents: options.postTriggerEvents ?? 0,
    });
  }

  #trim(latestEvent) {
    while (this.#events.length > this.#maxEvents) this.#events.shift();

    const latestTimestamp = Number.isFinite(latestEvent?.timestamp)
      ? latestEvent.timestamp
      : this.#clock();
    const cutoff = latestTimestamp - this.#maxAgeMs;
    while (
      this.#events.length &&
      Number.isFinite(this.#events[0]?.timestamp) &&
      this.#events[0].timestamp < cutoff
    ) {
      this.#events.shift();
    }
  }

  freeze({
    reason = 'manual',
    triggerEvent = null,
    triggerEventId = null,
    postTriggerEvents = 0,
  } = {}) {
    if (this.#state === RecorderState.FROZEN) return this.#incident;
    if (this.#pending) return null;

    const trigger = triggerEvent || (triggerEventId
      ? this.#events.find(event => event.id === triggerEventId) || null
      : this.#events.at(-1) || null);
    const remaining = _nonNegativeInt(postTriggerEvents, 0);

    this.#pending = {
      id: `incident-${++this.#incidentSequence}`,
      reason,
      triggerEventId: trigger?.id || triggerEventId || null,
      triggerSequence: trigger?.sequence ?? null,
      remaining,
    };
    this.#state = RecorderState.PENDING_FREEZE;

    if (remaining === 0) return this.#finalizeFreeze();
    return null;
  }

  #finalizeFreeze() {
    if (!this.#pending) return this.#incident;
    this.#incident = _incidentSnapshot({
      ...this.#pending,
      frozenAt: this.#clock(),
      events: this.#events,
    });
    this.#pending = null;
    this.#state = RecorderState.FROZEN;
    return this.#incident;
  }

  resume({ clear = true } = {}) {
    this.#incident = null;
    this.#pending = null;
    if (clear) this.#events = [];
    this.#state = this.#unsubscribe ? RecorderState.RUNNING : RecorderState.STOPPED;
    return this;
  }

  snapshot() {
    return _freezeEvents(this.#events);
  }

  incident() {
    return this.#incident;
  }

  state() {
    return this.#state;
  }

  clear() {
    if (this.#state === RecorderState.PENDING_FREEZE) {
      throw new TypeError('Cannot clear while an incident freeze is pending.');
    }
    this.#events = [];
    return this;
  }
}

export { RecorderState, IncidentFlightRecorder };
