/**
 * app/(admin)/admin/external-links/page.tsx — Admin editor for all platform external URLs
 *
 * Route:  /admin/external-links
 * Auth:   requireAdminAuth() — pleks_admin_token HMAC verification
 * Data:   external_links table via service client, grouped by category
 * Notes:  cron writes is_healthy / last_status / last_checked_at daily — displayed as health dots
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { ExternalLinksEditor } from "./ExternalLinksEditor"

export const metadata = { title: "External Links" }

const CATEGORY_ORDER = ["legal", "browser-help", "payment", "status"]
const CATEGORY_LABELS: Record<string, string> = {
  "legal":        "Legal & Regulatory",
  "browser-help": "Browser Cookie Help",
  "payment":      "Payment Providers",
  "status":       "Status & Monitoring",
}

export default async function ExternalLinksPage() {
  await requireAdminAuth()

  const service = await createServiceClient()
  const { data, error } = await service
    .from("external_links")
    .select("key, url, label, category, is_healthy, last_status, last_checked_at")
    .order("category")
    .order("label")

  if (error) {
    console.error("external_links fetch failed:", error.message)
    return <p className="p-8 text-destructive">Failed to load links: {error.message}</p>
  }

  const grouped: Record<string, typeof data> = {}
  for (const row of data ?? []) {
    if (!grouped[row.category]) grouped[row.category] = []
    grouped[row.category].push(row)
  }

  const categories = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)),
  ]

  const unhealthyCount = (data ?? []).filter(r => r.is_healthy === false).length

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">External links</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All external URLs used on the platform. The daily cron checks each one and updates the health status.
          {unhealthyCount > 0 && (
            <span className="ml-2 text-destructive font-medium">
              {unhealthyCount} broken link{unhealthyCount === 1 ? "" : "s"} detected.
            </span>
          )}
        </p>
      </div>

      {categories.map(category => (
        <section key={category} className="space-y-4">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground border-b border-border pb-2">
            {CATEGORY_LABELS[category] ?? category}
          </h2>
          <ExternalLinksEditor rows={grouped[category]} />
        </section>
      ))}
    </div>
  )
}
