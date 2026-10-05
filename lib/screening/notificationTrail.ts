/**
 * lib/screening/notificationTrail.ts — the ONE writer and reader of screening_notification_events (ADDENDUM_14X §3)
 *
 * Data:   screening_notification_events (append-only; 005 §ADDENDUM_14X §3) via the caller's service client, org-scoped.
 * Notes:  One row per ATTEMPTED send, written whether the send succeeded or failed: send_ok records the outcome, and
 *         communication_log_id points at the delivery row that attempt produced (NULL when the delivery log itself was
 *         not written — sendEmail returns logId "" then, which is not a uuid). "Was N2 sent" = a row with send_ok.
 *         org_id is never taken on trust (P1 walker F5): the application is read under the caller's org and the row is
 *         refused if it is not there, so a trail row can never be stamped with one org on another org's application.
 *         A HELD milestone (its template's copy awaits counsel — registry `heldFor`) is not an attempt, but §4 says "the
 *         trail records the gap": recordGap writes ONE row per party per milestone — send_ok false, no delivery row —
 *         guarded by an existence read, so a held N5 does not add a row on every daily run. Read a row with send_ok
 *         false and no communication_log_id as "not sent": held, or (rarely) a send whose delivery log write failed.
 *         The lead's pair is the view's: subject_id = the application id, subject_type 'company' on a juristic
 *         application and 'applicant' otherwise; every co party is 'co_applicant' + its row id.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { SendEmailResult } from "@/lib/comms/send-email"
import { templateVersion } from "@/lib/comms/template-registry"

export type TrailMilestone = "N1" | "N2" | "N3" | "N4" | "N5" | "N6" | "N6_absent"
export type TrailSubject = { subjectType: "applicant" | "company" | "co_applicant"; subjectId: string }

/** The lead's subject pair, exactly as v_application_screening_lines spells it. */
export function leadSubject(application: { id: string; entity_type: unknown }): TrailSubject {
  return { subjectType: application.entity_type === "organisation" ? "company" : "applicant", subjectId: application.id }
}

export async function recordTrail(db: SupabaseClient, row: {
  orgId: string
  applicationId: string
  subject: TrailSubject
  milestone: TrailMilestone
  templateKey: string
  deadlineAsStated: string | null
  /** The send's own result; null when the sender could not even be reached (counted as a failed attempt). */
  sent: SendEmailResult | null
}): Promise<void> {
  const { data: app, error: appError } = await db
    .from("applications").select("org_id").eq("id", row.applicationId).eq("org_id", row.orgId).maybeSingle()
  if (appError) throw new Error(`trail: read application: ${appError.message}`)
  if (!app) throw new Error(`trail: application ${row.applicationId} is not in org ${row.orgId}`)

  const { error } = await db.from("screening_notification_events").insert({
    org_id: app.org_id,
    application_id: row.applicationId,
    subject_type: row.subject.subjectType,
    subject_id: row.subject.subjectId,
    milestone: row.milestone,
    template_key: row.templateKey,
    template_version: templateVersion(row.templateKey),
    channel: "email",
    deadline_as_stated: row.deadlineAsStated,
    send_ok: !!row.sent?.success,
    communication_log_id: row.sent?.logId || null,
  })
  if (error) throw new Error(`trail: record ${row.milestone}: ${error.message}`)
}

/**
 * Record that a milestone was due for this party and NOT sent because its copy is held. Once per party per milestone:
 * a second call finds the first row and writes nothing (returns false). The template must still be registered.
 */
export async function recordGap(db: SupabaseClient, row: {
  orgId: string
  applicationId: string
  subject: TrailSubject
  milestone: TrailMilestone
  templateKey: string
  deadlineAsStated: string | null
}): Promise<boolean> {
  const { data: prior, error } = await db
    .from("screening_notification_events")
    .select("id")
    .eq("org_id", row.orgId)
    .eq("application_id", row.applicationId)
    .eq("subject_type", row.subject.subjectType)
    .eq("subject_id", row.subject.subjectId)
    .eq("milestone", row.milestone)
    .limit(1)
  if (error) throw new Error(`trail: read prior ${row.milestone}: ${error.message}`)
  if (prior?.length) return false
  await recordTrail(db, { ...row, sent: null })
  return true
}

/** The milestones this party already has a SUCCESSFUL send for. */
export async function milestonesSentOk(
  db: SupabaseClient, orgId: string, applicationId: string, subject: TrailSubject,
): Promise<Set<string>> {
  const { data, error } = await db
    .from("screening_notification_events")
    .select("milestone")
    .eq("org_id", orgId)
    .eq("application_id", applicationId)
    .eq("subject_type", subject.subjectType)
    .eq("subject_id", subject.subjectId)
    .eq("send_ok", true)
  if (error) throw new Error(`trail: read sent milestones: ${error.message}`)
  return new Set((data ?? []).map((r) => r.milestone as string))
}
