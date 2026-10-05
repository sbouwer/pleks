/**
 * lib/screening/milestoneNotices.ts — the 14X notices that are new copy: N3 progress, N5 final notice, N6′ outcome-absent
 *
 * Data:   applications + application_co_applicants (the roster, org-scoped) via the caller's service client;
 *         sends through sendEmail; every attempt or held gap goes to the trail (lib/screening/notificationTrail.ts).
 * Notes:  ADDENDUM_14X §2/§4. Each template here is HELD until counsel's row reads ready (registry `heldFor`, the draft is
 *         brief/legal/COUNSEL_DRAFT_14X_MILESTONE_COPY_2026-10-05.md). While held, sendMilestoneNotice sends nothing and
 *         records the gap once per party per milestone ("the trail records the gap"); lifting the hold is a registry
 *         change in the PR that ships the approved copy, and the wording below must match the approved text then.
 *         NAMES (§4): N3 names the completing party and the outstanding ones — the motivation, while the window is open.
 *         It never says what an outstanding party has not done (no payment, consent or amount). N6′ names nobody.
 *         Every name is applicant-typed, so every interpolation is HTML-escaped.
 *         THE LEAD has variants of N5 and N6′: under §0 the FitScore runs only once the lead's own line is complete, so
 *         "the application will be assessed without you" is false for the lead. The variant says what is true.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { sendEmail } from "@/lib/comms/send-email"
import { heldFor } from "@/lib/comms/template-registry"
import { fmtDateLongZA } from "@/lib/dates"
import { deadlineAsStated, deadlineAt, isPastDeadline } from "@/lib/screening/notificationSchedule"
import { leadSubject, recordGap, recordTrail, type TrailMilestone, type TrailSubject } from "@/lib/screening/notificationTrail"

export const PROGRESS_KEY = "application.screening_progress"
export const FINAL_NOTICE_KEY = "application.screening_final_notice"
export const OUTCOME_ABSENT_KEY = "application.screening_outcome_absent"

export type NoticeOutcome = "sent" | "held" | "failed"

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** "A", "A and B", "A, B and C". */
function nameList(names: string[]): string {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

// ─── Copy (draft — the counsel file's §§1–3 carry the same words) ────────────────────────────────────────────────

export function progressCopy(p: { firstName: string; completedName: string; outstanding: string[]; propertyLabel: string }) {
  return {
    subject: `Update on your application — ${p.propertyLabel}`,
    html: `
<p>Hi ${esc(p.firstName)},</p>
<p>${esc(p.completedName)} has completed their part of the application for <strong>${esc(p.propertyLabel)}</strong>.</p>
<p>We are waiting on: ${esc(nameList(p.outstanding))}.</p>`,
  }
}

export function finalNoticeCopy(p: { firstName: string; deadline: string; propertyLabel: string; lead: boolean }) {
  const consequence = p.lead
    ? "If your part is not complete by then, the application cannot be assessed."
    : "If your part is not complete by then, the application will be assessed without you."
  return {
    subject: `Final notice: your deadline is ${p.deadline} — ${p.propertyLabel}`,
    html: `
<p>Hi ${esc(p.firstName)},</p>
<p>Your deadline to complete your part of the application for <strong>${esc(p.propertyLabel)}</strong> is
<strong>${esc(p.deadline)}</strong>. ${consequence}</p>
<p>To complete your part, use the link in your invitation email.</p>`,
  }
}

export function outcomeAbsentCopy(p: { firstName: string; propertyLabel: string; lead: boolean }) {
  const consequence = p.lead
    ? "Without your part, the application could not be assessed."
    : "The application will be assessed without you."
  return {
    subject: `The deadline for your part has passed — ${p.propertyLabel}`,
    html: `
<p>Hi ${esc(p.firstName)},</p>
<p>The deadline for your part of the application for <strong>${esc(p.propertyLabel)}</strong> has passed. ${consequence}</p>`,
  }
}

// ─── Send-or-hold ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Send one milestone notice and trail it, or — when its template is held — record the gap once and send nothing.
 * Never throws on a failed send: the outcome is returned, and the caller decides whether a failure is retried.
 */
export async function sendMilestoneNotice(db: SupabaseClient, p: {
  orgId: string
  applicationId: string
  subject: TrailSubject
  milestone: TrailMilestone
  templateKey: string
  /** The recipient's own deadline as stated, or null when the recipient has no clock (never invited). */
  deadlineAsStated: string | null
  to: { email: string; name: string }
  copy: { subject: string; html: string }
  triggerEventType: string
}): Promise<{ outcome: NoticeOutcome; error?: string }> {
  const trailRow = {
    orgId: p.orgId, applicationId: p.applicationId, subject: p.subject, milestone: p.milestone,
    templateKey: p.templateKey, deadlineAsStated: p.deadlineAsStated,
  }
  if (heldFor(p.templateKey)) {
    await recordGap(db, trailRow)
    return { outcome: "held" }
  }
  const sent = await sendEmail({
    orgId: p.orgId,
    templateKey: p.templateKey,
    to: p.to,
    subject: p.copy.subject,
    contentHtml: p.copy.html,
    entityType: p.subject.subjectType === "co_applicant" ? "application_co_applicant" : "application",
    entityId: p.subject.subjectId,
    triggerEventType: p.triggerEventType,
    triggerEventId: p.applicationId,
  })
  await recordTrail(db, { ...trailRow, sent })
  return sent.success ? { outcome: "sent" } : { outcome: "failed", error: sent.error ?? "unknown" }
}

// ─── N3 — on a party's completion ─────────────────────────────────────────────────────────────────────────────────

type Party = {
  subject: TrailSubject
  name: string
  firstName: string
  email: string | null
  invitedAt: string | null
  complete: boolean
  /** Paid for its own line — its part is done even while the check is still in flight. */
  paid: boolean
  isLead: boolean
}

/** The live roster: the lead plus every co row not declined and not lapsed (past its own deadline, incomplete and
 *  unpaid). A party that has left the set is told nothing and named to nobody. */
async function readRoster(db: SupabaseClient, orgId: string, applicationId: string): Promise<{ parties: Party[]; propertyLabel: string } | null> {
  const { data: app, error: appError } = await db
    .from("applications")
    .select("id, entity_type, first_name, last_name, applicant_email, stage2_invited_at, searchworx_check_status, listings(units(unit_number, properties(name)))")
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (appError) throw new Error(`progress: read application: ${appError.message}`)
  if (!app) return null
  const { data: cos, error: coError } = await db
    .from("application_co_applicants")
    .select("id, first_name, last_name, applicant_email, stage2_invited_at, searchworx_check_status")
    .eq("primary_application_id", applicationId)
    .eq("org_id", orgId)
    .is("declined_at", null)
    .order("created_at", { ascending: true })
  if (coError) throw new Error(`progress: read co parties: ${coError.message}`)
  const { data: lines, error: lineError } = await db
    .from("v_application_screening_lines")
    .select("subject_type, subject_id, paid_at")
    .eq("application_id", applicationId)
    .eq("org_id", orgId)
  if (lineError) throw new Error(`progress: read lines: ${lineError.message}`)
  const paidKeys = new Set((lines ?? []).filter((l) => l.paid_at).map((l) => `${l.subject_type}:${l.subject_id}`))
  const isPaid = (s: TrailSubject) => paidKeys.has(`${s.subjectType}:${s.subjectId}`)

  const fullName = (r: { first_name: unknown; last_name: unknown }) =>
    [r.first_name, r.last_name].filter(Boolean).join(" ") || "A party to the application"
  const leadSubj = leadSubject(app)
  const lead: Party = {
    subject: leadSubj, name: fullName(app), firstName: (app.first_name as string | null) ?? "there",
    email: (app.applicant_email as string | null) ?? null, invitedAt: (app.stage2_invited_at as string | null) ?? null,
    complete: app.searchworx_check_status === "complete", paid: isPaid(leadSubj), isLead: true,
  }
  const coParties: Party[] = (cos ?? []).map((c) => {
    const subject: TrailSubject = { subjectType: "co_applicant", subjectId: c.id as string }
    return {
      subject, name: fullName(c),
      firstName: (c.first_name as string | null) ?? "there", email: (c.applicant_email as string | null) ?? null,
      invitedAt: (c.stage2_invited_at as string | null) ?? null, complete: c.searchworx_check_status === "complete",
      paid: isPaid(subject), isLead: false,
    }
  })
  const listing = app.listings as { units?: { unit_number?: string; properties?: { name?: string } } } | null
  const unit = listing?.units
  const propertyLabel = [unit?.unit_number, unit?.properties?.name].filter(Boolean).join(", ") || "the property"
  // A party whose own D has passed without its part done has left the set even before the daily decline reaches it
  // (and a lead is never declined): after D it "exists only in the agent's view and the trail" (§4), so it is neither
  // named nor told (walker 14x-p4 F3). A PAID party is not absent while its check is in flight past D: the decline
  // cron never declines a paid line, and it will count (walker 14x-p4 N2).
  const lapsed = (x: Party) => !x.complete && !x.paid && !!x.invitedAt && isPastDeadline(x.invitedAt)
  return { parties: [lead, ...coParties].filter((x) => !lapsed(x)), propertyLabel }
}

/**
 * N3: `completed` has just completed. Every OTHER party still outstanding (and invited — an uninvited party has no link
 * to act on) is told, and so is the lead. Fires nothing when nobody is outstanding: N6 covers that (§2).
 * Called once per completion — the caller fires it only on the transition to complete. Failures are reported, never
 * thrown: the completion stands, and an event-driven notice has no next run to retry on (the failure row stays).
 */
export async function notifyProgress(db: SupabaseClient, p: { orgId: string; applicationId: string; completed: TrailSubject }): Promise<void> {
  const roster = await readRoster(db, p.orgId, p.applicationId)
  if (!roster) return
  const same = (a: TrailSubject, b: TrailSubject) => a.subjectType === b.subjectType && a.subjectId === b.subjectId
  const completer = roster.parties.find((x) => same(x.subject, p.completed))
  if (!completer) return
  const outstanding = roster.parties.filter((x) => !x.complete && !same(x.subject, p.completed))
  if (outstanding.length === 0) return

  const recipients = roster.parties.filter((x) =>
    !same(x.subject, p.completed) && !!x.email && (x.isLead || (!x.complete && !!x.invitedAt)))
  for (const r of recipients) {
    try {
      const result = await sendMilestoneNotice(db, {
        orgId: p.orgId, applicationId: p.applicationId, subject: r.subject, milestone: "N3", templateKey: PROGRESS_KEY,
        deadlineAsStated: r.invitedAt ? deadlineAsStated(r.invitedAt) : null,
        to: { email: r.email as string, name: r.firstName },
        copy: progressCopy({
          firstName: r.firstName, completedName: completer.name, propertyLabel: roster.propertyLabel,
          outstanding: outstanding.map((x) => x.name),
        }),
        triggerEventType: "screening:party_completed",
      })
      if (result.outcome === "failed") {
        Sentry.captureMessage("14X N3 progress notice not sent", {
          level: "warning", tags: { milestone: "N3" }, extra: { application_id: p.applicationId, error: result.error },
        })
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { milestone: "N3" }, extra: { application_id: p.applicationId } })
    }
  }
}

/** The deadline as a party reads it in copy: fmtDateLongZA of D (§4 "one date, stated the same way everywhere"). */
export function deadlineForCopy(t0: string): string {
  return fmtDateLongZA(deadlineAt(t0))
}
