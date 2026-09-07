---
description: Implement a spec from brief/build — ground first, phases, walk-ready
argument-hint: [BUILD_XX | ADDENDUM_XXY]
---

Implement $1.

1. **Read the spec fully before any code.** Find it via `brief/build/INDEX.md` (builds in `_BUILDS/`, addendums in `_ADDENDUM/`). If the spec references counsel gates or a parent build, read those sections too.
2. **CHECK THE SPEC'S VERIFICATION BEFORE GROUNDING IT.** Run `node scripts/check-spec-verification.mjs <spec path>`. A spec's present-tense claims about the tree are observations and they rot; the stamp says which commit they were read against.
   - **FRESH (0)** → build. The confirmed rows are load-bearing facts you may rely on without re-deriving.
   - **UNRULED (3)** → the refutations have not been ruled on. **Stop and return `decision-needed`** — three of Stéan's dispositions are possible and only one of them is "the spec is wrong" (see `/verify-spec` §5). Building past an unruled refutation is building on a claim someone already found false.
   - **STALE (1) / UNVERIFIED (2)** → **stop and return `decision-needed`**, naming the spec and the exit state. Do not ground it, do not build it, and do not verify it yourself as a side quest — offer `/verify-spec <spec>` as the unblocking action and wait.
   **This fires without the spec author's cooperation, and that is the point** — a spec whose grounding pass was thin looks identical to one whose was thorough, right up until the build extends machinery that isn't there. It is guidance, not a gate: nothing forces this step to run (M-106).
3. **GROUND FIRST — spawn the `grounder` agent** with the spec's concept list and wait for its machinery map before writing anything. Extend what exists; duplicating an existing capability because nobody looked is the most expensive class of mistake here. Treat its collision and gap findings as blockers to resolve, not notes.
4. **Non-negotiables apply to every line:** `org_id` + RLS on every table, `audit_log` on every state change, `consent_log` for POPIA events, amend-forward migrations only (append §N BUILD_XX sections to 001–012; NEVER new numbered files; NEVER touch 007/008), all Anthropic calls through `lib/ai/client.ts`, every env read through `lib/env.ts`, `NEXT_PUBLIC_APP_URL` for every absolute URL.
5. **Sequence phases as spec'd, commit per phase** (commit-as-we-go — never trust an uncommitted working tree). Production-dark behind the gates the spec names. **Delegate the mechanical bulk** within a phase — a codemod, a migrate-N-sites sweep, a rename — to the `implementer` agent while you draft the next phase or the ESLint rule; keep the judgment sites and the SSOT/rule design in the main session. **Spawn it in THIS checkout — never `isolation: "worktree"`** (E10: a worktree is cut from `origin/main`, so on a feature branch the agent transforms a different tree from yours and its green check proves nothing about yours). This line said "worktree-isolated" until 2026-09-07, which contradicted CLAUDE.md §5 and the E10 finding it records.
6. **Deviations are allowed but never silent.** Each deviation from spec gets flagged in the report with reasoning — the spec author decides whether it stands. A deviation forced by a **refuted** verification row is not yours to settle either — it goes back as `decision-needed`.
7. Finish with `/walk`, then `/wrap`.
