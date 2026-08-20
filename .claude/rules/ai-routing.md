---
paths:
  - "lib/ai/**"
---

## AI MODEL ROUTING (unchanged)

Haiku 4.5:  triage, classification, SMS copy
Sonnet 4.6: income extraction, FitScore, lease drafting, arrears comms,
            deposit justifications, municipal extraction, AGM notices
Opus 4.6:   Tribunal submissions, LODs, eviction notices (Firm tier only)

**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — `createMessage` (`lib/ai/client.ts`) is the required entry point (the `no-restricted-imports` block in `eslint.config.mjs` forbids a direct `@anthropic-ai/sdk` import, forcing calls through it — that block's rule id, `no-restricted-imports`, does actually resolve under the `eslint:` grammar since it's literally quoted, but this specific claim is about the MODEL argument, not the import restriction), and nothing asserts the MODEL argument each call site passes matches this table. Sketch: a parity/enumeration test (per `.claude/rules/lint-rules.md`) deriving every `createMessage` call site from disk and asserting its model argument against the task it performs.

---

