/**
 * DocuSeal webhook handler.
 *
 * STATUS: DISABLED — DocuSeal e-signing is a planned feature, not yet live.
 * Returns 503 for all incoming requests so no forged payload can trigger DB writes.
 *
 * TO ENABLE: set DOCUSEAL_WEBHOOK_SECRET in env and replace the POST export below
 * with the full implementation in the comment block at the bottom of this file.
 */

import { NextResponse } from "next/server"

export async function POST(_req: Request) {
  return NextResponse.json({ error: "Not yet active" }, { status: 503 })
}

/*
 * ─── Full implementation (activate when DocuSeal goes live) ──────────────────
 *
 * import { createHmac, timingSafeEqual } from "node:crypto"
 * import { createServiceClient } from "@/lib/supabase/server"
 *
 * async function verifyDocuSealSignature(req: Request, rawBody: string): Promise<boolean> {
 *   const secret = process.env.DOCUSEAL_WEBHOOK_SECRET
 *   if (!secret) return false
 *   const signature = req.headers.get("x-docuseal-signature")
 *   if (!signature) return false
 *   const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
 *   try { return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) }
 *   catch { return false }
 * }
 *
 * export async function POST(req: Request) {
 *   const rawBody = await req.text()
 *   const valid = await verifyDocuSealSignature(req, rawBody)
 *   if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
 *
 *   const body = JSON.parse(rawBody) as Record<string, unknown>
 *   const data = body.data as Record<string, unknown> | undefined
 *
 *   if (body.event_type === "submission.completed") {
 *     const submissionId = typeof data?.id === "string" || typeof data?.id === "number" ? data.id : null
 *     if (!submissionId) return NextResponse.json({ ok: true })
 *
 *     const supabase = await createServiceClient()
 *     const { data: lease } = await supabase
 *       .from("leases")
 *       .select("id, org_id, unit_id, tenant_id, start_date")
 *       .eq("docuseal_submission_id", String(submissionId))
 *       .single()
 *     if (!lease) return NextResponse.json({ ok: true })
 *
 *     const documents = data?.documents as Array<Record<string, unknown>> | undefined
 *     const pdfUrl = typeof documents?.[0]?.url === "string" ? documents[0].url : null
 *     if (pdfUrl) {
 *       try {
 *         const pdfBuffer = await fetch(pdfUrl).then(r => r.arrayBuffer())
 *         const storagePath = `${lease.org_id}/${lease.id}/lease.pdf`
 *         await supabase.storage.from("lease-documents").upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true })
 *         await supabase.from("leases").update({ docuseal_document_url: storagePath }).eq("id", lease.id)
 *       } catch { console.error("Failed to store signed PDF") }
 *     }
 *
 *     const { activateLeaseCascade } = await import("@/lib/leases/activateLeaseCascade")
 *     await activateLeaseCascade(supabase, lease.id, lease.org_id, "docuseal")
 *   }
 *
 *   return NextResponse.json({ ok: true })
 * }
 */
