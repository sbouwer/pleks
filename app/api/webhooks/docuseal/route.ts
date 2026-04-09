import { NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"

async function verifyDocuSealSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET
  if (!secret) return false

  const signature = req.headers.get("x-docuseal-signature")
  if (!signature) return false

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text()

  const valid = await verifyDocuSealSignature(req, rawBody)
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const body = JSON.parse(rawBody) as Record<string, unknown>
  const data = body.data as Record<string, unknown> | undefined

  if (body.event_type === "submission.completed") {
    const submissionId = typeof data?.id === "string" || typeof data?.id === "number" ? data.id : null
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
    const documents = data?.documents as Array<Record<string, unknown>> | undefined
    const pdfUrl = typeof documents?.[0]?.url === "string" ? documents[0].url : null
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
