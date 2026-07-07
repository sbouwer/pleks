"use client"

/**
 * app/(dashboard)/suppliers/SuppliersPageClient.tsx — Tabbed suppliers view (contractors / managing schemes / utilities)
 *
 * Data:   fetches contractors via the fetchContractorsAction server action (react-query)
 * Notes:  active tab from ?type=; filters the shared contractor list by supplier_type
 */

import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fetchContractors rows carry supplier_type (a DB column absent from the trimmed Contractor type); filter on it, then narrow to Contractor[]
  const contractors = allContractors.filter((c: any) => c.supplier_type === activeTab) as Contractor[]

  const tabsRow = (
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
  )

  // Empty → the same descriptive empty state as Tenants/Landlords, with the tabs slotted under the rule.
  if (contractors.length === 0) {
    return (
      <EmptyResourceState
        eyebrow="Portfolio"
        title="Suppliers"
        headline={`No ${tabInfo.plural} yet`}
        headerSub={`Add ${tabInfo.plural} and assign them to maintenance jobs across your properties.`}
        emptyTitle={`No ${tabInfo.plural} here yet`}
        emptySub={`Add your first ${tabInfo.singular} to get started.`}
        icon={<HardHat className="h-6 w-6" />}
        headerAction={<AddContractorButton orgId={orgId} supplierType={activeTab} />}
        heroAction={
          <AddContractorButton
            orgId={orgId}
            supplierType={activeTab}
            variant="hero"
            showPlus={false}
            labelOverride={`Add your first ${tabInfo.singular}`}
          />
        }
        belowHeader={tabsRow}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResourcePageHeader
        title="Suppliers"
        headline={`Your ${tabInfo.plural}`}
        sub={`${contractors.length} ${contractors.length === 1 ? tabInfo.singular : tabInfo.plural}`}
        action={<AddContractorButton orgId={orgId} supplierType={activeTab} />}
      />
      {tabsRow}
      <SuppliersClient contractors={contractors} orgId={orgId} noun={{ singular: tabInfo.singular, plural: tabInfo.plural }} />
    </div>
  )
}
