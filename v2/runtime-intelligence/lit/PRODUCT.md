# PRODUCT.md — Runtime Intelligence

> One source of product truth. Read before any session. No duplicates with CLAUDE.md.

---

## What this is

A live in-browser developer tool that tells you **why** your Lit (React next, Vue later) UI is
broken or slow — not just that it is. After reproducing a bug, a developer opens the
**✨ Intelligence** tab and reads: problem → likely cause → source location → what to do next.
No log scanning. No console.log archaeology.

---

## North star metric

> **A developer opens the Intelligence tab after a bug and reaches the correct file/component
> in under 2 minutes — without opening DevTools.**

Everything is measured against this. If a feature does not contribute to this outcome, it is
deferred or killed.

---

## Who uses it

**Persona: Lit/UI Platform developer at Syndigo**

- Builds product UI with Lit components backed by Falcor network calls
- Hits render storms, cascades, mysterious slow renders, tooltip-per-item spam
- Does NOT want another tool that needs configuration — it must work on first open
- Pain: "The profiler says *something* is slow. I have 47 components. Where do I start?"

---

## The two tabs (deliberate separation)

| Tab | Purpose | Triggers |
|---|---|---|
| **✨ Intelligence** | Incident-level root-cause (crash / slow render) | Frozen incident from recorder |
| **⚡ Opportunities** | Proactive structural / optimization patterns | DOM scan + store events |

These must stay separate. Intelligence is reactive (something broke). Opportunities is proactive
(nothing broke yet, but it will). Mixing them erodes trust in both.

---

## Evidence of value (signals we're on track)

- Developer says "I found it faster" after a real bug session with the tool open
- Intelligence tab correctly names the component, not a false positive
- Opportunities tab fires on real UI Platform pages (tooltip duplication, long lists)
- P0 passes: browser validation with `npm link` in UI Platform

---

## Biggest risk right now

**P0 is unverified.** 186 tests pass in Node.js. Zero validation in a real Lit app. The tool
could produce plausible-looking but wrong findings. Until P0 passes, no new features ship.

Secondary risk: **Opportunities advisors with weak signals** (Worker, Idle) generate noise that
erodes trust in the tab. If P0 shows either producing false positives → cut them.

---

## Priority stack (see DECISIONS.md for detail)

1. **P0 — Browser validation** (unblocks everything)
2. **Signal quality audit** — verify Intelligence finding accuracy in real sessions
3. **React wiring** — only when a React consumer project exists
4. **Vue** — after React is proven
5. **New features** — after north star metric is measurably met

---

## What v1 done looks like

- [ ] P0 passes (Intelligence tab accurate in 2 real scenarios)
- [ ] Opportunities tab fires correctly on at least 1 real UI Platform page
- [ ] No false positives in 3 consecutive developer sessions
- [ ] React adapter wired into pipeline (not just written)
- [ ] Distribution path decided (npm package vs. bundled in LDS panel)

---

## Archive plan (docs that have served their purpose)

Move to `docs/archive/` when:
- All mission 01–12 docs — implementation complete, decisions captured in DECISIONS.md
- Feature docs 01–12 — superseded by this product doc + ROADMAP
- CLAUDE-SESSION-HANDOVER-* — captured in ROADMAP and DECISIONS.md
- CODEBASE.md — superseded by CLAUDE.md architecture diagram

Keep active:
- `docs/MISSION-NN-NAME.md` — only the CURRENT + NEXT mission
- `docs/features/NN-name.md` — only features being actively built
- `docs/claude-handover/ROADMAP-AND-NEXT-MISSIONS.md` — always live
