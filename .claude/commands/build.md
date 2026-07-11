---
description: Implement a spec from brief/build — ground first, phases, walk-ready
argument-hint: [BUILD_XX | ADDENDUM_XXY]
---

Implement $1.

1. **Read the spec fully before any code.** Find it via `brief/build/INDEX.md` (builds in `_BUILDS/`, addendums in `_ADDENDUM/`). If the spec references counsel gates or a parent build, read those sections too.
2. **GROUND FIRST — spawn the `grounder` agent** with the spec's concept list and wait for its machinery map before writing anything. Extend what exists; duplicating an existing capability because nobody looked is the most expensive class of mistake here. Treat its collision and gap findings as blockers to resolve, not notes.
3. **Non-negotiables apply to every line:** `org_id` + RLS on every table, `audit_log` on every state change, `consent_log` for POPIA events, amend-forward migrations only (append §N BUILD_XX sections to 001–012; NEVER new numbered files; NEVER touch 007/008), all Anthropic calls through `lib/ai/client.ts`, every env read through `lib/env.ts`, `NEXT_PUBLIC_APP_URL` for every absolute URL.
4. **Sequence phases as spec'd, commit per phase** (commit-as-we-go — never trust an uncommitted working tree). Production-dark behind the gates the spec names.
5. **Deviations are allowed but never silent.** Each deviation from spec gets flagged in the report with reasoning — the spec author decides whether it stands.
6. Finish with `/walk`, then `/wrap`.
