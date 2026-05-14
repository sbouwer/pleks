/**
 * app/api/consent/verification/[id]/status/route.ts — Poll verification status
 *
 * Route:  GET /api/consent/verification/[id]/status
 * Auth:   public (verification_id is a UUID — not guessable; used for cross-device polling)
 * Data:   consent_verifications (read only)
 * Notes:  ADDENDUM_14F. Used by email-link fallback cross-device flow: originating device
 *         polls this endpoint until status = 'verified'. Minimal response — no PII.
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const service = await createServiceClient()

  const { data: verif, error } = await service
    .from("consent_verifications")
    .select("status, code_expires_at, consent_type")
    .eq("id", id)
    .single()

  if (error || !verif) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    status:      verif.status,
    consentType: verif.consent_type,
    expired:     verif.code_expires_at ? new Date(verif.code_expires_at as string) < new Date() : false,
  })
}
