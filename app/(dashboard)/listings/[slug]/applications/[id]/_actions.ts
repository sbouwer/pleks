/**
 * app/(dashboard)/listings/[slug]/listings/[slug]/applications/[id]/_actions.ts — Server actions for the application detail page
 *
 * Auth:   gateway (agent workspace)
 * Data:   reads + decrypts applications.id_number; writes to audit_log
 * Notes:  revealIdNumber is NOT capability-gated — viewing an applicant's ID is a routine, consented agent task
 *         (POPIA s19 proportionate / need-to-know-within-the-tenant); it's masked-by-default + audited instead.
 *         generatePopiaS23Response stays gated by can_generate_popia_s23 (an elevated disclosure op; owner exempt).
 *         Handler (lib/popia/handlers/screening.ts) writes its own audit_log entry — no
 *         double-write here; the server action's role is capability gate + org ownership check.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.3–§8.7, §10.8.
 */
"use server"

import { gateway } from "@/lib/supabase/gateway"
import { recordAudit } from "@/lib/audit/recordAudit"
import { decryptNullable } from "@/lib/crypto/encryption"
import { generateScreeningL2Response } from "@/lib/popia/handlers/screening"

export async function revealIdNumber(applicationId: string): Promise<{ value: string | null; error?: string }> {
  const gw = await gateway()
  if (!gw) return { value: null, error: 'Unauthorized' }
  const { db, orgId, userId } = gw

  // No per-user capability gate: viewing the applicant's ID is a routine, CONSENTED part of the agent's job
  // (POPIA s19 — proportionate, need-to-know-within-the-tenant). Reaching here means you're an authenticated agent
  // in the org that owns this application (the org_id filter below is the boundary). The reveal is masked-by-default
  // in the UI and AUDITED here. (ADDENDUM_14H §8.7 right-sized — the capability model is reserved for elevated ops
  // like s23 disclosure / bulk export.)
  const { data: app, error } = await db
    .from('applications')
    .select('id_number, id_type')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  if (error || !app) return { value: null, error: 'Application not found' }

  const plain = decryptNullable(app.id_number)

  // Audit log — action='UPDATE' with discriminator in new_values per §8.7
  await recordAudit(db, {
    orgId, actorId: userId, action: 'UPDATE', table: 'applications', recordId: applicationId,
    after: { action: 'id_number_revealed', id_type: app.id_type },
  })

  return { value: plain }
}

export async function generatePopiaS23Response(
  applicationId: string,
): Promise<{ signedUrl: string | null; expiresAt: string | null; error?: string }> {
  const gw = await gateway()
  if (!gw) return { signedUrl: null, expiresAt: null, error: 'Unauthorized' }
  const { db, orgId, userId } = gw

  // Capability gate — owner/is_admin implicit-all; OTHER members must hold can_generate_popia_s23 for this org.
  if (!gw.isAdmin) {
    const { data: cap, error: capErr } = await db
      .from('user_capabilities')
      .select('id')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .eq('capability_name', 'can_generate_popia_s23')
      .maybeSingle()
    if (capErr) {
      console.error('generatePopiaS23Response capability check failed:', capErr.message)
      return { signedUrl: null, expiresAt: null, error: 'Authorization check failed' }
    }
    if (!cap) return {
      signedUrl: null,
      expiresAt: null,
      error: 'Capability not granted — contact your Information Officer.',
    }
  }

  // Verify application belongs to this org; resolve subject user via tenant link
  const { data: app, error: appErr } = await db
    .from('applications')
    .select('id, tenant_id, tenants(auth_user_id)')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()
  if (appErr ?? !app) {
    return { signedUrl: null, expiresAt: null, error: 'Application not found' }
  }

  // Resolve data subject's auth user ID via tenants.auth_user_id (§CLAUDE.md schema gotchas).
  // auth_user_id can be null for tenants not yet invited; L2 generation requires a linked account.
  const tenantRow = (app.tenants as unknown) as { auth_user_id: string | null } | null
  if (!tenantRow?.auth_user_id) {
    return { signedUrl: null, expiresAt: null, error: 'Tenant has no linked user account — submit via the POPIA email intake channel' }
  }
  const subjectUserId = tenantRow.auth_user_id

  // Generate — handler writes its own audit_log entry; no second write here.
  try {
    const result = await generateScreeningL2Response(applicationId, subjectUserId, userId, orgId)
    return { signedUrl: result.signedUrl, expiresAt: result.expiresAt }
  } catch (err) {
    console.error('generatePopiaS23Response failed:', err)
    return { signedUrl: null, expiresAt: null, error: 'Generation failed — see server logs' }
  }
}
