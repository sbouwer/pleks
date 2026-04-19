<!--
PR title MUST follow Conventional Commits format:
  feat: <something>          (minor release)
  fix: <something>           (patch release)
  perf: <something>          (patch release)
  refactor/chore/docs/test/build/ci/style: <something>  (no release)
  feat!: <something>         (major release — breaking)

Keep the subject lowercase, imperative, under 72 chars.
-->

## What

<!-- One-line summary of the change. Prose, not bullets. -->

## Why

<!-- Problem this solves, or value it adds. Link the spec or ticket. -->
<!-- Related spec: `brief/build/BUILD_XX_*.md` or `ADDENDUM_XXX_*.md` -->

## How

<!-- Key files touched, approach taken, any tradeoffs. Keep it brief. -->

## Testing

<!-- How you verified this. Screenshots for UI changes. -->

- [ ] `npm run check` passes locally
- [ ] `npm run build` succeeds locally
- [ ] `npm run security:quick` passes (if touching auth/RLS/webhooks)
- [ ] Tested on mobile viewport if UI-facing
- [ ] Preview deploy verified (Vercel link in PR comments)

## Security / Compliance

<!-- Check any that apply; leave blank if none. -->

- [ ] Touches RLS policies or adds new tables
- [ ] Touches auth, MFA, sessions, or account security
- [ ] Touches trust-account data or financial records
- [ ] Touches POPIA-sensitive fields (ID numbers, bank details, credit data)
- [ ] Adds or changes webhooks (signature verification confirmed)
- [ ] Adds or changes consent surfaces (`consent_log` entry written)

## Breaking changes

<!--
If none, delete this section.
If yes, PR title MUST include `!` (e.g. `feat!:`) and include
a BREAKING CHANGE: footer on the squash commit body, explaining
what users or agencies need to do to migrate.
-->
