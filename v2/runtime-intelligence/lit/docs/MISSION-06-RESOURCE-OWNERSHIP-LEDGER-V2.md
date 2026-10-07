# Mission 06 — Runtime Resource Ownership Ledger v2

Status: COMPLETE

## Delivered

- `src/core/resource-ownership-ledger.js`
  - framework-neutral ownership ledger over UREP `owner.*` and `resource.*` evidence;
  - tracks acquisition/release against lifecycle-specific owners;
  - distinguishes physical owner identity from lifecycle generation;
  - detects resources that remain active after their lifecycle owner is destroyed;
  - emits a **confirmed lifetime violation finding** only when both resource ownership and owner lifecycle evidence are at least framework-reported;
  - otherwise produces an explicit **suspected lifetime violation** at correlation level;
  - optional framework capability resolver caps event-level certainty, so an adapter declaring partial ownership support cannot be overruled by optimistic event metadata;
  - converts findings into UREP-compatible `diagnostic` event inputs without auto-emitting them synchronously;
  - preserves late cleanup history (`released-after-owner-destroyed`);
  - protects against release events from the wrong lifecycle owner;
  - supports EvidenceStore-compatible replay + incremental subscription;
  - bounds records/findings/processed IDs so the diagnostics ledger cannot grow without limit;
  - reports when active evidence had to be evicted because of hard bounds;
  - source locations are sanitized through Mission 03 source hygiene;
  - raw resource handles/payload values are not retained by the ledger.

- `test/unit/resource-ownership-ledger.test.mjs`
  - deterministic lifetime violation;
  - release-before-destroy false-positive prevention;
  - partial resource-ownership capability downgrade;
  - partial owner-lifecycle capability downgrade;
  - lifecycle-generation isolation;
  - wrong-owner release protection;
  - late cleanup after violation;
  - UREP diagnostic conversion;
  - bounded self-memory;
  - EvidenceStore replay/incremental behavior.

- public exports from `src/index.js`.

## Product model

```text
owner.created
      ↓
resource.acquired
      ↓
resource ledger
      ↓
owner.destroyed
      ↓
resource still active?
   ├─ no  → healthy/closed lifetime
   └─ yes
        ↓
   evaluate proof strength
        ↓
   ownership >= framework-reported
   AND lifecycle >= framework-reported
        ├─ yes → lifetime-violation
        └─ no  → correlation-level suspected violation
```

## Evidence law

`resource.active + owner.destroyed` is not automatically a proven leak.

A confirmed `lifetime-violation` requires strong evidence for **both**:

1. this resource really belongs to this lifecycle owner; and
2. this owner lifecycle really ended.

Framework capability may cap event-level attribution. Example: if a Lit collector reports deterministic-looking ownership but the adapter capability is only `partial`, the ledger must remain at a suspected/correlation finding.

The ledger does **not** promote findings to `retainer-confirmed`; that requires stronger engine/heap retention evidence in a later memory mission.

## Resource identity contract

Acquisition/release matching requires a stable `payload.resourceId` (or `payload.resource.id`). `payload.resourceType` is recommended and may be any string; common exported kinds include event listeners, timers, animation frames, observers, AbortController/fetch, WebSocket, Worker and subscriptions.

Owner identity uses `owner.id + owner.lifecycleGeneration`. Reconnecting the same physical component under a new generation is therefore a different ownership window.

## Integration boundary

The ledger intentionally does not patch browser APIs in this mission. Collectors/adapters remain responsible for emitting:

```text
resource.acquired
resource.released
owner.created
owner.destroyed
```

The generic core only reconciles those facts.

`toEvidenceInput(finding)` returns a UREP-compatible diagnostic input. It does not synchronously call `EvidenceStore.emit()` from inside the subscription callback because re-entrant emission could reorder downstream subscriber observation. Consumers can emit the generated diagnostic after the originating event dispatch completes.

## Privacy / enterprise safety

The ledger retains structural resource identity and lifecycle metadata only. It does not retain browser resource handles, event targets, callback functions, request bodies, subscription objects or arbitrary acquisition payloads. Source file values reuse `sanitizeSourceFile`.

This is still not a replacement for Mission 07 enterprise privacy/redaction.

## Validation

Focused Mission 06 tests were executed with Node's built-in test runner in an isolated ESM harness: **10 passed, 0 failed**.

A full checked-out repository test execution is not claimed in the connector environment.

## Known limits

- No browser API auto-instrumentation yet; adapters/collectors must emit resource evidence.
- Stable resource IDs are required for acquisition/release matching.
- If lifecycle generation is unavailable and owner IDs are reused, ownership windows cannot be separated perfectly.
- Capability capping is optional; integrations should provide the framework adapter capability resolver when framework-level support is known.
- Hard memory bounds can evict still-active records under extreme volume; `droppedActiveResources` makes that evidence loss explicit.
- No heap/retainer confirmation in this mission.
- No UI/panel integration yet.

## Next mission

Mission 07 — Enterprise Privacy / Redaction

Effort: MEDIUM-HIGH

Goal: enforce centralized capture/export policies for headers, tokens, URL query values, request bodies, DOM text and props/state so runtime evidence, flight-recorder snapshots and Evidence Capsules can be shared safely across enterprise environments.
