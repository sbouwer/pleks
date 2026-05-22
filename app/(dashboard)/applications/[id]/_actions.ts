/**
 * app/(dashboard)/applications/[id]/_actions.ts — Server actions for the application detail page
 *
 * Auth:   gateway (agent workspace)
 * Data:   reads + decrypts applications.id_number; writes to audit_log
 * Notes:  revealIdNumber is gated by agent role; capability model (can_view_sensitive_identity_data)
 *         will refine the gate in Phase G when the capability column ships.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.7, §10.7.
 */
"use server"

import { gateway } from "@/lib/supabase/gateway"
import { decryptNullable } from "@/lib/crypto/encryption"

export async function revealIdNumber(applicationId: string): Promise<{ value: string | null; error?: string }> {
  const gw = await gateway()
  if (!gw) return { value: null, error: 'Unauthorized' }
  const { db, orgId, userId } = gw

  const { data: app, error } = await db
    .from('applications')
    .select('id_number, id_type')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  if (error || !app) return { value: null, error: 'Application not found' }

  const plain = decryptNullable(app.id_number)

  // Audit log — action='UPDATE' with discriminator in new_values per §8.7
  await db.from('audit_log').insert({
    org_id:     orgId,
    user_id:    userId,
    action:     'UPDATE',
    table_name: 'applications',
    record_id:  applicationId,
    new_values: { action: 'id_number_revealed', id_type: app.id_type },
  })

  return { value: plain }
}
