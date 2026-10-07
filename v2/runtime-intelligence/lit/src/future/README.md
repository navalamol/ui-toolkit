# future/

Files here are **valuable eventually but not yet active**.

They are correct architecture for scenarios that are not yet wired up in the
active intelligence pipeline. They are kept here so future development can
pick them up cleanly without rebuilding from scratch.

## Contents

| File | Why deferred | When to reconnect |
|---|---|---|
| `resource-ownership-ledger.js` | Parallel model to `memory.js`; no active UREP caller. This is the highest-value deterministic Intelligence scenario: resource outlived owner (listener / timer / subscription leak). | Reconnect when `memory.js` emits `RESOURCE_ACQUIRED` / `RESOURCE_RELEASED` UREP events. Wire findings as `LIFETIME_VIOLATION`-level evidence into `EvidenceGraph`. This will make root-cause candidates far more trustworthy for leak scenarios. |
