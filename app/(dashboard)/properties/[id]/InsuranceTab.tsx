import Link from "next/link"
import { formatZAR } from "@/lib/constants"
import { ShieldCheck, User, Building2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface InsurancePolicy {
  insurance_policy_number:          string | null
  insurance_provider:               string | null
  insurance_policy_type:            string | null
  insurance_renewal_date:           string | null
  insurance_replacement_value_cents: number | null
  insurance_excess_cents:           number | null
  insurance_notes:                  string | null
}

export interface InsuranceBroker {
  broker_contact_id: string
  broker_name:       string
  broker_email:      string | null
  broker_phone:      string | null
  auto_notify_critical: boolean
  notify_channels:   string[]
  after_hours_number: string | null
  notes:             string | null
}

export interface InsuranceBuildingRow {
  id:                     string
  name:                   string
  replacement_value_cents: number | null
  last_valuation_date:    string | null
}

export interface InsuranceClaim {
  id:                        string
  title:                     string
  work_order_number:         string | null
  insurance_claim_reference: string | null
  insurance_decision:        string | null
  created_at:                string
}

interface InsuranceTabProps {
  propertyId:    string
  policy:        InsurancePolicy
  broker:        InsuranceBroker | null
  buildings:     InsuranceBuildingRow[]
  activeClaims:  InsuranceClaim[]
  canSeeBroker:  boolean
}

const POLICY_TYPE_LABELS: Record<string, string> = {
  standard_buildings: "Standard buildings",
  heritage_specialist: "Heritage specialist",
  commercial_property: "Commercial property",
  sectional_title: "Sectional title",
  other: "Other",
}

function computeDaysUntilRenewal(renewalDate: string | null): number | null {
  if (!renewalDate) return null
  return Math.ceil((new Date(renewalDate).getTime() - Date.now()) / 86400000)
}

const DECISION_BADGE: Record<string, { label: string; cls: string }> = {
  reported: { label: "Reported",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  pending:  { label: "Pending",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  declined: { label: "Declined",  cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  unsure:   { label: "Unsure",    cls: "bg-muted text-muted-foreground" },
}

function KvRow({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  )
}

function SectionCard({
  title,
  icon: Icon,
  editHref,
  children,
}: Readonly<{
  title: string
  icon: React.ElementType
  editHref?: string
  children: React.ReactNode
}>) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{title}</span>
        </div>
        {editHref && (
          <Link href={editHref} className="text-xs text-brand hover:underline">Edit</Link>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

export function InsuranceTab({
  propertyId,
  policy,
  broker,
  buildings,
  activeClaims,
  canSeeBroker,
}: Readonly<InsuranceTabProps>) {
  const editHref = `/properties/${propertyId}/insurance/edit`

  const hasPolicy = policy.insurance_policy_number || policy.insurance_provider

  const totalReplacementCents = buildings.reduce(
    (s, b) => s + (b.replacement_value_cents ?? 0),
    0,
  )

  const renewalDate = policy.insurance_renewal_date
    ? new Date(policy.insurance_renewal_date).toLocaleDateString("en-ZA", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null

  const daysUntilRenewal = computeDaysUntilRenewal(policy.insurance_renewal_date)

  return (
    <div className="space-y-6">
      {/* Policy card */}
      <SectionCard title="Insurance policy" icon={ShieldCheck} editHref={editHref}>
        {hasPolicy ? (
          <>
            {daysUntilRenewal !== null && daysUntilRenewal <= 30 && daysUntilRenewal >= 0 && (
              <div className="flex items-center gap-2 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Renewal due in {daysUntilRenewal} day{daysUntilRenewal !== 1 ? "s" : ""}
                </p>
              </div>
            )}
            <KvRow label="Policy number"     value={policy.insurance_policy_number ?? "—"} />
            <KvRow label="Provider"          value={policy.insurance_provider ?? "—"} />
            <KvRow
              label="Policy type"
              value={POLICY_TYPE_LABELS[policy.insurance_policy_type ?? ""] ?? policy.insurance_policy_type ?? "—"}
            />
            <KvRow label="Renewal date"      value={renewalDate ?? "—"} />
            <KvRow
              label="Replacement value"
              value={policy.insurance_replacement_value_cents
                ? formatZAR(policy.insurance_replacement_value_cents)
                : "—"}
            />
            <KvRow
              label="Excess"
              value={policy.insurance_excess_cents
                ? formatZAR(policy.insurance_excess_cents)
                : "—"}
            />
            {policy.insurance_notes && (
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
                {policy.insurance_notes}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">No insurance policy recorded.</p>
            <Link href={editHref} className="text-xs text-brand hover:underline">Add policy →</Link>
          </div>
        )}
      </SectionCard>

      {/* Broker card — gated: Owner Pro+ only */}
      {canSeeBroker ? (
        <SectionCard title="Insurance broker" icon={User} editHref={editHref}>
          {broker ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="size-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-brand">
                    {broker.broker_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium">{broker.broker_name}</p>
                  {broker.broker_email && (
                    <p className="text-xs text-muted-foreground">{broker.broker_email}</p>
                  )}
                </div>
              </div>
              <KvRow label="Phone"            value={broker.broker_phone ?? "—"} />
              <KvRow label="After hours"      value={broker.after_hours_number ?? "—"} />
              <KvRow
                label="Auto-notify (critical)"
                value={broker.auto_notify_critical ? "Yes" : "No"}
              />
              <KvRow
                label="Notify channels"
                value={broker.notify_channels.join(", ")}
              />
              {broker.notes && (
                <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
                  {broker.notes}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No broker assigned.</p>
              <Link href={editHref} className="text-xs text-brand hover:underline">Assign broker →</Link>
            </div>
          )}
        </SectionCard>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-5 space-y-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Insurance broker &amp; auto-notify</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Add your broker and auto-notify them when a critical incident is logged.
          </p>
          <p className="text-xs text-brand font-medium">
            Upgrade to Owner Pro to unlock broker management and critical incident notifications.
          </p>
        </div>
      )}

      {/* Per-building replacement values */}
      {buildings.length > 0 && (
        <SectionCard title="Building replacement values" icon={Building2}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left pb-2 font-medium">Building</th>
                <th className="text-right pb-2 font-medium">Replacement value</th>
                <th className="text-right pb-2 font-medium">Last valuation</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => (
                <tr key={b.id} className="border-t border-border/30">
                  <td className="py-1.5">{b.name}</td>
                  <td className="py-1.5 text-right font-medium">
                    {b.replacement_value_cents ? formatZAR(b.replacement_value_cents) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {b.last_valuation_date
                      ? new Date(b.last_valuation_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            {totalReplacementCents > 0 && (
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="pt-2">Total</td>
                  <td className="pt-2 text-right">{formatZAR(totalReplacementCents)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </SectionCard>
      )}

      {/* Active insurance claims */}
      {activeClaims.length > 0 && (
        <SectionCard title="Insurance claims" icon={AlertTriangle}>
          <div className="space-y-2">
            {activeClaims.map((claim) => {
              const badge = DECISION_BADGE[claim.insurance_decision ?? ""] ?? DECISION_BADGE.unsure
              return (
                <div key={claim.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{claim.title}</p>
                    {claim.insurance_claim_reference && (
                      <p className="text-xs text-muted-foreground">{claim.insurance_claim_reference}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", badge.cls)}>
                      {badge.label}
                    </span>
                    <Link
                      href={`/maintenance/${claim.id}`}
                      className="text-xs text-brand hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
