import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { BackLink } from "@/components/ui/BackLink"
import { DocumentsTab, type CommLogRow, type LeaseDocRow } from "../DocumentsTab"

export default async function LeaseCommunicationsPage({
  params,
}: Readonly<{
  params: Promise<{ leaseId: string }>
}>) {
  const { leaseId } = await params

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) redirect("/login")

  const supabase = await createServiceClient()

  // Fetch the lease for context (name + org)
  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select("id, org_id, generated_doc_path, external_document_path, tenant_view(first_name, last_name, company_name, entity_type)")
    .eq("id", leaseId)
    .single()

  if (leaseError) {
    console.error("LeaseDocumentsPage: lease fetch failed:", leaseError.message)
    notFound()
  }
  if (!lease) notFound()

  // Fetch ALL communication_log + lease_documents — no date restriction, no limit
  const [commLogRes, leaseDocsRes] = await Promise.all([
    supabase
      .from("communication_log")
      .select("id, channel, direction, subject, template_key, status, sent_by, sent_to_email, sent_to_phone, recipient_name, created_at")
      .eq("org_id", lease.org_id)
      .eq("lease_id", leaseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("lease_documents")
      .select("id, doc_type, title, storage_path, file_size_bytes, generated_by, created_at")
      .eq("lease_id", leaseId)
      .eq("org_id", lease.org_id)
      .order("created_at", { ascending: false }),
  ])

  if (commLogRes.error) console.error("LeaseDocumentsPage: comm_log failed:", commLogRes.error.message)
  if (leaseDocsRes.error) console.error("LeaseDocumentsPage: lease_documents failed:", leaseDocsRes.error.message)

  const tv = lease.tenant_view as unknown as {
    first_name: string | null
    last_name: string | null
    company_name: string | null
    entity_type: string
  } | null

  function resolveTenantName(row: typeof tv): string {
    if (!row) return "Tenant"
    if (row.entity_type === "organisation" && row.company_name) return row.company_name
    return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Tenant"
  }
  const tenantName = resolveTenantName(tv)

  const signedLeasePath = lease.generated_doc_path ?? lease.external_document_path ?? null
  const communicationLog = (commLogRes.data ?? []) as CommLogRow[]
  const leaseDocuments = (leaseDocsRes.data ?? []) as LeaseDocRow[]

  return (
    <div>
      <BackLink href={`/leases/${leaseId}?tab=communications`} label="Communications" />

      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">{tenantName}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Full communication history — {communicationLog.length + leaseDocuments.length} item{communicationLog.length + leaseDocuments.length === 1 ? "" : "s"}
        </p>
      </div>

      <DocumentsTab
        leaseId={leaseId}
        orgId={lease.org_id}
        signedLeasePath={signedLeasePath}
        communicationLog={communicationLog}
        leaseDocuments={leaseDocuments}
      />
    </div>
  )
}
