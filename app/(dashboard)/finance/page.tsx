/**
 * app/(dashboard)/finance/page.tsx — Finance Overview (trust, collections, owner payouts, reconciliation)
 *
 * Route:  /finance
 * Auth:   gatewaySSR (redirects to /login if missing)
 * Data:   getFinanceHubData (trust / tenant arrears / owner payouts / unmatched) + getCollectionRate
 * Notes:  Standard page layout (ResourcePageHeader). Tier-aware — paid tiers get the full overview;
 *         Owner (free) gets read-only stats only (no trust/payouts/reconcile, no actions), since those
 *         are paid features. Deposits / Trust Ledger / Statements live as their own nav routes.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getFinanceHubData } from "@/lib/finance/financeHub"
import { getCollectionRate } from "@/lib/dashboard/collectionRate"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { FinanceOverview } from "./FinanceOverview"

export default async function FinancePage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { orgId, tier } = gw
  const isPaid = tier !== "owner"

  const [data, collection, orgRes] = await Promise.all([
    getFinanceHubData(orgId),
    getCollectionRate(orgId),
    gw.db.from("organisations").select("name").eq("id", orgId).single(),
  ])
  const orgName = (orgRes.data?.name as string | undefined) ?? "Your agency"
  const month = new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" })

  return (
    <div>
      <ResourcePageHeader
        eyebrow={`Finance · ${month}`}
        title="Finance"
        headline={isPaid ? "Your money at a glance" : "Your rental's money"}
        sub={isPaid
          ? "Trust, collections, owner payouts and reconciliation."
          : "Collections and deposit for your lease — invoicing and payments."}
        action={isPaid ? (
          <Link
            href="/billing"
            className="group inline-flex items-center gap-2 rounded-[var(--r-button)] bg-foreground py-2.5 pl-2.5 pr-4 text-sm font-semibold text-background transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary transition-colors group-hover:bg-primary-foreground" />
            Record payment
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : undefined}
      />
      <FinanceOverview data={data} collection={collection} isPaid={isPaid} orgName={orgName} />
    </div>
  )
}
