"use client"
/**
 * app/(dashboard)/leases/[leaseId]/demand-to-vacate/DemandToVacatePicker.tsx — the Demand-to-Vacate picker
 *
 * Auth:   parent page gates (gatewaySSR); the server actions re-gate (preview=read, issue=agent-write)
 * Data:   previewDemandToVacate / issueDemandToVacate / getNoticeServiceState / record+waivePhysicalService
 * Notes:  LEG-NOTICES-01 Phase E-3. UX-as-control: P-1 confirm names the EFFECT (breach = cancellation, not
 *         "send"); P-2 preview renders via the same path but records nothing (the confirm is one action
 *         away, never automatic); P-3 a Rule-5 m2m suggestion is the PRIMARY one-tap redirect, overriding
 *         onto the unsafe path is the harder secondary; P-4 mobile-first, block findings are sentences, the
 *         override reason is a mandatory textarea, and the E-6 "physical service outstanding" task is a
 *         persistent panel, not a toast. Fixed 14-day vacate period — no custom-date field (E-3).
 */

import * as React from "react"
import { ActionButton } from "@/components/ui/actions"
import {
  previewDemandToVacate, issueDemandToVacate, getNoticeServiceState, recordPhysicalService, waivePhysicalService,
  type PreviewDemandResult, type IssueDemandResult,
} from "@/lib/actions/notices"
import type { DemandNoticeType } from "@/lib/notices/issueTenantNotice"
import { saTodayISO } from "@/lib/dates"

type Preview = Extract<PreviewDemandResult, { ok: true }>
type Issued = Extract<IssueDemandResult, { ok: true }>

const SCENARIOS: { type: DemandNoticeType; label: string; blurb: string }[] = [
  { type: "demand_vacate_breach", label: "Breach cancellation", blurb: "Cancel the lease for an unremedied breach and demand vacation." },
  { type: "demand_vacate_expiry", label: "Fixed-term expiry", blurb: "Demand vacation after a fixed term has expired." },
  { type: "demand_vacate_m2m", label: "Month-to-month termination", blurb: "Demand vacation after a month-to-month notice period has ended." },
]

const NOTICE_LABEL: Record<DemandNoticeType, string> = {
  demand_vacate_breach: "Breach cancellation",
  demand_vacate_expiry: "Fixed-term expiry",
  demand_vacate_m2m: "Month-to-month termination",
}

/** P-1 — the confirm sentence names the EFFECT, plainly, per scenario. */
function confirmCopy(type: DemandNoticeType, p: Preview): string {
  const addrs = p.service.emails.length
  const plural = addrs === 1 ? "" : "es"
  const service = addrs > 0 ? `Served to ${addrs} address${plural} on record` : "No electronic address on record — physical service required"
  const sureties = p.service.suretyEmails.length > 0 ? `, and copied to ${p.service.suretyEmails.length} surety of record` : ""
  if (type === "demand_vacate_breach") {
    return `This CANCELS the lease, effective ${p.dates.cancellationEffective}. ${p.tenantName} must vacate ${p.propertyLabel} by ${p.dates.vacateBy}. ${service}${sureties}. This is a legal cancellation instrument — not an email.`
  }
  return `This demands that ${p.tenantName} vacate ${p.propertyLabel} by ${p.dates.vacateBy}. ${service}${sureties}.`
}

export function DemandToVacatePicker({ leaseId }: Readonly<{ leaseId: string }>) {
  const [type, setType] = React.useState<DemandNoticeType | null>(null)
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [overriding, setOverriding] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const [issued, setIssued] = React.useState<Issued | null>(null)

  const runPreview = React.useCallback(async (t: DemandNoticeType) => {
    setType(t); setPreview(null); setIssued(null); setOverriding(false); setReason(""); setError(null); setBusy(true)
    const r = await previewDemandToVacate({ leaseId, noticeType: t })
    setBusy(false)
    if (!r.ok) { setError(r.reason === "not_found" ? "Lease not found." : "Not authorised."); return }
    setPreview(r)
  }, [leaseId])

  const runIssue = React.useCallback(async () => {
    if (!type) return
    setBusy(true); setError(null)
    const r = await issueDemandToVacate({ leaseId, noticeType: type, override: overriding ? { reason } : undefined })
    setBusy(false)
    if (r.ok) { setIssued(r); return }
    if (r.reason === "override_reason_required") setError("A reason is required to override.")
    else if (r.reason === "duplicate") setError("A notice of this type has already been issued for this lease.")
    else if (r.reason === "needs_override") setOverriding(true)
    else setError("Could not issue the notice.")
  }, [leaseId, type, overriding, reason])

  if (issued) return <IssuedPanel leaseId={leaseId} issued={issued} type={type!} />

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <div>
        <h1 className="text-lg font-semibold">Issue a Demand to Vacate</h1>
        <p className="text-sm text-muted-foreground">Residential only. The vacate period is a fixed 14 calendar days.</p>
      </div>

      {/* Scenario picker */}
      <fieldset className="flex flex-col gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.type} type="button" onClick={() => runPreview(s.type)}
            className={`rounded-[var(--r-button)] border p-3 text-left transition ${type === s.type ? "border-amber-500 bg-amber-50/50" : "border-border hover:border-amber-300"}`}
          >
            <span className="block text-sm font-medium">{s.label}</span>
            <span className="block text-xs text-muted-foreground">{s.blurb}</span>
          </button>
        ))}
      </fieldset>

      {busy && <p className="text-sm text-muted-foreground">Working…</p>}
      {error && <p className="rounded-[var(--r-button)] border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {preview && type && (
        <PreviewPanel
          type={type} preview={preview} overriding={overriding} reason={reason} busy={busy}
          onSwitchToM2m={() => runPreview("demand_vacate_m2m")}
          onStartOverride={() => setOverriding(true)}
          onReason={setReason} onIssue={runIssue}
        />
      )}
    </div>
  )
}

function PreviewPanel({ type, preview, overriding, reason, busy, onSwitchToM2m, onStartOverride, onReason, onIssue }: Readonly<{
  type: DemandNoticeType; preview: Preview; overriding: boolean; reason: string; busy: boolean
  onSwitchToM2m: () => void; onStartOverride: () => void; onReason: (v: string) => void; onIssue: () => void
}>) {
  const { precondition } = preview
  const blocked = precondition.decision === "block"
  const review = precondition.decision === "manual_review"
  const suggestsM2m = review && precondition.suggestedNoticeType === "demand_vacate_m2m"

  return (
    <div className="flex flex-col gap-4">
      {/* The rendered notice — preview only, records nothing */}
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview — {NOTICE_LABEL[type]}</p>
        <iframe title="Notice preview" srcDoc={preview.html} className="h-72 w-full rounded-[var(--r-button)] border border-border bg-white" />
      </div>

      {/* Block findings — agent-facing sentences (P-4) */}
      {blocked && (
        <div className="rounded-[var(--r-button)] border border-red-200 bg-red-50 p-3">
          <p className="mb-1 text-sm font-medium text-red-900">This notice cannot be issued yet:</p>
          <ul className="flex flex-col gap-1">
            {precondition.blocks.map((b) => <li key={b.code} className="text-sm text-red-800">{b.message}</li>)}
          </ul>
        </div>
      )}

      {/* Manual-review — P-3: m2m redirect is primary, override is the harder secondary */}
      {review && (
        <div className="rounded-[var(--r-button)] border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-sm font-medium text-amber-900">This needs a review before it can issue:</p>
          <ul className="mb-3 flex flex-col gap-1">
            {precondition.reviews.map((r) => <li key={r.code} className="text-sm text-amber-900">{r.message}</li>)}
          </ul>
          {suggestsM2m && !overriding && (
            <ActionButton tone="primary" onClick={onSwitchToM2m} className="w-full sm:w-auto">
              Use the month-to-month route instead
            </ActionButton>
          )}
          {!overriding && (
            <button type="button" onClick={onStartOverride} className="mt-2 block text-xs text-amber-700 underline">
              Override and issue on this path anyway
            </button>
          )}
          {overriding && (
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-amber-900">Reason for overriding (required, recorded on the notice):</span>
              <textarea
                value={reason} onChange={(e) => onReason(e.target.value)} rows={3}
                className="w-full rounded-[var(--r-button)] border border-amber-300 p-2 text-sm"
                placeholder="e.g. Counsel confirmed the flag does not bar this notice because…"
              />
            </label>
          )}
        </div>
      )}

      {/* Manual-attestation warning (Q11/Q12) */}
      {preview.service.needsManualAttestation && (
        <p className="rounded-[var(--r-button)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No electronic service address is on record. This notice must be served physically and the service attested.
        </p>
      )}

      {/* P-1 confirm — states the effect, not the transport */}
      {!blocked && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-sm">{confirmCopy(type, preview)}</p>
          <ActionButton
            tone="primary" onClick={onIssue}
            disabled={busy || (review && overriding && !reason.trim())}
            className="w-full"
          >
            {type === "demand_vacate_breach" ? "Cancel lease & issue Demand to Vacate" : "Issue Demand to Vacate"}
          </ActionButton>
        </div>
      )}
    </div>
  )
}

/** E-6 — the "physical service outstanding" task is persistent state, not a toast (P-4). */
function IssuedPanel({ leaseId, issued, type }: Readonly<{ leaseId: string; issued: Issued; type: DemandNoticeType }>) {
  const [outstanding, setOutstanding] = React.useState<boolean | null>(null)
  const [waiveReason, setWaiveReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const refresh = React.useCallback(async () => {
    const s = await getNoticeServiceState(issued.noticeId)
    setOutstanding(s.physicalServiceOutstanding)
  }, [issued.noticeId])

  React.useEffect(() => { void refresh() }, [refresh])

  const doRecord = async () => {
    setBusy(true)
    await recordPhysicalService({ noticeId: issued.noticeId, channel: "physical", servedAt: saTodayISO() })
    setBusy(false); await refresh()
  }
  const doWaive = async () => {
    if (!waiveReason.trim()) return
    setBusy(true)
    await waivePhysicalService({ noticeId: issued.noticeId, reason: waiveReason })
    setBusy(false); await refresh()
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div className="rounded-[var(--r-button)] border border-green-200 bg-green-50 p-3">
        <p className="text-sm font-medium text-green-900">{NOTICE_LABEL[type]} issued.</p>
        <p className="text-sm text-green-800">Vacate by {issued.vacateByDate}. Served to {issued.dispatched.filter((d) => d.success).length} address(es).</p>
      </div>

      {/* E-6 persistent task */}
      {outstanding === true && (
        <div className="rounded-[var(--r-button)] border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Physical service outstanding</p>
          <p className="mb-2 text-sm text-amber-800">Every demand must be served physically to the domicilium. Record the physical service, or waive it with a reason.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ActionButton tone="primary" onClick={doRecord} disabled={busy}>Record physical service</ActionButton>
          </div>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-xs font-medium text-amber-900">…or waive with a reason:</span>
            <textarea value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} rows={2} className="w-full rounded-[var(--r-button)] border border-amber-300 p-2 text-sm" placeholder="Reason physical service is not required…" />
            <ActionButton tone="secondary" onClick={doWaive} disabled={busy || !waiveReason.trim()}>Waive physical service</ActionButton>
          </label>
        </div>
      )}
      {outstanding === false && (
        <p className="rounded-[var(--r-button)] border border-green-200 bg-green-50 p-3 text-sm text-green-800">Physical service recorded — this notice is fully served.</p>
      )}

      <a href={`/leases/${leaseId}`} className="text-sm text-amber-700 underline">Back to lease</a>
    </div>
  )
}
