<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Pleks — Agent Rules

## MANDATORY: Read before starting any work

Read in this order every session (including after compaction):
1. `brief/build/CURRENT.md` — what step is active, what was just done, what's next
2. `brief/build/INDEX.md` — full queue, build status, known open work
3. The relevant spec file in `brief/build/_BUILDS/` or `brief/build/_ADDENDUM/`

If `CURRENT.md` does not exist, create it using the template structure in `CLAUDE.md`.

---

## MANDATORY: Run checks before every commit

```bash
npm run check
```

This runs TypeScript type checking + ESLint. **If it fails, fix the errors before committing.** Do not push broken code.

- `npm run typecheck` — TypeScript only (~15 seconds)
- `npm run check` — TypeScript + ESLint (run this before every commit)

---

## MANDATORY: Update CURRENT.md after every step

After completing any meaningful step, update `brief/build/CURRENT.md`:
- Active build and step number
- What was just completed (one line per item)
- Exact next action
- Any mid-build decisions not captured in the spec
- Any files to avoid touching

Do this before committing. It is your working memory across compactions and new sessions.

---

## Read before you build

All specs are in `brief/build/`. The index is `brief/build/INDEX.md`.
Read the relevant spec AND the actual source files before making changes.

---

## Auth patterns — use the right helper

| Situation | Helper | File |
|-----------|--------|------|
| Agent write (any mutation) | `requireAgentWriteAccess(action)` | `lib/auth/server.ts` |
| Agent read (queries, exports) | `gateway()` or `gatewaySSR()` | `lib/supabase/gateway` |
| Org membership only | `getServerOrgMembership()` | `lib/auth/server.ts` |
| Cron / webhook handler | validate own secret — do NOT use gateway | — |
| Tenant portal action | `getTenantSession()` | `lib/portal/` |

`requireAgentWriteAccess(action)` throws `SubscriptionLockdownError` (403) when the org is paused or cancelled. Every agent-side mutation must go through it. Never bypass with bare `gateway()` on a write path.

---

## Key rules

- `org_id` on every database table (RLS enforcement)
- Never commit without passing `npm run check`
- Never modify migrations 001–012 without explicit instruction
- Read the source file before editing it — do not guess at current state
- Use `getOrgDisplayName()` from `lib/org/displayName.ts` for display names — do not read `org.name` directly
- Cron and webhook handlers bypass the subscription lockdown — do not add `requireAgentWriteAccess` to them
