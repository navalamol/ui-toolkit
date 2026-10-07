# Mission 07 — Enterprise Privacy / Redaction

Status: COMPLETE + HARDENED

## Delivered

- `src/core/enterprise-privacy.js`
  - centralized capture/export privacy policy;
  - safe-by-default enterprise preset;
  - secret/token/password/cookie/auth redaction;
  - URL query-value masking and fragment removal;
  - request/response body shape-only capture by default;
  - DOM text shape-only capture by default;
  - state/prop value shape-only capture for state/update evidence;
  - email/phone/Bearer/Basic/JWT scrubbing;
  - export-time removal of raw trace/interaction identifiers;
  - bounded depth/key/string processing;
  - immutable privacy audit summaries.

- `EvidenceStore`
  - applies privacy before immutable UREP creation;
  - records privacy audit metadata;
  - supports explicit `privacyPolicy:false` only for trusted/local diagnostics.

- `Evidence Capsule`
  - re-applies export privacy to caller-supplied investigation metadata;
  - preserves structural evidence references while omitting raw event payloads;
  - keeps raw correlation identifiers out of exported Capsules.

## Mission 07 hardening

A post-implementation review identified two generic enterprise leak paths.

### 1. Unknown/custom header values

Previously, a header such as:

```text
X-Customer-Account: customer-123
```

could survive because the name was not on the secret-header list.

The enterprise default now:

- always redacts sensitive headers;
- keeps values only for a small structural allowlist:
  - `Accept`
  - `Content-Type`
  - `Content-Length`
  - `Cache-Control`
- redacts values of other headers by default;
- allows trusted/custom policies to opt into additional header values.

This prevents business-specific or proprietary custom headers from silently bypassing the privacy boundary.

### 2. Browser-native Headers support

`sanitizeHeaders()` now accepts:

- plain objects;
- `[name, value]` arrays;
- iterable / `Headers`-style objects exposing `entries()`.

This avoids a browser integration path where header objects could be handled inconsistently.

### Additional hardening

- owner `name` / `label` strings are scrubbed for configured inline PII;
- source `functionName` is scrubbed;
- compound key matching covers suffix forms such as `authToken`, `clientSecret`, `apiKey`, `authorization` and `cookie`;
- arrays report truncation in privacy audit metadata;
- privacy-policy version is now `1.1`.

## Product model

```text
collector / framework adapter
        ↓
raw diagnostic input
        ↓
Enterprise Privacy Policy
        ↓
sanitized immutable UREP
        ↓
Store → Graph → Flight Recorder → Ledger
        ↓
export boundary
        ↓
Enterprise Privacy Policy
        ↓
Evidence Capsule / AI handoff / later reports
```

Privacy is enforced at both boundaries because sanitized runtime evidence can still be combined with later caller-supplied report metadata.

## Default enterprise policy

```text
Authorization / Proxy-Authorization → redact
Cookie / Set-Cookie                 → redact
API keys / tokens / passwords       → redact
unknown/custom header values        → redact
safe protocol header allowlist      → retain
URL query values                    → mask
URL fragments                       → remove
request/response body               → shape-only
DOM text                            → shape-only
state / prop runtime values         → shape-only
email / phone                       → redact
Bearer / Basic credentials          → redact
JWT-like values                     → redact
traceId / interactionId on export   → drop
```

Structural evidence such as event type, timing, evidence level, causal references, resource IDs, source line/column and property names remains available where safe.

## Invariants

1. Privacy never upgrades or downgrades evidence level.
2. Privacy never changes attribution quality.
3. Capture privacy preserves causal/correlation identifiers required by the Evidence Graph.
4. Export privacy may remove raw correlation identifiers.
5. Producer input is not mutated.
6. Privacy audit metadata contains transformation counts, not captured secret values.
7. `privacyPolicy:false` is an explicit escape hatch, never the default.
8. Shape-only is safer than bounded/raw capture but is not a DLP guarantee.

## Validation

Focused Mission 07 hardening tests plus existing Evidence Capsule compatibility tests were executed with Node's built-in test runner in an isolated ESM harness:

**14 passed, 0 failed**

Coverage includes URL masking, sensitive and unknown headers, safe-header allowlisting, `Headers`-style iterables, EvidenceStore enforcement, state/DOM shaping, trusted policy behavior, export correlation-ID removal, email/phone/token redaction, owner/source label scrubbing, Capsule export enforcement, explicit privacy disable behavior, input immutability, audit non-leakage and existing Capsule compatibility.

A full checked-out repository test execution is not claimed in the connector environment.

## Known limits

- Pattern-based PII handling is not a DLP/classification engine.
- URL path segments are preserved; default masking targets query values/fragments.
- Owner/event/resource identifiers are expected to be opaque technical IDs; automatic stable pseudonymization is not implemented.
- Business-specific privacy classification may still require organization-level policy configuration.
- Encryption, tenant policy distribution, RBAC and persistent audit infrastructure are outside the local runtime scope.

## Next mission

Mission 08 — Rules / Budgets / Suppressions

Effort: MEDIUM

Goal: deterministic local diagnostic rules for thresholds, budgets, severity and suppressions without turning the runtime core into a cloud policy engine.
