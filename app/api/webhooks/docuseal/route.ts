/**
 * app/api/webhooks/docuseal/route.ts — DocuSeal e-signing completion webhook
 *
 * Route:  POST /api/webhooks/docuseal
 * Auth:   HMAC (x-docuseal-signature) against DOCUSEAL_WEBHOOK_SECRET. INERT until that env is set — returns 503
 *         when unset, so while DocuSeal e-signing is go-live-gated no forged payload can write. Setting the secret
 *         at go-live activates it with NO code change. WEBHOOK_PREFIXES bypass proxy.ts gates — this validates
 *         its own signature.
 * Data:   leases (docuseal_submission_id → docuseal_document_url) + lease-documents storage + activateLeaseCascade.
 * Notes:  Was a 503 stub with the impl parked in a comment (O-4). Now real, type-checked, env-gated code so it
 *         can't rot against activateLeaseCascade / the docuseal_* columns / the bucket.
 */
import { NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { activateLeaseCascade } from "@/lib/leases/activateLeaseCascade"

export const runtime = "nodejs"

function verifySignature(signature: string | null, rawBody: string, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  try {
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET
  if (!secret) {
    // DocuSeal e-signing not live yet — stay dormant + reject so no forged payload can write.
    return NextResponse.json({ error: "Not yet active" }, { status: 503 })
  }

  const rawBody = await req.text()
  if (!verifySignature(req.headers.get("x-docuseal-signature"), rawBody, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (body.event_type !== "submission.completed") {
    return NextResponse.json({ ok: true }) // not a completion event — ack + ignore
  }

  const data = body.data as Record<string, unknown> | undefined
  const submissionId =
    typeof data?.id === "string" || typeof data?.id === "number" ? String(data.id) : null
  if (!submissionId) return NextResponse.json({ ok: true })

  const supabase = await createServiceClient()
  const { data: lease, error } = await supabase
    .from("leases")
    .select("id, org_id")
    .eq("docuseal_submission_id", submissionId)
    .maybeSingle()
  if (error) {
    console.error("[docuseal] lease lookup failed:", error.message)
    return NextResponse.json({ ok: true }) // ack on our error so DocuSeal doesn't retry-storm
  }
  if (!lease) return NextResponse.json({ ok: true })

  // Store the signed PDF — best-effort; never block lease activation on a storage hiccup.
  const documents = data?.documents as Array<Record<string, unknown>> | undefined
  const pdfUrl = typeof documents?.[0]?.url === "string" ? documents[0].url : null
  if (pdfUrl) {
    try {
      const pdfBuffer = await fetch(pdfUrl).then((r) => r.arrayBuffer())
      const storagePath = `${lease.org_id}/${lease.id}/lease.pdf`
      const { error: upErr } = await supabase.storage
        .from("lease-documents")
        .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true })
      if (upErr) {
        console.error("[docuseal] signed PDF upload failed:", upErr.message)
      } else {
        const { error: updErr } = await supabase
          .from("leases")
          .update({ docuseal_document_url: storagePath })
          .eq("id", lease.id)
          .eq("org_id", lease.org_id)
        if (updErr) console.error("[docuseal] docuseal_document_url update failed:", updErr.message)
      }
    } catch (e) {
      console.error("[docuseal] signed PDF store failed:", e)
    }
  }

  await activateLeaseCascade(supabase, lease.id, lease.org_id, "docuseal")
  return NextResponse.json({ ok: true })
}
