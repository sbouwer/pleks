/**
 * app/(admin)/admin/site-content/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { SiteContentEditor } from "./SiteContentEditor"

export const metadata = { title: "Site Content" }

const SECTION_ORDER = ["global", "hero", "why", "pricing", "story"]
const SECTION_LABELS: Record<string, string> = {
  global:  "Global",
  hero:    "Hero",
  why:     "Why Pleks",
  pricing: "Pricing",
  story:   "Who Built This",
}

export default async function SiteContentPage() {
  const gw = await gateway()
  if (!gw) redirect("/admin/login")

  const { data, error } = await gw.db
    .from("site_content")
    .select("key, label, section, sort_order, value")
    .order("section")
    .order("sort_order")

  if (error) {
    console.error("site_content fetch failed:", error.message)
    return <p className="p-8 text-destructive">Failed to load content: {error.message}</p>
  }

  // Group by section
  const grouped: Record<string, typeof data> = {}
  for (const row of data ?? []) {
    if (!grouped[row.section]) grouped[row.section] = []
    grouped[row.section].push(row)
  }

  const sections = SECTION_ORDER.filter(s => grouped[s])

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Site content</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edit marketing copy. Changes go live immediately on save — no deploy needed.
        </p>
      </div>

      {sections.map(section => (
        <section key={section} className="space-y-4">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground border-b border-border pb-2">
            {SECTION_LABELS[section] ?? section}
          </h2>
          <SiteContentEditor rows={grouped[section]} />
        </section>
      ))}
    </div>
  )
}
