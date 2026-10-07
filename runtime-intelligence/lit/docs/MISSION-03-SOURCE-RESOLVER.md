# Mission 03 — Generic Source Resolver / Source-map Attribution

Status: COMPLETE

## Delivered

- `src/core/source-resolver.js`
  - framework-neutral `SourceResolver`;
  - canonical source-location result with original and generated coordinates;
  - preserves already-canonical sources;
  - prefers framework-reported canonical source metadata;
  - accepts pluggable source-map/mapping providers;
  - supports registry/component source hints as a weaker fallback;
  - parses common runtime stack frames, browser URLs, webpack/vite/file paths and Windows paths;
  - strips URL query values and fragments before retaining source locations;
  - degrades gracefully when mappings are missing or providers fail;
  - requires no network dependency.

- `test/unit/source-resolver.test.mjs`
  - direct canonical source;
  - generated browser URL + query/fragment masking;
  - framework source hint;
  - pluggable source-map provider;
  - provider failure fallback;
  - unresolved fallback;
  - evidence-level non-upgrade invariant;
  - Windows stack paths.

- public exports from `src/index.js`.

## Resolution order

```text
canonical event source
→ framework source hint
→ source-map/mapping provider
→ registry/component hint
→ sanitized generated runtime location
→ unresolved
```

The provider boundary is intentionally small. A provider receives normalized generated coordinates and may return an original source location. This keeps source-map libraries, framework integrations, private map stores, and later IDE/build-tool integrations outside the generic core.

## Product invariant

Source resolution and causal certainty are separate truth axes.

A successful source-map lookup can improve attribution quality to `source-attributed`, but it does not and must not upgrade an event from observation/correlation to attribution/causality. The resolver does not accept, mutate, or return an evidence level.

## Privacy / safety

Source URLs are normalized without query values or fragments so tokens, IDs, route state, or other query data are not retained by this layer. This is bounded source-location hygiene, not a replacement for the planned enterprise privacy/redaction mission.

## Validation

Focused Mission 03 tests were executed with Node's built-in test runner in an isolated ESM harness: 8 passed, 0 failed.

A full checked-out repository test run was not available in the connector environment, so this mission does not claim that the entire repository test suite was executed here.

## Known limits

- No bundled source-map parser/library; actual mapping is supplied through providers.
- No automatic source-map discovery or network fetching.
- No panel/Pinpoint/Fix Table integration yet.
- Blob/data URLs are only normalized/fallback locations unless a provider resolves them.
- Source attribution quality does not imply causal evidence.

## Next mission

Mission 04 — Incident Flight Recorder

Effort: MEDIUM

Goal: maintain a bounded, privacy-aware rolling window of UREP evidence and freeze it automatically or manually around an incident so root-cause investigation has the relevant pre-incident and post-trigger context.
