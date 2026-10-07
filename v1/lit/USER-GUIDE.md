# lit-debug-suite — User Guide

Phases 7–9 feature reference. Assumes the tool is already installed and wired into your app. For setup, see [README.md](README.md) and [INTEGRATION-GUIDE.md](INTEGRATION-GUIDE.md).

---

## 1. Quick orientation

`lit-debug-suite` is a 12-tool runtime debug panel for LitElement apps. It tracks memory, performance, network, events, prop changes, and more — all activated at runtime, zero overhead when off.

**Activation:**
```js
window.__LDS_DEBUG__ = true;                          // all 12 tools
window.__LDS_DEBUG__ = { perf: true, memory: true };  // selective
```

The 🐞 badge appears in the bottom-right corner of the page. Click it to open the panel.

**What Phases 1–6 built:**
- 12 diagnostic tools (TTI, memory counters, error capture, prop audit, event tracing, network decoding, history/diff)
- Fix Table export: a structured JSON blob with a `claudePrompt` string you paste into Claude Code

**What Phases 7–9 add:**
- Phase 7: Evidence grading — every finding now has a confidence level badge
- Phase 8: Verification loop — automated before/after comparison after applying a fix
- Phase 9: Resource lifetime tracking — catches event listeners that survive `disconnectedCallback`

---

## 2. The 🐞 badge and panel layout

Click the 🐞 badge to open a slide-in panel with 12 tabs:

```
Summary · Pinpoint · Vitals · Network · Perf · Errors · Console · Events · SlowAPI · Memory · History · Env
```

**Key controls:**
- **Refresh** — captures a fresh snapshot of all tool data
- **Download JSON** — exports the full report as a JSON file (for sharing or importing later)
- **Import** — loads a previously exported JSON report; useful when a customer sends you their report
- **Export Fix Table** (in the Pinpoint tab) — exports structured findings as a JSON array ready for Claude Code

The **Pinpoint** tab is where Phases 7–9 show most of their output. It aggregates detected issues, grades them by evidence quality, and provides the verification workflow.

---

## 3. Phase 7 — Evidence Quality

### 3.1 The Evidence Ladder

Every finding in the Pinpoint tab now carries an evidence level badge. Before Phase 7, all findings were equally unqualified. Now you know which ones to act on immediately and which need more investigation.

| Level | Badge colour | Meaning | When you see it |
|-------|-------------|---------|----------------|
| `observation` | grey | Something was measured; cause unknown | High mount count in a single session |
| `correlation` | blue | Multiple signals point the same direction | Mount count grew across 3+ navigation cycles |
| `attribution` | green | Source file and line confirmed from call stack | Slow render traced to `rock-grid.js:184` |
| `lifetime-violation` | red | Resource provably survived its owner's disconnect | resize listener still active after element removed |
| `causality-confirmed` | teal | An intervention proved the suspect caused the problem | Fix verified via Phase 8 replay |

These levels are ordered by confidence. `observation` is a hypothesis. `causality-confirmed` is proven.

### 3.2 Reading evidence badges in the Pinpoint tab

Each issue card header looks like:

```
[HIGH]  [attribution]  <rock-grid>  slow-render
src/elements/rock-grid/rock-grid.js:184
```

- **Severity** (`HIGH` / `MEDIUM` / `LOW`) — impact estimate
- **Evidence badge** — the coloured level chip
- **Component tag** — the custom element where the issue was detected
- **Issue type** — what kind of problem was found
- **File:line** — present when evidence level is `attribution` or higher

**How to use the levels in practice:**
- `observation` findings → investigate manually before filing a bug or asking Claude Code to fix it. The numbers may reflect normal app behavior.
- `correlation` findings → strong signal, usually worth fixing. Especially true for `progressive-leak` (see §3.4).
- `attribution` findings → file and line confirmed. Copy to Fix Table and send directly to Claude Code.
- `lifetime-violation` findings → deterministic; always worth fixing. No manual investigation needed.

### 3.3 The Evidence Capsule in Fix Table exports

Previously the Fix Table exported a flat `claudePrompt` string per issue. Phase 7 replaces this with a structured `evidenceCapsule` object:

```json
{
  "problem": "memory-leak",
  "component": "rock-grid",
  "file": "src/elements/rock-grid/rock-grid.js",
  "line": 184,
  "evidenceLevel": "correlation",
  "observed": {
    "mounted": 47,
    "unmounted": 4,
    "active": 43,
    "gcCount": 2,
    "leakType": "progressive-leak"
  },
  "callStack": ["rock-grid.js:184", "ruf-element.js:62"],
  "recommendation": "Check disconnectedCallback: remove all addEventListener calls...",
  "relatedComponents": ["product-tile"],
  "claudePrompt": "Fix a high memory-leak issue in <rock-grid>. File: src/elements/...",
  "verification": null
}
```

The `claudePrompt` string is preserved **inside** the capsule for backwards compatibility — any Claude Code script that reads `.claudePrompt` still works unchanged.

After a Phase 8 verification is complete, the `verification` field is filled in:
```json
"verification": {
  "status": "verified",
  "metrics": { "before": { "active": 43 }, "after": { "active": 4 } },
  "comparedAt": "2026-10-06T11:30:00.000Z"
}
```

### 3.4 Progressive vs single-session memory leaks

Before Phase 7, any element with `active > 3` (mounted but not yet GC'd) was flagged as a leak. This produced false positives on any page with repeated navigation.

Phase 7 distinguishes two leak types:

**`leakType: 'progressive-leak'`** (evidence: `correlation`)
The active instance count grew *consistently* across ≥3 completed visibility cycles (tab-focus cycles). This is strong evidence of a real leak — each time the user left the page and came back, more instances accumulated.

**`leakType: 'mount-storm'`** (evidence: `observation`)
A high mount count in a single session with no cycle data. Could be a heavy workflow (e.g. a list that re-renders 40 items), not necessarily a leak.

**How to trigger cycle tracking:**
Navigate away from the page and back at least 3 times (switch tabs, use the browser back button, etc.), then open the panel. If you see `progressive-leak`, the evidence is solid enough to file a bug.

```js
// You can inspect the raw cycle data:
window.__LDS_MOUNT_CYCLES__
// → [{ cycleId: 1, startTs: "...", endTs: "...", counts: { "rock-grid": { mounted: 12, unmounted: 0 } } }, ...]
```

---

## 4. Phase 8 — Verification Loop

### 4.1 Why this exists

After Claude Code applies a fix, you rebuild, reload, and re-open the panel. You then compare this session's numbers against what you remember from before the fix. That mental comparison is error-prone and undocumented.

Phase 8 automates it. You capture a before-state, apply the fix, exercise the component, and the panel shows you a side-by-side comparison with a verified/unverified verdict.

The resulting `verification.status: "verified"` in the Fix Table export gives Claude Code concrete feedback that the fix worked.

### 4.2 Workflow A — same-session replay (most common)

Use this for issues where you can reproduce the problem immediately after reloading.

1. Open the panel and navigate to the **Pinpoint** tab.
2. Find an issue (e.g. `memory-leak` on `rock-grid`, active: 47).
3. Apply the fix — edit the source, rebuild.
4. Reload the page.
5. Re-open the panel. If the issue is still present, expand the card.
6. Click **▶ Replay to verify fix**.
7. A banner appears at the top of the Pinpoint tab:
   ```
   Replaying <rock-grid> — interact with the component then click Done
   ```
8. Navigate to and from the component 3–5 times to exercise the lifecycle.
9. Click **✓ Done** in the banner.
10. The issue card updates with the before/after comparison.

### 4.3 Workflow B — cross-session baseline (for complex bugs)

Use this when the before-state is in a different page load from the after-state. This is useful for bugs that are hard to reproduce on demand, or when you want a clean baseline before you start debugging.

**Step 1 — Capture the baseline (before the fix):**
1. Open the panel → Pinpoint tab.
2. Click **📸 Capture Baseline**.
3. The button changes to show: `📸 Baseline: 11:23:04 ✕`
4. This saves the current metric snapshot to `localStorage`.

**Step 2 — Apply the fix and reload.**

**Step 3 — Verify (after the fix, new page load):**
1. Open the panel. The baseline timestamp badge is still visible (loaded from `localStorage`).
2. Exercise the affected component 3–5 times.
3. Expand the issue card in Pinpoint → click **▶ Replay to verify fix**.
4. Click **✓ Done**.
5. The comparison uses the stored baseline as "before" values.

**To clear the baseline:** click the **✕** next to the timestamp. The next "Capture Baseline" creates a fresh one.

### 4.4 Reading the before/after comparison

The comparison table appears inside the expanded issue card after clicking Done:

```
Metric              Before    After     Change
Active instances    43        4         ✅ 91% improvement
Avg render ms       820       310       ↓  62% improvement
```

- **✅ x%** — improved ≥70%. The fix is considered verified for this metric.
- **↓ x%** — improved but below the 70% threshold. Getting better; may need more iteration.
- **↑ x%** — metric worsened. The fix may have introduced a regression.
- **—** — no measurable data (component wasn't exercised enough during replay).

### 4.5 The ✅ VERIFIED badge

When the primary metric for an issue improved ≥70%, the issue card header gains a `✅ VERIFIED` badge:

```
[HIGH]  [causality-confirmed]  <rock-grid>  memory-leak  ✅ VERIFIED
```

The evidence level also upgrades automatically from `correlation` to `causality-confirmed`.

The Fix Table JSON export gains:
```json
"verification": {
  "status": "verified",
  "metrics": { ... },
  "comparedAt": "2026-10-06T11:45:22.000Z"
}
```

### 4.6 Caveats and edge cases

- **The fix must be applied before clicking ▶ Replay.** The replay measures the post-fix state. Clicking it before rebuilding gives you a comparison of the unfixed component against itself.
- **The component must be exercised.** Clicking Done immediately gives "No measurable data recorded." Mount and unmount the component at least twice during replay.
- **`circular-update` findings cannot be verified this way.** Circular update chains are detected in real time during rendering; they can't be compared across session boundaries.
- **Verification state is session-only.** It resets on page reload. Only the baseline (Workflow B) persists in `localStorage`.
- **One active replay at a time.** Starting a new replay cancels the current one.

---

## 5. Phase 9 — Resource Lifetime Model

### 5.1 What gets tracked

Phase 9 tracks individual event listener registrations to detect which ones survive past `disconnectedCallback`. This catches the most common class of memory leak in LitElement apps: forgetting to call `removeEventListener` for listeners added in `connectedCallback`.

Two tracking layers:

**Layer 1 — Per-element listeners (self):**
Any `this.addEventListener(...)` call inside a tracked element is recorded. If the matching `removeEventListener` is not called before `disconnectedCallback`, a violation is recorded.

**Layer 2 — Global listeners attributed to the element:**
`window.addEventListener(...)` and `document.addEventListener(...)` calls made *synchronously during `connectedCallback`* are attributed to the element that is connecting at that moment.

```js
// Both of these are tracked:
connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this._onClick);          // Layer 1 — self
    window.addEventListener('resize', this._onResize);      // Layer 2 — global, attributed here
}
```

If either listener is not removed in `disconnectedCallback`, a `resource-outlived-owner` violation is recorded.

### 5.2 Enabling the resource tracker

The resource tracker is **off by default**. It patches `addEventListener` on `window`, `document`, and individual elements — which has measurable overhead. Enable it only when you're investigating listener leaks.

```js
// Enable only the resource tracker
window.__LDS_RESOURCE_TRACKER__ = true;

// Enable as part of selective debug mode
window.__LDS_DEBUG__ = { resourceTracker: true, perf: true };

// Enable everything (including resource tracker)
window.__LDS_DEBUG__ = true;
```

The tracker activates on the *next* element mount after the flag is set. If elements are already mounted when you set the flag, those existing listeners are not tracked (only new mounts going forward).

### 5.3 Reading resource-outlived-owner findings

In the Pinpoint tab:

```
[HIGH]  [lifetime-violation]  <rock-grid>  resource-outlived-owner
src/elements/rock-grid/rock-grid.js

<rock-grid> disconnected with unreleased listeners across 1 instance(s):
  2× resize (on window)
  1× click (on self)

💡 Add matching removeEventListener calls in disconnectedCallback
   for each addEventListener in connectedCallback.
```

The evidence level is always `lifetime-violation` — the tracking is deterministic. If the violation is recorded, the listener genuinely survived the element's disconnect.

**Expand the card** to see the call stack showing where `addEventListener` was called (file and line).

**Fix Table export** for a resource-outlived-owner finding:
```json
{
  "problem": "resource-outlived-owner",
  "component": "rock-grid",
  "evidenceLevel": "lifetime-violation",
  "observed": {
    "violationCount": 1,
    "resourceCount": 3,
    "eventTypes": ["resize", "click"]
  },
  "recommendation": "Add removeEventListener in disconnectedCallback for: resize (on window), click (on self)",
  "claudePrompt": "Fix a high resource-outlived-owner issue in <rock-grid>..."
}
```

**Console warnings** are also emitted when a violation is detected:
```
[LdsMemory] lifetime-violation: <rock-grid> (instance #3) disconnected with 3 unreleased resource(s)
  resize on window
  click on self
Details: window.__LDS_RESOURCE_VIOLATIONS__
```

**Inspect all violations programmatically:**
```js
window.__LDS_RESOURCE_VIOLATIONS__
// → [{ ownerId: 3, ownerTag: "rock-grid", instanceNum: 3, resources: [...], detectedAt: "..." }]

// Clear violations and the tracking ledger:
window.__LDS_RESOURCE_VIOLATIONS_RESET__()
```

### 5.4 Suppressing noisy events

Some event types are registered globally as a matter of course (e.g. `scroll` handlers) and are not leaks. The tracker suppresses these by default:

**Default suppressed list:** `mousemove, pointermove, touchmove, scroll, wheel, mouseenter, mouseleave`

To customise the list:
```js
// Replace the defaults — these are the only events that will be suppressed
window.__LDS_SUPPRESS_EVENTS__ = ['mousemove', 'pointermove', 'touchmove', 'scroll', 'resize'];

// Suppress nothing — track every event type (very noisy, use temporarily)
window.__LDS_SUPPRESS_EVENTS__ = [];
```

Set this before the first element mounts, or before enabling `__LDS_RESOURCE_TRACKER__`.

### 5.5 Known limitations

**Async registrations are not tracked.**
Listeners added inside `setTimeout`, `Promise.then`, `requestAnimationFrame`, or `updated()` run after `connectedCallback` returns. At that point there is no current owner, so the listener cannot be attributed to an element. These will not appear as violations even if they leak.

```js
connectedCallback() {
    super.connectedCallback();
    // Tracked ✓
    window.addEventListener('resize', this._onResize);

    // NOT tracked — runs after connectedCallback returns
    setTimeout(() => {
        window.addEventListener('keydown', this._onKey);
    }, 0);
}
```

**Shared listener functions register only once.**
If you pass the same function reference to `addEventListener` on two different targets, only the first registration is tracked (the WeakMap stores one entry per function reference).

**Arrow functions in addEventListener calls.**
```js
// Each call creates a new function — removeEventListener('click', (e)=>{}) won't match
this.addEventListener('click', (e) => this._handleClick(e)); // NOT removable
```
This is a JavaScript language limitation, not a tool limitation. The tracker records the registration, and since the function reference is lost, the corresponding `removeEventListener` can never match — resulting in a false violation. Use named methods or bound properties instead:
```js
this._boundClick = this._handleClick.bind(this);
this.addEventListener('click', this._boundClick);
// In disconnectedCallback:
this.removeEventListener('click', this._boundClick);
```

**Intentional global listeners from singletons.**
If a singleton service or app-level module registers `window.addEventListener` from inside an element's `connectedCallback` (e.g. by calling a shared utility), that registration will be falsely attributed to the element. Suppress the relevant event type via `__LDS_SUPPRESS_EVENTS__`, or restructure the service to not register from inside the lifecycle callback.

---

## 6. Globals reference (Phases 7–9)

| Global | Type | Purpose |
|--------|------|---------|
| `window.__LDS_MOUNT_CYCLES__` | Array (read-only) | Per-visibility-cycle mount counts per tag. Array of `{ cycleId, startTs, endTs, counts: { tag: { mounted, unmounted } } }`. Phase 7. |
| `window.__LDS_RESOURCE_TRACKER__` | Boolean | Set to `true` to enable Phase 9 resource lifetime tracking. Off by default. |
| `window.__LDS_RESOURCE_VIOLATIONS__` | Array (read-only) | All recorded lifetime violations. Each entry: `{ ownerId, ownerTag, instanceNum, resources[], detectedAt }`. Phase 9. |
| `window.__LDS_SUPPRESS_EVENTS__` | Array of strings | Event type names to skip in the resource tracker. Replaces the default suppression list. Phase 9. |
| `window.__LDS_RESOURCE_VIOLATIONS_RESET__()` | Function | Clears `__LDS_RESOURCE_VIOLATIONS__` and the internal tracking ledger. Phase 9. |

---

## 7. End-to-end example: find and verify a listener leak

This walks through a realistic scenario: `<rock-grid>` registers `window.addEventListener('resize', this._onResize)` in `connectedCallback` and never removes it.

### Step 1 — Enable the resource tracker

```js
// In DevTools console, before the page loads the component:
window.__LDS_DEBUG__ = { resourceTracker: true };
```

### Step 2 — Exercise the component

Navigate to a page that renders `<rock-grid>`. Then navigate away (back button, route change, etc.) so the component disconnects.

### Step 3 — Open the panel

Click the 🐞 badge → Pinpoint tab.

You should see:
```
[HIGH]  [lifetime-violation]  <rock-grid>  resource-outlived-owner
<rock-grid> disconnected with unreleased listeners across 1 instance(s):
  1× resize (on window)
```

### Step 4 — Capture the baseline

Click **📸 Capture Baseline** in the Pinpoint tab header. This saves the current violation counts to `localStorage`.

### Step 5 — Export the Fix Table

Click **Export Fix Table**. The JSON includes:
```json
{
  "problem": "resource-outlived-owner",
  "evidenceLevel": "lifetime-violation",
  "observed": { "violationCount": 1, "resourceCount": 1, "eventTypes": ["resize"] },
  "claudePrompt": "Fix a high resource-outlived-owner issue in <rock-grid>..."
}
```

Paste the `claudePrompt` into Claude Code.

### Step 6 — Apply the fix

Claude Code suggests adding to `disconnectedCallback`:
```js
disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('resize', this._onResize); // ← add this
}
```

Apply the fix, rebuild.

### Step 7 — Reload and verify

1. Reload the page.
2. Navigate to `<rock-grid>` and back (to trigger a disconnect).
3. Open the panel → Pinpoint tab.
4. If the violation no longer appears: fixed.
5. If it still appears (e.g. a different instance or event): expand the card → **▶ Replay to verify fix** → exercise the component → **✓ Done**.

### Step 8 — Read the result

```
Active violations:  1  →  0  ✅ 100% improvement
```

The issue card shows `✅ VERIFIED`. The evidence level upgrades to `causality-confirmed`.

### Step 9 — Re-export Fix Table

The updated export now includes:
```json
"verification": {
  "status": "verified",
  "metrics": { "before": { "violationCount": 1 }, "after": { "violationCount": 0 } },
  "comparedAt": "2026-10-06T12:00:00.000Z"
}
```

This closes the loop: Claude Code sees `"status": "verified"` and can mark the task done with confidence.
