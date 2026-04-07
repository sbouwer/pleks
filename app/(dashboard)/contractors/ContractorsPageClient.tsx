"use client"

import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ContractorsClient, AddContractorButton, type Contractor } from "./ContractorsClient"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchContractors } from "@/lib/queries/portfolio"

type SupplierTab = "contractor" | "managing_scheme" | "utility"
const TABS: { key: SupplierTab; label: string; plural: string }[] = [
  { key: "contractor", label: "Contractors", plural: "contractors" },
  { key: "managing_scheme", label: "Managing Schemes", plural: "managing schemes" },
  { key: "utility", label: "Utilities", plural: "utilities" },
]

interface Props { orgId: string; role: string }

export function ContractorsPageClient({ orgId, role }: Props) {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const type = searchParams.get("type")
  const activeTab: SupplierTab = type === "managing_scheme" || type === "utility" ? type : "contractor"
  const tabInfo = TABS.find((t) => t.key === activeTab)!

  const { data: allContractors = [] } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchContractors(supabase as any, orgId),
    staleTime: STALE_TIME.contractors,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractors = allContractors.filter((c: any) => c.supplier_type === activeTab) as Contractor[]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-heading text-3xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{contractors.length} {tabInfo.plural}</p>
        </div>
        <AddContractorButton orgId={orgId} supplierType={activeTab} />
      </div>
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((tab) => (
          <Link key={tab.key}
            href={tab.key === "contractor" ? "/contractors" : `/contractors?type=${tab.key}`}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {tab.label}
          </Link>
        ))}
      </div>
      {contractors.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No {tabInfo.plural} yet. Add one using the button above.</p>
      ) : (
        <ContractorsClient contractors={contractors} userRole={role} orgId={orgId} />
      )}
    </div>
  )
}
