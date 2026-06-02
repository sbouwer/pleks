/**
 * app/(dashboard)/finance/FinanceOverview.tsx — Finance Overview body (door grammar, tier-aware)
 *
 * Auth:   rendered by finance/page.tsx (gatewaySSR)
 * Data:   FinanceHubData (trust / tenant arrears / owner payouts / unmatched) + CollectionRateData
 * Notes:  Paid tiers get the full overview (cash strip, trust, collections, arrears, payouts,
 *         reconciliation). Owner (free) gets read-only stats only — no trust/payouts/reconcile, no
 *         actions — since those are paid features (matches the "every PAID tier" marketing line).
 */
import Link from "next/link"
import type { ReactNode } from "react"
import { Shield, Check, ArrowRight } from "lucide-react"
import { formatZAR, formatZARAbbrev } from "@/lib/constants"
import type { FinanceHubData, TenantBalance, OwnerBalance, UnmatchedLine } from "@/lib/finance/financeHub"
import type { CollectionRateData } from "@/lib/dashboard/collectionRate"

// ── helpers ───────────────────────────────────────────────────────────────────

function relDays(dateStr: string | null): { label: string; ok: boolean } {
  if (!dateStr) return { label: "not yet reconciled", ok: false }
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  let when = `${days} days ago`
  if (days <= 0) when = "today"
  else if (days === 1) when = "yesterday"
  return { label: when, ok: days <= 35 }   // a calendar-month-ish window
}

function ChipStatus({ status }: Readonly<{ status: string }>) {
  const map: Record<string, string> = {
    clear:   "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    paid:    "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    owing:   "bg-primary/10 text-primary border-primary/30",
    pending: "bg-muted text-muted-foreground border-border",
    partial: "bg-primary/10 text-primary border-primary/30",
    arrears: "bg-red-500/10 text-red-600 border-red-500/30",
  }
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide ${map[status] ?? map.pending}`}>
      {status}
    </span>
  )
}

function FinCard({ title, link, href, children }: Readonly<{ title: string; link?: string; href?: string; children: ReactNode }>) {
  return (
    <div className="overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-px w-4 bg-primary" />
          <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {link && href && (
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline">
            {link}<ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

// ── cash position strip ─────────────────────────────────────────────────────

function CashCell({ label, value, dot, valueTone }: Readonly<{ label: string; value: string; dot: string; valueTone?: string }>) {
  return (
    <div className="border-l border-border px-5 py-4 first:border-l-0">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="size-1.5 rounded-full" style={{ background: dot }} />{label}
      </div>
      <div className={`mt-2 text-xl font-semibold tabular-nums ${valueTone ?? "text-foreground"}`}>{value}</div>
    </div>
  )
}

function CashStrip({ data }: Readonly<{ data: FinanceHubData }>) {
  const t = data.trust
  const recon = relDays(t.last_recon_date)
  const collectedMo = t.rent_collected_undisbursed_cents + t.management_fees_pending_cents
  return (
    <div className="overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-px w-4 bg-primary" />
          <h3 className="font-heading text-sm font-semibold text-foreground">Cash position</h3>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${recon.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-primary/30 bg-primary/10 text-primary"}`}>
          <span className="size-1.5 rounded-full bg-current" />
          {recon.ok ? "Reconciled" : "Reconcile due"} · {recon.label}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5">
        <CashCell label="In trust"      value={formatZARAbbrev(t.total_in_trust_cents)}            dot="var(--positive, #1D9E75)" valueTone="text-emerald-600" />
        <CashCell label="Deposits held" value={formatZARAbbrev(t.deposits_held_cents)}             dot="#64748b" />
        <CashCell label="Owed to owners" value={formatZARAbbrev(t.rent_collected_undisbursed_cents)} dot="var(--primary, #EF9F27)" />
        <CashCell label="Fees pending"  value={formatZARAbbrev(t.management_fees_pending_cents)}    dot="var(--primary, #EF9F27)" />
        <CashCell label="Collected (mo)" value={formatZARAbbrev(collectedMo)}                       dot="var(--positive, #1D9E75)" valueTone="text-emerald-600" />
      </div>
    </div>
  )
}

// ── trust account card ──────────────────────────────────────────────────────

function TrustCard({ data, orgName }: Readonly<{ data: FinanceHubData; orgName: string }>) {
  const t = data.trust
  const recon = relDays(t.last_recon_date)
  return (
    <FinCard title="Trust account" link="Trust ledger" href="/finance/trust-ledger">
      <div className="p-5">
        <div className="flex items-center gap-3.5 rounded-[var(--r-button)] border border-emerald-500/30 border-l-[3px] border-l-emerald-500 bg-emerald-500/5 p-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--r-button)] bg-emerald-500/15 text-emerald-600">
            <Shield className="size-[18px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Sovereign trust account <Check className="size-3.5 text-emerald-600" strokeWidth={2.6} />
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{orgName} · {formatZAR(t.total_in_trust_cents)} held in trust</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${recon.ok ? "bg-emerald-500" : "bg-primary"}`} />
          <span className="font-medium text-foreground">{recon.ok ? "Reconciled & signed off" : "Reconciliation due"}</span>
          <span className="text-muted-foreground">— last bank reconciliation {recon.label}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-border">
        <div className="border-r border-border px-5 py-3.5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Deposits held</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatZAR(t.deposits_held_cents)}</div>
        </div>
        <div className="px-5 py-3.5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Rent undisbursed</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatZAR(t.rent_collected_undisbursed_cents)}</div>
        </div>
      </div>
    </FinCard>
  )
}

// ── collections card ────────────────────────────────────────────────────────

function CollectionsCard({ data, collection }: Readonly<{ data: FinanceHubData; collection: CollectionRateData | null }>) {
  const expected = collection?.totalExpected ?? 0
  const collected = collection?.totalCollected ?? 0
  const pct = collection?.collectionRate ?? 0
  const arrPct = Math.max(2, 100 - pct)
  const outstanding = data.tenantBalances.reduce((s, t) => s + t.balance_cents, 0)
  const casesOpen = data.tenantBalances.filter((t) => t.status !== "clear").length
  return (
    <FinCard title="Collections this month" link="Billing" href="/billing">
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{formatZAR(collected)}</span>
          <span className="text-sm text-muted-foreground">of {formatZAR(expected)} expected</span>
        </div>
        <div className="my-3 flex h-2.5 overflow-hidden rounded-full border border-border bg-muted">
          <span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          <span className="block h-full bg-red-500" style={{ width: `${arrPct}%` }} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-sm bg-emerald-500" />{pct}% collected</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-sm bg-red-500" />{formatZAR(outstanding)} outstanding</span>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-border">
        <div className="border-r border-border px-5 py-3.5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding arrears</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-red-600">{formatZAR(outstanding)}</div>
        </div>
        <div className="px-5 py-3.5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Cases open</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{casesOpen}</div>
        </div>
      </div>
    </FinCard>
  )
}

// ── tables ──────────────────────────────────────────────────────────────────

function Th({ children, right }: Readonly<{ children: ReactNode; right?: boolean }>) {
  return <th className={`px-5 py-2.5 font-mono text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground ${right ? "text-right" : "text-left"}`}>{children}</th>
}

function ArrearsTable({ rows }: Readonly<{ rows: TenantBalance[] }>) {
  return (
    <FinCard title="Tenant arrears" link="All arrears" href="/billing?tab=arrears">
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Everyone&apos;s up to date — no arrears.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30"><Th>Tenant</Th><Th>Unit</Th><Th right>Balance</Th><Th>Status</Th><Th right>Age</Th></tr></thead>
          <tbody>
            {rows.slice(0, 6).map((r) => (
              <tr key={r.tenant_id} className="border-b border-border/50 last:border-0">
                <td className="px-5 py-2.5 font-medium text-foreground">{r.tenant_name}</td>
                <td className="px-5 py-2.5 font-mono text-[11.5px] text-muted-foreground">{r.property_name} · {r.unit_number}</td>
                <td className="px-5 py-2.5 text-right font-medium tabular-nums text-red-600">{formatZAR(r.balance_cents)}</td>
                <td className="px-5 py-2.5"><ChipStatus status={r.status} /></td>
                <td className="px-5 py-2.5 text-right font-mono text-[10.5px] text-muted-foreground">{r.oldest_unpaid_days != null ? `${r.oldest_unpaid_days}d` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </FinCard>
  )
}

function PayoutsTable({ rows }: Readonly<{ rows: OwnerBalance[] }>) {
  const pending = rows.filter((r) => r.payout_status !== "paid").length
  return (
    <FinCard title="Owner payouts" link="Statements" href="/statements">
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No owner payouts pending this month.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30"><Th>Owner</Th><Th>Portfolio</Th><Th right>Owed</Th><Th>Payout</Th></tr></thead>
          <tbody>
            {rows.slice(0, 6).map((r) => (
              <tr key={r.landlord_id} className="border-b border-border/50 last:border-0">
                <td className="px-5 py-2.5 font-medium text-foreground">{r.owner_name}</td>
                <td className="px-5 py-2.5 font-mono text-[11.5px] text-muted-foreground">{r.property_count} {r.property_count === 1 ? "property" : "properties"}</td>
                <td className="px-5 py-2.5 text-right font-medium tabular-nums text-foreground">{formatZAR(r.owed_to_owner_cents)}</td>
                <td className="px-5 py-2.5"><ChipStatus status={r.payout_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pending > 0 && <p className="border-t border-border px-5 py-2 text-right text-xs text-muted-foreground">{pending} pending</p>}
    </FinCard>
  )
}

function UnmatchedCard({ rows }: Readonly<{ rows: UnmatchedLine[] }>) {
  return (
    <FinCard title="Unmatched transactions" link="Reconcile" href="/billing/reconciliation">
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Everything&apos;s matched — nothing to reconcile.</p>
      ) : (
        rows.slice(0, 6).map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-border/50 px-5 py-3 last:border-0">
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{formatZAR(r.amount_cents)} · {r.import_source}</p>
              <p className="truncate text-xs text-muted-foreground">{new Date(r.transaction_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} · {r.description_clean}</p>
            </div>
            <span className="font-mono text-[10.5px] text-muted-foreground">{r.age_days}d</span>
            <Link href="/billing/reconciliation" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Match<ArrowRight className="size-3" /></Link>
          </div>
        ))
      )}
    </FinCard>
  )
}

// ── owner stats-only ─────────────────────────────────────────────────────────

function OwnerStats({ data, collection }: Readonly<{ data: FinanceHubData; collection: CollectionRateData | null }>) {
  const collected = collection?.totalCollected ?? 0
  const outstanding = data.tenantBalances.reduce((s, t) => s + t.balance_cents, 0)
  const deposit = data.trust.deposits_held_cents
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
        <div className="px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Collected this month</div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-emerald-600">{formatZARAbbrev(collected)}</div>
        </div>
        <div className="border-l border-border px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</div>
          <div className={`mt-2 text-xl font-semibold tabular-nums ${outstanding > 0 ? "text-red-600" : "text-foreground"}`}>{formatZARAbbrev(outstanding)}</div>
        </div>
        <div className="border-l border-border px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Deposit held</div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-foreground">{formatZARAbbrev(deposit)}</div>
        </div>
      </div>
      <CollectionsCard data={data} collection={collection} />
      <p className="text-xs text-muted-foreground">
        Trust accounting, owner statements and reconciliation are part of Steward and up.{" "}
        <Link href="/settings/subscription" className="font-medium text-primary hover:underline">See plans →</Link>
      </p>
    </div>
  )
}

// ── root ─────────────────────────────────────────────────────────────────────

export function FinanceOverview({ data, collection, isPaid, orgName }: Readonly<{
  data: FinanceHubData
  collection: CollectionRateData | null
  isPaid: boolean
  orgName: string
}>) {
  if (!isPaid) return <OwnerStats data={data} collection={collection} />
  return (
    <div className="space-y-4">
      <CashStrip data={data} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrustCard data={data} orgName={orgName} />
        <CollectionsCard data={data} collection={collection} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ArrearsTable rows={data.tenantBalances} />
        <PayoutsTable rows={data.ownerBalances} />
      </div>
      <UnmatchedCard rows={data.unmatchedLines} />
    </div>
  )
}
