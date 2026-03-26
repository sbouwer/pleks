import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import Link from "next/link"
import { AdminClauseEditor } from "./AdminClauseEditor"

export default async function AdminLeaseClausesPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  await requireAdminAuth()
  const { orgId } = await params
  const supabase = await createServiceClient()

  const { data: org } = await supabase
    .from("organisations")
    .select("name")
    .eq("id", orgId)
    .single()

  const { data: library } = await supabase
    .from("lease_clause_library")
    .select("clause_key, title, body_template, is_required, sort_order, lease_type")
    .order("sort_order")

  const { data: customBodies } = await supabase
    .from("lease_clause_selections")
    .select("clause_key, custom_body")
    .eq("org_id", orgId)
    .is("lease_id", null)
    .not("custom_body", "is", null)

  const customMap: Record<string, string> = {}
  for (const c of customBodies ?? []) {
    if (c.custom_body) customMap[c.clause_key] = c.custom_body
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1">
        <Link href={`/admin/orgs/${orgId}`} className="hover:text-foreground">
          {org?.name ?? orgId}
        </Link>{" "}
        &rsaquo; Lease clause customisation
      </p>
      <h1 className="font-heading text-2xl mb-6">
        Lease clause customisation
      </h1>

      <AdminClauseEditor
        orgId={orgId}
        clauses={(library ?? []).map((c) => ({
          ...c,
          custom_body: customMap[c.clause_key] ?? null,
        }))}
      />
    </div>
  )
}
