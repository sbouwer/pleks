import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: lease } = await supabase
    .from("leases")
    .select("external_document_path, generated_doc_path")
    .eq("id", leaseId)
    .single()

  if (!lease) return NextResponse.json({ error: "Lease not found" }, { status: 404 })

  const docPath = lease.external_document_path ?? lease.generated_doc_path
  if (!docPath) return NextResponse.json({ error: "No document" }, { status: 404 })

  const serviceSupabase = await createServiceClient()
  const { data } = await serviceSupabase.storage
    .from("documents")
    .createSignedUrl(docPath, 3600)

  return NextResponse.json({ url: data?.signedUrl ?? null })
}
