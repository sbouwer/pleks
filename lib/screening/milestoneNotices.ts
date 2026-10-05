/**
 * lib/screening/milestoneNotices.ts — the 14X notices that are new copy: N3 progress, N5 final notice, N6′ outcome-absent
 *
 * Data:   applications + application_co_applicants (the roster, org-scoped) via the caller's service client;
 *         sends through sendEmail; every attempt or held gap goes to the trail (lib/screening/notificationTrail.ts).
 * Notes:  ADDENDUM_14X §2/§4; counsel reviewed the pack 2026-10-05 (brief/legal/COUNSEL_DRAFT_14X_MILESTONE_COPY_2026-10-05.md
 *         §5). N5, N6′ and the N6 copy are APPROVED and their consequence sentences below are counsel's, verbatim — edit
 *         them only with a new counsel row. N3 and the lead's chaser N5 are HELD (registry `heldFor`): while held,
 *         sendMilestoneNotice sends nothing and records the gap once per party per milestone.
 *         NAMES (counsel Q1/Q3): a notice names who HAS completed and counts the rest. Which party has not completed is
 *         never named while the window is open, nor ever after; never "failed / refused / not paid". N6′ names nobody.
 *         Every name is applicant-typed, so every interpolation is HTML-escaped.
 *         THE LEAD has variants of N5 and N6′: under §0 the FitScore runs only once the lead's own line is complete, so
 *         "the application will be assessed without you" is false for the lead. The variant says what is true.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { sendEmail } from "@/lib/comms/send-email"
import { heldFor } from "@/lib/comms/template-registry"
import { ASSESSMENT_CLOSING_SENTENCE } from "@/lib/screening/assessmentWording"
import { fmtDateLongZA } from "@/lib/dates"
import { readAssessedWith } from "@/lib/screening/assessedWith"
import { deadlineAsStated, deadlineAt, finalNoticeAt, isPastDeadline } from "@/lib/screening/notificationSchedule"
import {
  leadSubject, milestonesSentOk, recordGap, recordTrail, type TrailMilestone, type TrailSubject,
} from "@/lib/screening/notificationTrail"

export const PROGRESS_KEY = "application.screening_progress"
export const FINAL_NOTICE_KEY = "application.screening_final_notice"
export const FINAL_NOTICE_OTHERS_KEY = "application.screening_final_notice_others"
export const OUTCOME_KEY = "application.screening_outcome"
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

/** N3 (HELD). Counts the rest, never names them: 14X §2 as amended on counsel's Q1. */
export function progressCopy(p: { firstName: string; completedName: string; completed: number; total: number; propertyLabel: string }) {
  return {
    subject: `Update on your application — ${p.propertyLabel}`,
    html: `
<p>Hi ${esc(p.firstName)},</p>
<p>${esc(p.completedName)} has completed their part of the application for <strong>${esc(p.propertyLabel)}</strong>.
${p.completed} of ${p.total} parties have now completed.</p>`,
  }
}

/**
 * N5 (APPROVED). Both sentences are counsel's, verbatim (pack §5 row 2): the co party's is counsel's formulation, and
 * the lead's is the drafted lead variant counsel left unchanged. Do not harmonise them — the lead's was approved as is.
 */
export function finalNoticeCopy(p: { firstName: string; deadline: string; propertyLabel: string; lead: boolean }) {
  const consequence = p.lead
    ? "If your part is not complete by then, the application cannot be assessed."
    : `If you do not complete your part by ${esc(p.deadline)}, the application will be assessed without your screening information.`
  return {
    subject: `Final notice: your deadline is ${p.deadline} — ${p.propertyLabel}`,
    html: `
<p>Hi ${esc(p.firstName)},</p>
<p>Your deadline to complete your part of the application for <strong>${esc(p.propertyLabel)}</strong> is
<strong>${esc(p.deadline)}</strong>.</p>
<p>${consequence}</p>
<p>To complete your part, use the link in your invitation email.</p>`,
  }
}

/** N5 to a lead whose own part is complete while another party's final 24 hours run (HELD — new copy). A count, no
 *  names and no date: each party runs on its own clock, so no one date is true of all of them. */
export function finalNoticeOthersCopy(p: { firstName: string; propertyLabel: string; completed: number; total: number }) {
  return {
    subject: `Final day for the other parties — ${p.propertyLabel}`,
    html: `
<p>Hi ${esc(p.firstName)},</p>
<p>Another party to the application for <strong>${esc(p.propertyLabel)}</strong> has less than 24 hours left to complete
their part. ${p.completed} of ${p.total} parties have completed so far.</p>
<p>A party who does not complete their part by their deadline is not included: the application will be assessed without
that party's screening information.</p>`,
  }
}

/** N6 (copy APPROVED). Names only the completed parties; the count discloses no name (counsel Q3). The link is passed
 *  only where the recipient may have it (14X §2: group paragraph shown, policy live) — otherwise the copy stands alone. */
export function outcomeCopy(p: {
  firstName: string; propertyLabel: string; completedNames: string[]; completed: number; total: number; link: string | null
}) {
  const link = p.link ? `\n<p><a href="${esc(p.link)}">View the assessment →</a></p>` : ""
  return {
    subject: `The assessment for your application is ready — ${p.propertyLabel}`,
    html: `
<p>Hi ${esc(p.firstName)},</p>
<p>The assessment for <strong>${esc(p.propertyLabel)}</strong> has been generated based on the parts that were completed:
${esc(nameList(p.completedNames))}.</p>
<p>Assessed with ${p.completed} of ${p.total} parties.</p>${link}
<p>${esc(ASSESSMENT_CLOSING_SENTENCE)}</p>`,
  }
}

/** N6′ (APPROVED). The co-party consequence is counsel's, verbatim; "will be" because at D the run has not happened. */
export function outcomeAbsentCopy(p: { firstName: string; propertyLabel: string; lead: boolean }) {
  const consequence = p.lead
    ? "Without your part, the application could not be assessed."
    : "The application will be assessed without your screening information."
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
  /**
   * Owes nothing more: paid AND consented, whatever the check is doing (Stéan 2026-10-05: paid-and-running = complete,
   * 14W §0). The view's states past both acts. Used by the lead chaser; N3 still counts line completion (it is held, and
   * its trigger is a line completing — aligning it is part of releasing it).
   */
  settled: boolean
  isLead: boolean
}

/** The view's states in which a party has paid and consented: nothing is left for that party to do. */
const SETTLED_STATES: ReadonlySet<string> = new Set(["ready_to_run", "running", "failed", "complete"])

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
    .select("subject_type, subject_id, paid_at, state")
    .eq("application_id", applicationId)
    .eq("org_id", orgId)
  if (lineError) throw new Error(`progress: read lines: ${lineError.message}`)
  const paidKeys = new Set((lines ?? []).filter((l) => l.paid_at).map((l) => `${l.subject_type}:${l.subject_id}`))
  const isPaid = (s: TrailSubject) => paidKeys.has(`${s.subjectType}:${s.subjectId}`)
  const settledKeys = new Set((lines ?? []).filter((l) => SETTLED_STATES.has(l.state as string)).map((l) => `${l.subject_type}:${l.subject_id}`))
  const isSettled = (s: TrailSubject) => settledKeys.has(`${s.subjectType}:${s.subjectId}`)

  const fullName = (r: { first_name: unknown; last_name: unknown }) =>
    [r.first_name, r.last_name].filter(Boolean).join(" ") || "A party to the application"
  const leadSubj = leadSubject(app)
  const lead: Party = {
    subject: leadSubj, name: fullName(app), firstName: (app.first_name as string | null) ?? "there",
    email: (app.applicant_email as string | null) ?? null, invitedAt: (app.stage2_invited_at as string | null) ?? null,
    complete: app.searchworx_check_status === "complete", paid: isPaid(leadSubj),
    settled: app.searchworx_check_status === "complete" || isSettled(leadSubj), isLead: true,
  }
  const coParties: Party[] = (cos ?? []).map((c) => {
    const subject: TrailSubject = { subjectType: "co_applicant", subjectId: c.id as string }
    return {
      subject, name: fullName(c),
      firstName: (c.first_name as string | null) ?? "there", email: (c.applicant_email as string | null) ?? null,
      invitedAt: (c.stage2_invited_at as string | null) ?? null, complete: c.searchworx_check_status === "complete",
      paid: isPaid(subject), settled: c.searchworx_check_status === "complete" || isSettled(subject), isLead: false,
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
  const completed = roster.parties.filter((x) => x.complete || same(x.subject, p.completed)).length

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
          completed, total: roster.parties.length,
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

/**
 * The N6 result link for one recipient, or null. ALWAYS null in this build: counsel row 3 gates the link on (3a) the
 * group paragraph and the completion-status sentence being live with `group_clause_shown` on THIS recipient's consent
 * (14X P5) and (3b) policy §171 v1.5.1. Neither exists yet, so N6 goes without a link, which the approved copy allows.
 * The gate is per recipient, never a release date (14X §2), so when P5 lands it is decided here for each party.
 */
function outcomeLinkFor(): string | null {
  return null
}

/**
 * N6: the FitScore has run on the completed parts. Every party it was computed on (the stamp's completed ids — the lead
 * among them) is told once; the email names only those parties and states the stamp's count (counsel Q3). Called after
 * a successful orchestrator run. The orchestrator re-runs on every settle and decline and reports success the same way
 * for a first run and a no-op, so ONCE comes from the trail: a recipient with N6 on it is skipped. A party declined
 * after N6 changes M; nobody is re-notified (the stamp they were told stays true of the run they were told about).
 * A failed send writes a send_ok=false N6 row. The orchestrator is NOT a retrier: its callers fire once per transition
 * (a line completing, a party declined), so there is usually no "next run" (walker 14x-p4b F1). The reminders cron is
 * the retrier — it re-offers every application with a failed N6 row inside one window, and this function skips
 * whoever already has a sent one. A throw before any attempt (a read failing) leaves no row and is reported only.
 */
export async function notifyOutcome(db: SupabaseClient, p: { orgId: string; applicationId: string }): Promise<void> {
  const { data: app, error } = await db
    .from("applications")
    .select("fitscore_component_snapshot")
    .eq("id", p.applicationId)
    .eq("org_id", p.orgId)
    .maybeSingle()
  if (error) throw new Error(`outcome: read application: ${error.message}`)
  const stamp = readAssessedWith(app?.fitscore_component_snapshot ?? null)
  if (!stamp) {
    Sentry.captureMessage("14X N6 not sent: the FitScore snapshot carries no assessedWith stamp", {
      level: "warning", tags: { milestone: "N6" }, extra: { application_id: p.applicationId },
    })
    return
  }
  const roster = await readRoster(db, p.orgId, p.applicationId)
  if (!roster) return
  const scored = new Set(stamp.completedSubjectIds)
  const completedParties = roster.parties.filter((x) => scored.has(x.subject.subjectId) && x.complete)
  const completedNames = completedParties.map((x) => x.name)

  for (const r of completedParties) {
    if (!r.email) continue
    try {
      if ((await milestonesSentOk(db, p.orgId, p.applicationId, r.subject)).has("N6")) continue
      const result = await sendMilestoneNotice(db, {
        orgId: p.orgId, applicationId: p.applicationId, subject: r.subject, milestone: "N6", templateKey: OUTCOME_KEY,
        deadlineAsStated: r.invitedAt ? deadlineAsStated(r.invitedAt) : null,
        to: { email: r.email, name: r.firstName },
        copy: outcomeCopy({
          firstName: r.firstName, propertyLabel: roster.propertyLabel, completedNames,
          completed: stamp.n, total: stamp.m, link: outcomeLinkFor(),
        }),
        triggerEventType: "screening:fitscore_run",
      })
      if (result.outcome === "failed") {
        Sentry.captureMessage("14X N6 outcome notice not sent", {
          level: "warning", tags: { milestone: "N6" }, extra: { application_id: p.applicationId, error: result.error },
        })
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { milestone: "N6" }, extra: { application_id: p.applicationId } })
    }
  }
}

/**
 * The lead's N5 when the lead's own part is complete (14X §2: N5 goes to "each party not yet complete, and the lead").
 * Due while any other live party that still OWES something is inside its own final 24 hours; the caller sends it once
 * (the lead's N5 trail row). "Done" is `settled` — paid and consented, the check running or not (Stéan 2026-10-05,
 * 14W §0) — for the lead, for the party in its final day, and for the count. A lead that still owes something gets its
 * own N5 on its own clock instead. Returns null when it is not due.
 */
export async function leadFinalNoticeForOthers(db: SupabaseClient, p: {
  orgId: string; applicationId: string; now?: Date
}): Promise<{ outcome: NoticeOutcome; error?: string } | null> {
  const now = p.now ?? new Date()
  const roster = await readRoster(db, p.orgId, p.applicationId)
  if (!roster) return null
  const lead = roster.parties.find((x) => x.isLead)
  if (!lead?.email || !lead.settled) return null
  const inFinalDay = roster.parties.some((x) =>
    !x.isLead && !x.settled && !!x.invitedAt && now >= finalNoticeAt(x.invitedAt) && !isPastDeadline(x.invitedAt, now))
  if (!inFinalDay) return null
  return sendMilestoneNotice(db, {
    orgId: p.orgId, applicationId: p.applicationId, subject: lead.subject, milestone: "N5", templateKey: FINAL_NOTICE_OTHERS_KEY,
    deadlineAsStated: lead.invitedAt ? deadlineAsStated(lead.invitedAt) : null,
    to: { email: lead.email, name: lead.firstName },
    copy: finalNoticeOthersCopy({
      firstName: lead.firstName, propertyLabel: roster.propertyLabel,
      completed: roster.parties.filter((x) => x.settled).length, total: roster.parties.length,
    }),
    triggerEventType: "cron:screening_portal_reminders",
  })
}

/** The deadline as a party reads it in copy: fmtDateLongZA of D (§4 "one date, stated the same way everywhere"). */
export function deadlineForCopy(t0: string): string {
  return fmtDateLongZA(deadlineAt(t0))
}
