# KILL_LIST.md — Runtime Intelligence

> Anti-patterns, banned patterns, and recurring bugs. Check this before closing any mission.

---

## Anti-patterns (never do these)

### 1. Mock the Evidence Store in tests
**What happens:** Tests pass. Production breaks. The store's subscription contract is
non-trivial; a mock never captures the bounded eviction behavior.
**Rule:** Use a real `EvidenceStore({ maxEntries: 50 })` in every test.

### 2. Emit CAUSALITY_CONFIRMED from a heuristic
**What happens:** The Intelligence tab claims certainty it doesn't have. Developer trusts it,
chases the wrong component.
**Rule:** Heuristics use CORRELATION or ATTRIBUTION. CAUSALITY_CONFIRMED requires deterministic
framework causality proof (e.g., parent explicitly triggered child update).

### 3. `instanceof ShadowRoot` in Node.js test environments
**What happens:** `ReferenceError: ShadowRoot is not defined` — advisor test suite crashes.
**Rule:** Always guard: `const ShadowRootCtor = this.#windowTarget?.ShadowRoot ?? (typeof ShadowRoot !== 'undefined' ? ShadowRoot : null)`

### 4. Framework imports in `src/core/`
**What happens:** Vue adapter cannot reuse the analyzer. React adapter test suite pulls in Lit.
**Rule:** Zero framework imports in `src/core/`. Fail code review if present.

### 5. `owner.tag` instead of `owner.name`
**What happens:** `normalizeOwner()` strips the `tag` field before storing. Advisor reads
`undefined`. Finding shows no component name.
**Rule:** Use `event.owner?.name ?? event.owner?.id`. Never `event.owner?.tag`.

### 6. Skipping the SSR guard in `gate.js`
**What happens:** Tool loaded server-side (SSR / Node.js) throws `window is not defined`.
**Rule:** Every `_toolEnabled()` function MUST start with:
```js
if (typeof window === 'undefined') return false;
```

### 7. Global window.__LDS_* for store data
**What happens:** Introduces ambient state coupling — advisors start depending on presence of
globals that may or may not exist.
**Rule:** Advisors subscribe to the Evidence Store directly. Globals are only for debugging
console access (e.g., `__LDS_CASCADE_REPORT__`), never as data source.

---

## Recurring bugs (check before closing any mission)

| Bug | Symptom | Fix |
|---|---|---|
| Stop test counts pre-start diagnostics | `advisor.start()` calls `#scanOnce()` which emits; test checking count after stop finds count > 0 | Compare delta before/after extra scan, not vs 0 |
| `scan()` fires after stop | Advisor stopped but explicit `scan()` still runs | Add `if (this.#active) return;` at top of `scan()` |
| `requestIdleCallback` fake returns 0 | `clearTimeout(0)` no-ops in Node.js; stop test can't cancel | Write stop test using a window WITHOUT `requestIdleCallback` |
| PerformanceObserver callback fires after stop | Fake `disconnect()` is no-op; callback fires anyway | Add `if (!this.#active) return;` at top of every observer callback |
| `emit()` inside observer before `start()` | Observer installed in constructor; fires before active guard set | Move observer installation to `start()` |

---

## Deferred to `src/future/`

Code in `src/future/` is wired but not active. Check before rewriting — it may already exist.

| File | What it does | Wire when |
|---|---|---|
| *(none currently)* | | |

---

## Docs to archive (move to `docs/archive/`)

Move these when all missions are complete and decisions are captured in DECISIONS.md:

- `docs/MISSION-01-*` through `docs/MISSION-12-*` — implementation done
- `docs/features/01-*` through `docs/features/12-*` — superseded by product docs
- `docs/CLAUDE-SESSION-HANDOVER-*` — captured in ROADMAP + DECISIONS.md
- `docs/CODEBASE.md` — superseded by CLAUDE.md architecture diagram
- `docs/ARCHITECTURE.md` — same
- `docs/TECHNICAL-DEBT.md` — items promoted or killed; not a living doc

Keep active until P0 passes:
- `docs/claude-handover/ROADMAP-AND-NEXT-MISSIONS.md`
- Current mission doc only
