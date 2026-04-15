"use client"

import { toast } from "sonner"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { formatZAR } from "@/lib/constants"
import { PrerequisitesCard } from "./PrerequisitesCard"
import { SigningOptions } from "./SigningOptions"
import { MigratedDocSection } from "./MigratedDocSection"
import type { PrerequisitesCheck } from "@/lib/leases/checkPrerequisites"

type SpecialTerm = { type: string; detail: string }
type Amendment = { id: string; amendment_type: string; effective_date: string; signed_at: string | null }

interface LeaseDetailsTabProps {
  lease: {
    id: string
    status: string
    rent_amount_cents: number | null
    deposit_amount_cents: number | null
    deposit_interest_to: string | null
    escalation_percent: number | null
    escalation_type: string | null
    escalation_review_date: string | null
    payment_due_day: string | null
    debicheck_mandate_status: string | null
    start_date: string | null
    end_date: string | null
    is_fixed_term: boolean | null
    notice_period_days: number | null
    cpa_applies: boolean | null
    auto_renewal_notice_sent_at: string | null
    special_terms: unknown
    migrated: boolean | null
    external_document_path: string | null
    generated_doc_path: string | null
    template_source: string | null
    docuseal_document_url: string | null
  }
  leaseId: string
  amendments: Amendment[]
  bankDetailsConfigured: boolean
  prereqs: PrerequisitesCheck | null
  tenantDisplayText: string
  unitLabel: string
}

function KVRow({ label, value }: { readonly label: string; readonly value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-border/40 last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value ?? "—"}</span>
    </div>
  )
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function formatDueDay(v: string | null): string {
  if (!v) return "—"
  if (v === "last_day") return "Last day of month"
  if (v === "last_working_day") return "Last working day"
  const n = Number.parseInt(v, 10)
  if (Number.isNaN(n)) return v
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" }
  return `${n}${suffixes[n % 10] ?? "th"} of each month`
}

function remainingLabel(days: number): string {
  if (days <= 0) return "Expired"
  if (days === 1) return "1 day"
  if (days < 30) return `${days} days`
  return `${Math.floor(days / 30)} months`
}

function remainingClass(days: number): string {
  if (days <= 0) return "text-danger"
  if (days <= 90) return "text-warning"
  return "text-brand"
}

export function LeaseDetailsTab({
  lease,
  leaseId,
  amendments,
  bankDetailsConfigured,
  prereqs,
  tenantDisplayText,
  unitLabel,
}: LeaseDetailsTabProps) {
  const isDraft = lease.status === "draft"
  const isActive = ["active", "signed", "month_to_month", "notice"].includes(lease.status)

  const today = new Date()
  const daysRemaining = lease.end_date
    ? Math.ceil((new Date(lease.end_date).getTime() - today.getTime()) / 86400000)
    : null

  let s14DueDate: Date | null = null
  if (lease.end_date && lease.cpa_applies && lease.is_fixed_term) {
    const d = new Date(lease.end_date)
    d.setDate(d.getDate() - 28)
    s14DueDate = d
  }

  const specialTerms = (lease.special_terms as SpecialTerm[] | null) ?? []
  const escalationLabel = lease.escalation_percent != null
    ? `${lease.escalation_percent}% ${lease.escalation_type ?? ""}`.trim()
    : null
  const s14Overdue = s14DueDate != null && !lease.auto_renewal_notice_sent_at && today > s14DueDate
  const bankWarning = isDraft && bankDetailsConfigured === false

  return (
    <div className="space-y-6">
      {/* Trust account warning (draft only) */}
      {bankWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <span className="mt-0.5 text-amber-500">⚠</span>
          <p className="text-amber-200">
            Trust account banking details are not configured.{" "}
            <Link href="/settings/compliance" className="underline hover:text-foreground">
              Settings → Banking
            </Link>
          </p>
        </div>
      )}

      {/* Migrated document */}
      {lease.migrated && (
        <MigratedDocSection
          leaseId={leaseId}
          externalDocPath={lease.external_document_path ?? null}
        />
      )}

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        {lease.generated_doc_path && (
          <Button variant="outline" size="sm" render={<Link href={`/api/leases/${leaseId}/document`} target="_blank" />}>
            View lease
          </Button>
        )}
        {isDraft && (
          <Button variant="outline" size="sm" render={<Link href={`/leases/${leaseId}/edit`} />}>
            Edit lease
          </Button>
        )}
        {isActive && (
          <>
            <Button variant="outline" size="sm" onClick={() => toast.info("Amendment creation coming soon")}>
              Create amendment
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Escalation processing coming soon")}>
              Process escalation
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Renewal offers coming soon")}>
              Renew
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Notice recording coming soon")}>
              Give notice
            </Button>
          </>
        )}
      </div>

      {/* Draft: prerequisites + signing options */}
      {isDraft && prereqs && (
        <div className="space-y-4">
          <PrerequisitesCard prereqs={prereqs} />
          <SigningOptions
            leaseId={leaseId}
            hasGeneratedDoc={lease.generated_doc_path != null}
            hasExternalDoc={lease.external_document_path != null}
            hasDocusealDoc={lease.docuseal_document_url != null}
            canProceed={prereqs.canProceed}
            tenantName={tenantDisplayText}
            unitLabel={unitLabel}
            depositAmountCents={lease.deposit_amount_cents ?? null}
            startDate={lease.start_date ?? null}
            rentAmountCents={lease.rent_amount_cents ?? 0}
            isUploaded={lease.template_source === "uploaded"}
          />
        </div>
      )}

      {/* Two-column: terms + period */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Lease terms */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Lease terms</h3>
          <KVRow label="Monthly rent" value={lease.rent_amount_cents ? formatZAR(lease.rent_amount_cents) : null} />
          <KVRow label="Deposit" value={lease.deposit_amount_cents ? formatZAR(lease.deposit_amount_cents) : null} />
          <KVRow label="Deposit interest to" value={lease.deposit_interest_to?.replaceAll("_", " ") ?? null} />
          <KVRow label="Escalation" value={escalationLabel} />
          <KVRow label="Next escalation" value={lease.escalation_review_date ? fmt(lease.escalation_review_date) : null} />
          <KVRow label="Payment due" value={formatDueDay(lease.payment_due_day)} />
          <KVRow label="DebiCheck" value={lease.debicheck_mandate_status?.replaceAll("_", " ") ?? "Not created"} />
        </div>

        {/* Right: Lease period */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Lease period</h3>
          <KVRow label="Start date" value={lease.start_date ? fmt(lease.start_date) : null} />
          <KVRow label="End date" value={lease.end_date ? fmt(lease.end_date) : "Month to month"} />
          <KVRow label="Term type" value={lease.is_fixed_term ? "Fixed term" : "Month to month"} />
          {daysRemaining !== null && (
            <KVRow
              label="Remaining"
              value={<span className={remainingClass(daysRemaining)}>{remainingLabel(daysRemaining)}</span>}
            />
          )}
          <KVRow label="Notice period" value={lease.notice_period_days ? `${lease.notice_period_days} business days` : null} />
          {s14DueDate && (
            <KVRow
              label="s14 notice due"
              value={
                <span className={s14Overdue ? "text-warning" : ""}>
                  {fmt(s14DueDate.toISOString())}
                  {lease.auto_renewal_notice_sent_at && (
                    <span className="block text-xs text-success font-normal">
                      Sent {fmt(lease.auto_renewal_notice_sent_at)}
                    </span>
                  )}
                </span>
              }
            />
          )}
        </div>
      </div>

      {/* Two-column: special agreements + amendments */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Special agreements */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Special agreements</h3>
          {specialTerms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No special agreements recorded.</p>
          ) : (
            <ul className="space-y-2">
              {specialTerms.map((term) => (
                <li key={`${term.type}-${term.detail.slice(0, 20)}`} className="text-sm">
                  <span className="font-medium capitalize">{term.type.replaceAll("_", " ")}</span>
                  <span className="text-muted-foreground"> — {term.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: Amendments */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Amendments</h3>
          {amendments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No amendments recorded.</p>
          ) : (
            <div className="space-y-3">
              {amendments.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium capitalize">{a.amendment_type.replaceAll("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">Effective {a.effective_date}</p>
                  </div>
                  {a.signed_at ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Signed</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Pending</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
