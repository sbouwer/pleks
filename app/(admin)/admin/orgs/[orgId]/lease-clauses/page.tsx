/**
 * app/(admin)/admin/orgs/[orgId]/lease-clauses/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import Link from "next/link"
import { AdminClauseEditor } from "./AdminClauseEditor"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function AdminLeaseClausesPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  await requireAdminAuth()
  const { orgId } = await params
  const supabase = await createServiceClient()

  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .select("name")
    .eq("id", orgId)
    .single()
    logQueryError("AdminLeaseClausesPage organisations", orgError)

  const { data: library, error: libraryError } = await supabase
    .from("lease_clause_library")
    .select("clause_key, title, body_template, is_required, sort_order, lease_type")
    .order("sort_order")
    logQueryError("AdminLeaseClausesPage lease_clause_library", libraryError)

  const { data: customBodies, error: customBodiesError } = await supabase
    .from("lease_clause_selections")
    .select("clause_key, custom_body")
    .eq("org_id", orgId)
    .is("lease_id", null)
    .not("custom_body", "is", null)
    logQueryError("AdminLeaseClausesPage lease_clause_selections", customBodiesError)

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
