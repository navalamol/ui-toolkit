# archive/

Files here are **detached from the active pipeline**.

All import references in `src/index.js` and other active modules have been
commented out. These files are kept for historical record and future
reconsideration — do not automatically reconnect them without a product
decision to do so.

## Contents

| File | Why archived |
|---|---|
| `diagnostic-policy.js` | Over-abstracted diagnostic gate (budget rules, rate-limit buckets, policy engine). The active pipeline uses the simpler `gate.js`. No current caller in the intelligence pipeline. Reconnect if dynamic per-tool budgeting becomes a real product requirement. |
