/**
 * lib/auth/contactStepUp.ts — step-up gate for bank-detail changes (ADDENDUM_AUTH_HARDENING Finding 1)
 *
 * Auth:   wraps requireStepUp for the bank_account sub-record path.
 * Notes:  Bank-detail changes are a payout-fraud vector — a hijacked / shared-desk session could redirect a
 *         landlord's or supplier's payout account, with the audit row landing only AFTER the fact. This forces
 *         a fresh re-auth (StepUpModal) first. Additive to the route's existing membership/ownership gates
 *         (D-AH-1); called at the route boundary where the session + token are in scope (D-AH-2). Mirrors
 *         transfer-ownership/route.ts:84.
 */
import { NextResponse } from "next/server"
import { requireStepUp } from "@/lib/auth/step-up"
import type { SubRecordBody } from "@/lib/contacts/contactSubRecords"

/**
 * For a `bank_account` sub-record change, require a verified step-up. Returns a `401 {challengeToken}` to
 * surface in StepUpModal when step-up is needed and not yet verified; `null` to proceed (non-bank types and
 * verified bank changes both pass straight through).
 */
export async function bankDetailStepUp(body: SubRecordBody, userId: string, contactId: string): Promise<NextResponse | null> {
  if (body.type !== "bank_account") return null
  const stepUp = await requireStepUp({
    userId,
    action: "bank_detail_change",
    resourceId: contactId,
    providedToken: body.stepUpToken,
  })
  if (!stepUp.verified) {
    return NextResponse.json({ challengeToken: stepUp.challengeToken }, { status: 401 })
  }
  return null
}
