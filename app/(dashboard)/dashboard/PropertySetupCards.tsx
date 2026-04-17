import Link from "next/link"
import { Home, ListChecks, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { createServiceClient } from "@/lib/supabase/server"

interface Props {
  orgId:            string
  totalProperties:  number
  isAdmin:          boolean
}

// ── First property card ───────────────────────────────────────────────────────

function FirstPropertyCard() {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <Home className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold mb-1">Add your first property</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Tell us about the property. We&apos;ll match it to the way SA property works &mdash;
              sectional title, rental house, commercial, and more.
            </p>
            <Link
              href="/properties/new"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Start guided setup
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Imported properties review card ───────────────────────────────────────────

function ImportedPropertiesReviewCard({ unclassifiedCount, totalImported }: { unclassifiedCount: number; totalImported: number }) {
  return (
    <Card className="border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-amber-500/10 p-2 shrink-0">
            <ListChecks className="w-5 h-5 text-amber-700 dark:text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold mb-1">Check imported properties</h3>
            <p className="text-sm text-muted-foreground mb-3">
              We&apos;ve imported {totalImported} propert{totalImported === 1 ? "y" : "ies"}.{" "}
              <strong>{unclassifiedCount}</strong> still need their property type confirmed so we can
              tailor your leases, inspections, and reports correctly.
            </p>
            <Link
              href="/properties/classify"
              className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
            >
              Review properties
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Wrapper ──────────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export async function PropertySetupCards({ orgId, totalProperties, isAdmin }: Readonly<Props>) {
  if (!isAdmin) return null

  // 0 properties → first property card (always for admins on empty orgs)
  if (totalProperties === 0) {
    return <FirstPropertyCard />
  }

  // > 0 properties → check for recent import with unclassified rows
  const service = await createServiceClient()
  const cutoffIso = new Date(new Date().getTime() - SEVEN_DAYS_MS).toISOString()

  const { data: recentImport } = await service
    .from("import_sessions")
    .select("id, completed_at")
    .eq("org_id", orgId)
    .not("completed_at", "is", null)
    .gt("completed_at", cutoffIso)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!recentImport) return null

  const { count: unclassifiedCount } = await service
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("scenario_type", null)
    .is("deleted_at", null)

  if (!unclassifiedCount || unclassifiedCount === 0) return null

  const { count: totalImported } = await service
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null)

  return (
    <ImportedPropertiesReviewCard
      unclassifiedCount={unclassifiedCount}
      totalImported={totalImported ?? 0}
    />
  )
}
