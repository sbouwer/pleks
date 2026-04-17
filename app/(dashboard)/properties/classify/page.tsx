import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { ClassifyList } from "./ClassifyList"

export default async function ClassifyPropertiesPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")
  const { org_id: orgId } = membership

  const service = await createServiceClient()

  const { data: properties } = await service
    .from("properties")
    .select("id, name, type, address_line1, suburb, city")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .is("scenario_type", null)
    .order("created_at", { ascending: false })
    .limit(200)

  const rows = properties ?? []

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
        <h1 className="font-heading text-2xl mb-1">Classify imported properties</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "All your imported properties are classified. Nice work."
            : `${rows.length} propert(y/ies) still need their type confirmed. Takes about 10 seconds each.`}
        </p>
      </div>

      {rows.length > 0 && <ClassifyList properties={rows} />}
    </div>
  )
}
