# Runtime Intelligence Engineering Rules

These rules apply to every future mission unless a concrete defect requires an exception.

## Mission efficiency contract

1. **Code and tests first.** Target roughly 80% of mission effort on implementation, validation, and useful product behavior; no more than roughly 20% on docs/repository administration.
2. **One mission = one primary commit.** A second hardening/fix commit is acceptable; a third requires a real defect or integration issue. Never create commit noise for documentation mechanics.
3. **No history perfection inside feature missions.** Branch cleanup, squashing, archival imports, repository migrations, and historical reconstruction are separate maintenance work and must not block product implementation.
4. **Freeze scope before coding.** Additions discovered mid-mission go to the next mission unless they are necessary for correctness, safety, or validation.
5. **Every mission must deliver executable value.** Architecture-only work must include tests/fixtures proving the contract. Documentation alone cannot close a product mission.
6. **Validate the changed surface, not everything by default.** Run focused tests and syntax/build checks for touched modules. Expand only when integration risk justifies it.
7. **Prefer cross-framework leverage.** Generic enhancements that improve Lit + React + Vue/Angular/Svelte receive higher priority than framework-specific convenience features.
8. **Evidence honesty is non-negotiable.** Correlation is not causality; adapters must not advertise proof strength they cannot produce.
9. **Local-first / bounded / zero-cost core.** Do not add cloud, CI, paid services, telemetry upload, or external runtime dependencies without explicit approval.
10. **Stop when mission acceptance criteria pass.** Do not spend time polishing history, renaming unrelated files, or expanding documentation after the mission is objectively complete.
11. **Main Platform compatibility is a first-class invariant.** Generic/runtime-intelligence work is additive. Do not remove, hide, rename, or stop building baseline Main Platform/Syndigo/Falcor surfaces such as `lit/custom/ui-platform` unless an explicit migration mission replaces them with verified compatibility.
12. **Preserve baseline formatting and minimize diffs.** For files inherited from the canonical baseline, keep the original indentation, comments, ordering, and layout. Change only lines required for the feature or fix; do not minify, compress, broadly reformat, or perform unrelated cleanup in the same mission.

## Required mission closeout

A mission closes with only:
- implementation;
- focused tests and exact result;
- one concise mission/handoff note containing decisions, limitations, and next work;
- commit SHA.

If execution time starts exceeding the implementation value, reassess scope immediately instead of continuing repository/process work.
