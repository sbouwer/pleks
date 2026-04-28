"use client"

/**
 * app/(dashboard)/suppliers/SuppliersPageClient.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { HardHat } from "lucide-react"
import { SuppliersClient, AddContractorButton, type Contractor } from "./SuppliersClient"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchContractorsAction } from "@/lib/queries/portfolioActions"

type SupplierTab = "contractor" | "managing_scheme" | "utility"
const TABS: { key: SupplierTab; label: string; singular: string; plural: string }[] = [
  { key: "contractor", label: "Contractors", singular: "contractor", plural: "contractors" },
  { key: "managing_scheme", label: "Managing Schemes", singular: "managing scheme", plural: "managing schemes" },
  { key: "utility", label: "Utilities", singular: "utility", plural: "utilities" },
]

interface Props { orgId: string }

export function SuppliersPageClient({ orgId }: Props) {
  const searchParams = useSearchParams()
  const type = searchParams.get("type")
  const activeTab: SupplierTab = type === "managing_scheme" || type === "utility" ? type : "contractor"
  const tabInfo = TABS.find((t) => t.key === activeTab)!

  const { data: allContractors = [] } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId),
    queryFn: () => fetchContractorsAction(orgId),
    staleTime: STALE_TIME.contractors,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractors = allContractors.filter((c: any) => c.supplier_type === activeTab) as Contractor[]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-heading text-3xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{contractors.length} {contractors.length === 1 ? tabInfo.singular : tabInfo.plural}</p>
        </div>
        <AddContractorButton orgId={orgId} supplierType={activeTab} />
      </div>
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((tab) => (
          <Link key={tab.key}
            href={tab.key === "contractor" ? "/suppliers" : `/suppliers?type=${tab.key}`}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {tab.label}
          </Link>
        ))}
      </div>
      {contractors.length === 0 ? (
        <EmptyState
          icon={<HardHat className="h-8 w-8 text-muted-foreground" />}
          title={`No ${tabInfo.plural} yet`}
          description={`Add your first ${tabInfo.label.toLowerCase().slice(0, -1)} using the button above.`}
        />
      ) : (
        <SuppliersClient contractors={contractors} orgId={orgId} />
      )}
    </div>
  )
}
