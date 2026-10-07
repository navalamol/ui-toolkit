# Mission Execution Rules

These rules exist to keep Runtime Intelligence development fast, high-quality, reviewable, and useful.

## Default mission shape

1. Fix scope before coding. Do not expand it unless a blocking defect is found.
2. Spend roughly 80% of effort on code, tests, and validation; keep docs/repo administration to roughly 20% or less.
3. Prefer one implementation commit. A second hardening/fix commit is fine. A third requires a concrete reason.
4. Do not perform repository-history cleanup, archival migration, branch polishing, or unrelated restructuring inside a feature mission.
5. Preserve working product behavior first; refactor incrementally rather than through big-bang rewrites.
6. Every mission must add measurable product value, stronger correctness, or lower future implementation cost. Avoid telemetry/features that do not improve diagnosis or verification.
7. Validate the smallest critical surface first, then broader integration only when it materially reduces risk.
8. Keep handoff documentation concise: what changed, why, evidence/tests, known limits, next mission.
9. If the repository changes concurrently, review the new head and merge only missing improvements. Never overwrite equivalent or better work.
10. Stop when mission acceptance criteria are met. Do not chase perfect history or cosmetic completeness.

## Mission acceptance checklist

- Scope completed without unrelated additions.
- Tests cover the new invariant/behavior and failure case.
- No unsupported causal claim was introduced.
- Cross-framework core changes remain framework-neutral.
- Privacy/security wording matches actual behavior.
- Commit count is normally 1–2.
- Handoff is short enough for another agent to understand quickly.
- Next mission and effort are explicit.

## Priority order

When tradeoffs are required:

**correctness → diagnostic value → cross-framework leverage → enterprise safety → performance/overhead → documentation polish → Git history aesthetics**

Repository/history work must never block valuable product implementation unless the repository is genuinely unsafe to continue from.
