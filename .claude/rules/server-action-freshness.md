---
paths:
  - "**/actions.ts"
  - "**/actions.tsx"
  - "lib/actions/**"
  - "scripts/check-action-freshness.mjs"
  - "scripts/action-freshness.baseline.json"
---

## Server actions leave their page fresh

`check-action-freshness` fails an action that calls no `revalidatePath` / `revalidateTag` / `updateTag` /
`refresh` / `redirect` unless it is classified in `scripts/action-freshness.baseline.json`. Fix a stale
action; do not baseline it. Two Next 16 mechanics that decide whether the fix actually works
(Next 16.3.8, read in `server/lib/implicit-tags.js` and `server/app-render/action-handler.js`):

- **A typed pattern must name the route groups.** A page's tag is derived from its file path, so
  `revalidatePath("/landlords/[id]", "page")` matches nothing when the page is
  `app/(dashboard)/landlords/[id]/(overview)/page.tsx`. Write `"/(dashboard)/landlords/[id]/(overview)"`
  with `"page"`, or a segment with `"layout"` to cover everything under it. A literal path
  (`/landlords/${id}`) needs no groups.
- **Any revalidation in an action evicts the WHOLE client router cache** (`x-action-revalidated`). So a
  wrong pattern still *looks* like it works on an uncached dynamic page. It is a no-op on the server
  cache, so never copy one onto a cached route.

An auth-guard `redirect("/login")` does not count as fresh, because it is how an action refuses.
