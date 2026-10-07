# Pinpoint Tab — aggregated findings

**Panel tab:** Pinpoint  
**Fed by:** Perf Monitor, Prop Audit, Cycle Detector, Resource Tracker, Memory Counters, Web Vitals

---

## What Pinpoint is

Pinpoint is the findings aggregator. Every tool that detects a problem writes a structured finding to the Pinpoint list. Instead of switching between tabs looking for problems, Pinpoint surfaces everything in one place — ranked by severity.

If you don't know where to start, open Pinpoint first.

---

## What you'll see

The Pinpoint tab shows a list of finding cards, one per detected issue. Each card has:

```
[HIGH] slow-render                                      attribution
rock-grid — avg 823ms (47 renders)
src/elements/rock-grid/rock-grid.js line 184
→ "Reduce render cost: heavy DOM in render() ..."
[Export] [Verify]
```

**Card anatomy:**

| Element | What it means |
|---------|--------------|
| `[HIGH]` severity badge | HIGH / MEDIUM / LOW — how urgent the issue is |
| finding type | `slow-render`, `memory-leak`, `prop-thrash`, `resource-outlived-owner`, etc. |
| evidence level badge | How certain the diagnosis is (see table below) |
| component name | Which component has the issue |
| details line | Measured values that triggered the finding |
| file + line | Where to look in the source (only on `attribution` and above) |
| recommendation | What to do |
| `[Export]` | Download just this finding as Fix Table JSON |
| `[Verify]` | Phase 8 verification — run a baseline/current comparison |

---

## Evidence levels

| Level | Badge colour | Meaning | What to do |
|-------|-------------|---------|-----------|
| `observation` | Grey | Something was measured; cause is unknown | Investigate before acting — could be normal for this page |
| `correlation` | Amber | Multiple signals point the same direction | Strong enough to file a bug; investigate root cause |
| `attribution` | Blue | Source file + line confirmed from call stack | Act on this directly — the source is known |
| `lifetime-violation` | Red | Listener deterministically survived disconnect | Always fix — this is a definite leak, no further investigation needed |
| `causality-confirmed` | Green | Phase 8 verification proved the fix worked | Resolved — keep as documentation |

**Rule of thumb:** `attribution` and `lifetime-violation` are actionable immediately. `observation` needs more evidence first.

---

## Finding types and which tool produces them

| Finding type | Source tool | Typical evidence level |
|-------------|-------------|----------------------|
| `slow-render` | Perf Monitor | `observation` or `attribution` |
| `excessive-renders` | Perf Monitor | `correlation` |
| `memory-leak` | Memory Counters | `observation` or `correlation` |
| `mount-storm` | Memory Counters | `observation` |
| `prop-thrash` | Prop Audit | `attribution` |
| `same-ref-update` | Prop Audit | `observation` |
| `resource-outlived-owner` | Resource Tracker | `lifetime-violation` |
| `circular-update` | Cycle Detector | `attribution` |

---

## Empty Pinpoint tab

If Pinpoint shows no findings:

1. **The active tools found nothing.** This is a good outcome — no issues detected.
2. **Tools aren't enabled.** Check which flags are set: `Object.keys(window).filter(k => k.startsWith('__LDS'))`.
3. **Thresholds not exceeded.** avg ms < 300 won't produce a `slow-render` finding; active count ≤ 3 won't produce a `memory-leak` finding.
4. **Tool not triggered yet.** Resource Tracker only fires at disconnect. Cycle Detector only fires when a cycle actually occurs. Use the app more.

---

## The Fix Table export

Clicking **Export Fix Table** (top of Pinpoint tab) downloads a JSON array. Each element is one finding:

```js
[
  {
    id:                "...",
    component:         "rock-grid",
    filePath:          "src/elements/rock-grid/rock-grid.js",
    issueType:         "slow-render",
    severity:          "HIGH",
    details:           "avg 823ms across 47 renders",
    recommendation:    "...",
    lineNumber:        184,
    readHint:          "Read src/elements/rock-grid/rock-grid.js lines 174 to 194",
    relatedComponents: ["product-tile"],
    evidenceCapsule: {
      problem:          "slow-render",
      component:        "rock-grid",
      file:             "src/elements/rock-grid/rock-grid.js",
      line:             184,
      evidenceLevel:    "attribution",
      observed:         { avgMs: 823, count: 47, maxMs: 1243 },
      callStack:        ["rock-grid.js:184", "..."],
      recommendation:   "...",
      relatedComponents: ["product-tile"],
      claudePrompt:     "Fix a HIGH slow-render issue in <rock-grid>...",
      verification:     null
    },
    reportedAt: "2026-10-06T10:00:00.000Z",
    sessionId:  "..."
  }
]
```

**`claudePrompt`** is a ready-to-paste prompt for Claude Code. It includes the component name, file, line, evidence, and recommendation — everything Claude Code needs to produce a targeted fix.

---

## How to use the Fix Table with Claude Code

1. Open Pinpoint → find the highest-severity finding
2. Click **Export Fix Table** or copy `evidenceCapsule.claudePrompt` from the JSON
3. Open Claude Code in your project directory
4. Paste the `claudePrompt` — it includes the `readHint` so Claude Code reads the right lines first
5. Review the suggested fix, apply it, re-run the session to verify

For `lifetime-violation` findings (Resource Tracker), the recommendation already contains the exact `removeEventListener` call to add — Claude Code just needs to place it in `disconnectedCallback`.

---

## Phase 8 Verification (Verify button)

The **Verify** button on a finding runs a before/after comparison:

1. Click Verify → panel captures current metrics as "baseline"
2. Apply your fix (reload, modify code, etc.)
3. Re-open the panel — metrics are compared to the baseline
4. If the finding's measured value improved: evidence level upgrades to `causality-confirmed`

Verification works for metric-based findings (`slow-render`, `memory-leak`, `prop-thrash`). It does not apply to `circular-update` (detected in real time, not via before/after metrics).
