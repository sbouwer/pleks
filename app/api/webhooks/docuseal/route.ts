import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const body = await req.json()

  // TODO: Verify DocuSeal webhook signature when self-hosted is configured
  // const signature = req.headers.get('x-docuseal-signature')

  if (body.event_type === "submission.completed") {
    const submissionId = body.data?.id
    if (!submissionId) return NextResponse.json({ ok: true })

    const supabase = await createServiceClient()

    // Find lease by submission ID
    const { data: lease } = await supabase
      .from("leases")
      .select("id, org_id, unit_id, tenant_id, start_date")
      .eq("docuseal_submission_id", String(submissionId))
      .single()

    if (!lease) return NextResponse.json({ ok: true })

    // Download and store signed PDF
    const pdfUrl = body.data?.documents?.[0]?.url
    if (pdfUrl) {
      try {
        const pdfResponse = await fetch(pdfUrl)
        const pdfBuffer = await pdfResponse.arrayBuffer()
        const storagePath = `${lease.org_id}/${lease.id}/lease.pdf`

        await supabase.storage
          .from("lease-documents")
          .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true })

        await supabase
          .from("leases")
          .update({ docuseal_document_url: storagePath })
          .eq("id", lease.id)
      } catch {
        console.error("Failed to store signed PDF")
      }
    }

    // Run full activation cascade
    const { activateLeaseCascade } = await import("@/lib/leases/activateLeaseCascade")
    await activateLeaseCascade(supabase, lease.id, lease.org_id, "docuseal")
  }

  return NextResponse.json({ ok: true })
}
