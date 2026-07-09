/**
 * app/api/webhooks/docuseal/route.ts — DocuSeal e-signing completion webhook
 *
 * Route:  POST /api/webhooks/docuseal
 * Auth:   shared-secret header (x-docuseal-secret) constant-time-compared to DOCUSEAL_WEBHOOK_SECRET — the same
 *         idiom as the cron x-cron-secret (DocuSeal Console → Webhooks → Add Secret sends a configurable header).
 *         INERT until that env is set — returns 503 when unset, so while DocuSeal e-signing is go-live-gated no
 *         forged payload can write. Setting the secret at go-live activates it with NO code change.
 *         WEBHOOK_PREFIXES bypass proxy.ts gates — this validates its own secret.
 * Data:   leases (docuseal_submission_id → docuseal_document_url, status) + lease-documents storage + activateLeaseCascade.
 * Notes:  Was a 503 stub with the impl parked in a comment (O-4). Now real, type-checked, env-gated code so it
 *         can't rot against activateLeaseCascade / the docuseal_* columns / the bucket. Handles three events:
 *         submission.completed → activate; submission.declined / .expired → return the lease to draft (D1) so it
 *         can't strand in pending_signing. An app-level timeout sweep lives in the lease-lifecycle cron.
 */
import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { activateLeaseCascade } from "@/lib/leases/activateLeaseCascade"
import { revertPendingSigningToDraft, type SigningRevertReason } from "@/lib/leases/revertSigning"

export const runtime = "nodejs"

function secretMatches(provided: string | null, secret: string): boolean {
  if (!provided) return false
  try {
    const a = Buffer.from(provided)
    const b = Buffer.from(secret)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** DocuSeal event_type → the terminal reason that returns a lease to draft (D1). null for non-terminal events. */
function terminalReasonFor(eventType: string): SigningRevertReason | null {
  if (eventType === "submission.declined") return "declined"
  if (eventType === "submission.expired") return "expired"
  return null
}

type SigningLease = { id: string; org_id: string; status: string }

async function findLeaseBySubmission(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  submissionId: string,
): Promise<SigningLease | null> {
  const { data: lease, error } = await supabase
    .from("leases")
    .select("id, org_id, status")
    .eq("docuseal_submission_id", submissionId)
    .maybeSingle()
  if (error) {
    console.error("[docuseal] lease lookup failed:", error.message)
    return null
  }
  return (lease as SigningLease | null) ?? null
}

/** submission.completed → store the signed PDF (best-effort) + run the activation cascade. */
async function handleCompleted(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  lease: SigningLease,
  data: Record<string, unknown> | undefined,
): Promise<void> {
  // Idempotency: DocuSeal delivers at-least-once + retries on timeout. Already-active → skip the redundant
  // PDF re-fetch/upload + cascade. (activateLeaseCascade also self-guards atomically for the first-delivery race.)
  if (lease.status === "active") return

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
}

export async function POST(req: Request) {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET
  if (!secret) {
    // DocuSeal e-signing not live yet — stay dormant + reject so no forged payload can write.
    return NextResponse.json({ error: "Not yet active" }, { status: 503 })
  }

  if (!secretMatches(req.headers.get("x-docuseal-secret"), secret)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventType = typeof body.event_type === "string" ? body.event_type : ""
  const terminalReason = terminalReasonFor(eventType)
  // We handle completion + the two terminal outcomes; everything else is acked + ignored.
  if (!terminalReason && eventType !== "submission.completed") {
    return NextResponse.json({ ok: true })
  }

  const data = body.data as Record<string, unknown> | undefined
  const submissionId =
    typeof data?.id === "string" || typeof data?.id === "number" ? String(data.id) : null
  if (!submissionId) return NextResponse.json({ ok: true })

  const supabase = await createServiceClient()
  const lease = await findLeaseBySubmission(supabase, submissionId)
  if (!lease) return NextResponse.json({ ok: true }) // unknown/already-cleared submission — ack, no retry-storm

  if (terminalReason) {
    // Declined by the signer, or the submission expired → return the lease to draft so the agent can re-send.
    await revertPendingSigningToDraft(supabase, lease, terminalReason, terminalReason === "declined" ? "tenant" : "system")
  } else {
    await handleCompleted(supabase, lease, data)
  }
  return NextResponse.json({ ok: true })
}
