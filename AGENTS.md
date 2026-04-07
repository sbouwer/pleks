<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Pleks — Agent Rules

## MANDATORY: Run checks before every commit

```bash
npm run check
```

This runs TypeScript type checking + ESLint. **If it fails, fix the errors before committing.** Do not push broken code.

- `npm run typecheck` — TypeScript only (~15 seconds)
- `npm run check` — TypeScript + ESLint (run this before every commit)

## Read before you build

All specs are in `brief/build/`. The index is `brief/build/INDEX.md`.
Read the relevant spec AND the actual source files before making changes.

## Key rules

- `org_id` on every database table (RLS enforcement)
- Never commit without passing `npm run check`
- Never modify migrations 001–017 without explicit instruction
- Read the source file before editing it — do not guess at current state
- Use `getServerOrgMembership()` from `lib/auth/server.ts` for auth — do not create your own auth pattern
- Use `getOrgDisplayName()` from `lib/org/displayName.ts` for display names — do not read `org.name` directly
