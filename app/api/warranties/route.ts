/**
 * app/api/warranties/route.ts — Create a warranty record
 *
 * Route:  POST /api/warranties
 * Auth:   requireAgentWriteAccess (subscription-gated)
 * Data:   warranties (insert)
 * Notes:  Manual-entry path (source_type='manual'). Sign-off auto-creation
 *         is handled directly in app/api/maintenance/sign-off/route.ts.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"

interface Body {
  subject: string
  warranty_type: string
  property_id: string
  unit_id?: string | null
  building_id?: string | null
  manufacturer_name?: string | null
  starts_on: string
  expires_on?: string | null
  claim_phone?: string | null
  claim_email?: string | null
  claim_url?: string | null
  claim_notes?: string | null
  notes?: string | null
}

export async function POST(req: NextRequest) {
  try {
    const gw = await requireAgentWriteAccess("create_warranty")
    const { db, orgId, userId } = gw

    const body = await req.json() as Body
    const { subject, warranty_type, property_id, starts_on } = body

    if (!subject?.trim()) return NextResponse.json({ error: "Subject is required" }, { status: 400 })
    if (!warranty_type)   return NextResponse.json({ error: "Warranty type is required" }, { status: 400 })
    if (!property_id)     return NextResponse.json({ error: "Property is required" }, { status: 400 })
    if (!starts_on)       return NextResponse.json({ error: "Start date is required" }, { status: 400 })

    const { data, error } = await db
      .from("warranties")
      .insert({
        org_id:           orgId,
        subject:          subject.trim(),
        warranty_type,
        property_id,
        unit_id:          body.unit_id ?? null,
        building_id:      body.building_id ?? null,
        source_type:      "manual",
        manufacturer_name: body.manufacturer_name?.trim() || null,
        starts_on,
        expires_on:       body.expires_on ?? null,
        claim_phone:      body.claim_phone?.trim() || null,
        claim_email:      body.claim_email?.trim() || null,
        claim_url:        body.claim_url?.trim() || null,
        claim_notes:      body.claim_notes?.trim() || null,
        notes:            body.notes?.trim() || null,
        created_by:       userId,
      })
      .select("id")
      .single()

    if (error) {
      console.error("[warranties] insert failed:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data.id })
  } catch (err) {
    if (err instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: "Subscription inactive" }, { status: 403 })
    }
    throw err
  }
}
