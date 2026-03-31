import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ContractorsClient, AddContractorButton } from "./ContractorsClient"
import Link from "next/link"
import { cn } from "@/lib/utils"

type SupplierTab = "contractor" | "managing_scheme" | "utility"

const TABS: { key: SupplierTab; label: string; plural: string }[] = [
  { key: "contractor", label: "Contractors", plural: "contractors" },
  { key: "managing_scheme", label: "Managing Schemes", plural: "managing schemes" },
  { key: "utility", label: "Utilities", plural: "utilities" },
]

interface Props {
  readonly searchParams: Promise<{ type?: string }>
}

export default async function ContractorsPage({ searchParams }: Props) {
  const { type } = await searchParams
  const activeTab: SupplierTab =
    type === "managing_scheme" || type === "utility" ? type : "contractor"

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")

  const { data: contractors } = await supabase
    .from("contractor_view")
    .select("id, contact_id, first_name, last_name, company_name, email, phone, specialities, is_active")
    .eq("org_id", membership.org_id)
    .eq("supplier_type", activeTab)

  const tabInfo = TABS.find((t) => t.key === activeTab)!

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-heading text-3xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            {contractors?.length ?? 0} {tabInfo.plural}
          </p>
        </div>
        <AddContractorButton orgId={membership.org_id} supplierType={activeTab} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "contractor" ? "/contractors" : `/contractors?type=${tab.key}`}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {(!contractors || contractors.length === 0) ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No {tabInfo.plural} yet. Add one using the button above.
        </p>
      ) : (
        <ContractorsClient
          contractors={contractors}
          userRole={membership.role}
          orgId={membership.org_id}
        />
      )}
    </div>
  )
}
