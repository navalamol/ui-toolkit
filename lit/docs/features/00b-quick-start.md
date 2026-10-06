# Quick Start — lit-debug-suite

From zero to your first insight in under 5 minutes.

---

## Step 1 — Open DevTools console

Open the page you want to investigate. Press `F12` → Console tab.

---

## Step 2 — Enable the tool you need

Paste one of these into the console and press Enter:

```js
// Slow page load? Start here.
window.__LDS_PERF_ENABLED__ = true;

// Possible memory leak?
window.__LDS_MEMORY_REPORT__()   // always on — no flag needed

// Network requests failing or slow?
window.__LDS_NETWORK_ENABLED__ = true;

// Component re-rendering too much?
window.__LDS_PROP_DEBUG__ = 'your-component-tag';

// Event listener leak?
window.__LDS_RESOURCE_TRACKER__ = true;

// Everything at once (development only — higher overhead):
window.__LDS_DEBUG__ = true;
```

> **Reload required for most tools.** Set the flag, then reload the page. The tools need to be active when elements first mount.

---

## Step 3 — Use the app normally

Navigate to the problem area. Reproduce the behavior you're investigating. The tools collect data silently in the background.

- For **Perf**: load the page, scroll, open a modal — let everything render
- For **Network**: navigate to a page and let all requests complete
- For **Resource Tracker**: navigate to the page, then navigate *away* (this triggers disconnect detection)
- For **Prop Audit**: interact with the specific component causing re-renders — watch the console

---

## Step 4 — Open the panel

Click the **🐞 badge** in the bottom-right corner of the page.

```
Summary · Pinpoint · Vitals · Network · Falcor · Perf · Errors · Console · Events · SlowAPI · Memory · History · Env
```

**Which tab to open first:**

| You're investigating... | Go to... |
|------------------------|----------|
| Slow initial load | **Perf** tab |
| Memory growing over time | **Memory** tab |
| Network failures or slowness | **Network** tab |
| Too many / slow Falcor calls | **Falcor** tab (requires `__LDS_NETWORK_ENABLED__`) |
| Duplicate Falcor data fetches | **Falcor** tab → analytics footer for dup path count |
| LCP / CLS / INP score | **Vitals** tab |
| Console errors | **Console** tab |
| Event bus behaviour | **Events** tab |
| Slow API calls | **SlowAPI** tab |
| Any kind of issue (aggregated) | **Pinpoint** tab |
| Page regression vs last session | **Summary** tab → Workflow Baseline |

> **Tools without a dedicated tab:** Prop Audit (02), Component Inspector (03), Cycle Detector (09), and Resource Tracker (10) have no panel tab — their findings appear in **Pinpoint**. See each tool's doc for details.

---

## Step 5 — Act on what you see

**Panel → Pinpoint tab** is the main action surface. It aggregates findings from all active tools and shows:
- What the problem is (finding type)
- How confident the diagnosis is (evidence level)
- What file and line to look at (`readHint`)
- A ready-to-paste Claude Code prompt (`evidenceCapsule.claudePrompt`)

Click **Export Fix Table** to download the structured JSON. Paste it — or the `claudePrompt` from a specific finding — into Claude Code to get a targeted fix.

---

## Enabling multiple tools at once

```js
// For Falcor investigation (Syndigo-specific):
window.__LDS_NETWORK_ENABLED__ = true;   // captures XHR/fetch
window.__LDS_FALCOR_VIEW__ = true;       // shows Falcor tab
// reload → navigate to entity page → open 🐞 → Falcor tab

// Selective master flag — enables only the named tools
window.__LDS_DEBUG__ = {
  perf:           true,
  network:        true,
  vitals:         true,
  console:        true,
};

// Full master flag — all 12 tools (use with caution on complex pages)
window.__LDS_DEBUG__ = true;
```

---

## Sharing a debug session

1. Open the panel → **Download JSON** — exports the full current report
2. Send the file to a teammate
3. They open the panel → **Import** — loads your session into their panel

The report includes all active tool data: perf counters, network log, console buffer, vitals, memory counters, slow API log, and Fix Table findings.

---

## What's next

- [Symptom → tool map](13-tool-by-symptom.md) — not sure which tool to use? Start here
- [Pinpoint tab guide](00c-pinpoint-tab.md) — how to read findings and use the Fix Table
- [Troubleshooting](14-troubleshooting.md) — nothing showing? Common causes and fixes
