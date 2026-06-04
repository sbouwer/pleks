/**
 * app/api/leases/[leaseId]/download-document/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select("external_document_path, generated_doc_path")
    .eq("id", leaseId)
    .single()
    logQueryError("GET leases", leaseError)

  if (!lease) return NextResponse.json({ error: "Lease not found" }, { status: 404 })

  const docPath = lease.external_document_path ?? lease.generated_doc_path
  if (!docPath) return NextResponse.json({ error: "No document" }, { status: 404 })

  const serviceSupabase = await createServiceClient()
  const { data, error: queryError } = await serviceSupabase.storage
    .from("documents")
    .createSignedUrl(docPath, 3600)
    logQueryError("GET documents", queryError)

  return NextResponse.json({ url: data?.signedUrl ?? null })
}
