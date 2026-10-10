/**
 * scripts/check-loading-boundaries.mjs — a loading.tsx may wrap only its own route, never a child route
 *
 * A `loading.tsx` at segment X is a Suspense boundary around EVERYTHING below X's layout, not just X's
 * page. So a list's skeleton at `leases/loading.tsx` also covered `/leases/[leaseId]`: navigating to a
 * lease painted the LIST silhouette first (Next prefetches only down to the first loading.tsx), and an
 * async `layout.tsx` in a child segment suspended under the PARENT's boundary, so `/settings/team`
 * showed the settings overview while its capability gate ran (.handoff/route-skeletons/06-walker.md F1).
 *
 * The convention this enforces: a segment's own page and its skeleton live together in a
 * `(overview)` route group — `leases/(overview)/{page,loading}.tsx` — so the boundary wraps that one
 * URL and nothing else. Each child route then shows its own skeleton, or none.
 *
 * Fails on: a loading.tsx with any page.tsx beneath it whose URL differs from the loading.tsx's own
 * URL (route groups `(x)` and parallel slots `@x` add nothing to a URL, so they are stripped first).
 */
import { readdirSync } from "node:fs"
import { join } from "node:path"

const APP = "app"

/** Next's page and loading files in every extension it resolves (walker F4a: `.tsx`-only missed a `page.ts`). */
const PAGE_RE = /^page\.(tsx|ts|jsx|js|mdx)$/
const LOADING_RE = /^loading\.(tsx|ts|jsx|js)$/

/**
 * A path under app/ → its URL: route groups and parallel slots contribute no URL segment, and nor does an
 * optional catch-all `[[...x]]` — its page also serves the parent URL, so a skeleton beside it is not
 * wrapping a different route (walker F4b).
 */
export const routeOf = (dir) =>
  "/" + dir.split("/").filter((s) => s && s !== APP && !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@") && !s.startsWith("[[...")).join("/")

/** For one loading.tsx directory, the page directories beneath it that are a DIFFERENT URL. */
export function wrappedChildRoutes(loadingDir, pageDirs) {
  const own = routeOf(loadingDir)
  return pageDirs.filter((p) => (p === loadingDir || p.startsWith(loadingDir + "/")) && routeOf(p) !== own)
}

function selftest() {
  const pages = ["app/(d)/leases/(overview)", "app/(d)/leases/[leaseId]/(overview)", "app/(d)/leases/[leaseId]/edit"]
  const cases = [
    ["KNOWN-GOOD: skeleton in (overview) beside its page", "app/(d)/leases/(overview)", pages, 0],
    ["KNOWN-GOOD: detail skeleton in its own (overview)", "app/(d)/leases/[leaseId]/(overview)", pages, 0],
    ["KNOWN-GOOD: a leaf segment with no children", "app/(d)/leases/[leaseId]/edit", pages, 0],
    ["a list skeleton at the segment root FIRES (wraps the detail and edit routes)", "app/(d)/leases", pages, 2],
    ["a detail skeleton at the segment root FIRES (wraps edit)", "app/(d)/leases/[leaseId]", pages, 1],
    ["a page reached only through a group is still a child route and FIRES", "app/(d)/x", ["app/(d)/x/(g)/y"], 1],
    ["a parallel slot adds no URL segment, so its page does not fire", "app/(d)/x", ["app/(d)/x/@modal"], 0],
    ["KNOWN-GOOD: an optional catch-all serves its parent URL", "app/(d)/docs", ["app/(d)/docs/[[...slug]]"], 0],
    ["a required catch-all is a different URL and FIRES", "app/(d)/docs", ["app/(d)/docs/[...slug]"], 1],
  ]
  const fileCases = [
    ["page.ts is a page", PAGE_RE, "page.ts", true],
    ["page.mdx is a page", PAGE_RE, "page.mdx", true],
    ["loading.jsx is a loading boundary", LOADING_RE, "loading.jsx", true],
    ["KNOWN-GOOD: page.test.tsx is not a page", PAGE_RE, "page.test.tsx", false],
  ]
  let bad = 0
  for (const [label, re, name, want] of fileCases) {
    if (re.test(name) !== want) { bad++; console.log(`  ✗ ${label}`) }
    else console.log(`  ✓ ${label}`)
  }
  for (const [label, dir, pageDirs, want] of cases) {
    const got = wrappedChildRoutes(dir, pageDirs).length
    if (got !== want) { bad++; console.log(`  ✗ ${label} — expected ${want}, got ${got}`) }
    else console.log(`  ✓ ${label}`)
  }
  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-loading-boundaries selftest green")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

const loadingDirs = []
const pageDirs = []
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name).replaceAll("\\", "/")
    if (e.isDirectory()) walk(p)
    else if (LOADING_RE.test(e.name)) loadingDirs.push(dir)
    else if (PAGE_RE.test(e.name)) pageDirs.push(dir)
  }
}
walk(APP)

// The enumeration asserts itself (L-10): a walk that finds nothing reports a clean tree.
const FLOOR = { loading: 80, page: 150 }
if (loadingDirs.length < FLOOR.loading || pageDirs.length < FLOOR.page) {
  console.error(`\n❌ loading boundaries — found ${loadingDirs.length} loading.tsx / ${pageDirs.length} page.tsx`)
  console.error(`   (floors ${FLOOR.loading} / ${FLOOR.page}). The walk is broken or app/ moved.\n`)
  process.exit(1)
}

console.log("🔎  loading boundaries")
const findings = loadingDirs.map((d) => [d, wrappedChildRoutes(d, pageDirs)]).filter(([, w]) => w.length)
if (!findings.length) {
  console.log(`  ✓ all ${loadingDirs.length} loading.tsx wrap only their own route`)
  process.exit(0)
}
for (const [d, wrapped] of findings) {
  console.error(`  ✗ ${d}/loading.tsx wraps ${wrapped.length} other route(s): ${wrapped.map(routeOf).join(", ")}`)
}
console.error(`\n   Move that segment's page.tsx + loading.tsx into ${"<segment>/(overview)/"} so the skeleton covers`)
console.error(`   only its own URL; each child route then shows its own loading.tsx.\n`)
process.exit(1)
