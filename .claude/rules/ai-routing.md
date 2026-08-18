---
paths:
  - "lib/ai/**"
---

## AI MODEL ROUTING (unchanged)

Haiku 4.5:  triage, classification, SMS copy
Sonnet 4.6: income extraction, FitScore, lease drafting, arrears comms,
            deposit justifications, municipal extraction, AGM notices
Opus 4.6:   Tribunal submissions, LODs, eviction notices (Firm tier only)

**UNENFORCEABLE** — mechanisable and not done: `createMessage` (`lib/ai/client.ts`) is the required entry point (the `no-restricted-imports` block in `eslint.config.mjs` forbids a direct `@anthropic-ai/sdk` import, forcing calls through it — though that block, like other built-in-rule configs, isn't expressible under the pleks-only `eslint:` marker grammar), but nothing asserts the MODEL argument each call site passes matches this table. A parity/enumeration test (per `.claude/rules/lint-rules.md`) could derive every `createMessage` call site from disk and assert its model against the task it performs.

---

