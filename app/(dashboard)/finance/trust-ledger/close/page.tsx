"use client"

/**
 * app/(dashboard)/finance/trust-ledger/close/page.tsx — Trust period close workflow
 *
 * Route:  /finance/trust-ledger/close?sessionId=<bank_recon_sessions.id>
 * Auth:   dashboard layout guard; trust_account_write step-up at submit
 * Data:   bank_recon_sessions, bank_accounts, trust_transactions via Supabase client
 * Notes:  Three-balance comparison per D-TRUST-04. Variance must be acknowledged
 *         before sign-off (D-TRUST-06). Immutability enforced at DB trigger level.
 */

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { formatZAR } from "@/lib/constants"
import { ActionButton, InlineLink } from "@/components/ui/actions"
import { closeTrustPeriod, type OutstandingItem } from "@/lib/trust/close"
import { AlertTriangle, CheckCircle2, Plus, X } from "lucide-react"
import { SovereignBadge, type SovereignBadgeProps } from "@/components/trust/SovereignBadge"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtZA } from "@/lib/dates"

const ITEM_TYPES: { value: OutstandingItem["item_type"]; label: string }[] = [
  { value: "deposit_in_transit", label: "Deposit in transit" },
  { value: "pending_clearing",   label: "Pending clearing" },
  { value: "uncleared_eft",      label: "Uncleared EFT" },
  { value: "other",              label: "Other" },
]

function centsFromZAR(value: string): number {
  const n = Number.parseFloat(value.replaceAll(/[^0-9.-]/g, ""))
  return Number.isNaN(n) ? 0 : Math.round(n * 100)
}

function formatPeriod(start: string) {
  return fmtZA(start, { month: "long", year: "numeric" })
}

function maskAccount(num: string | null | undefined) {
  if (!num || num.length < 4) return num ?? "—"
  return "****" + num.slice(-4)
}

type SessionData = {
  id: string
  bank_account_id: string
  period_start: string
  period_end: string
  status: string
  unmatched_lines: number
}
type BankAccountData = { bank_name: string; account_number: string | null }
type SupabaseClient = ReturnType<typeof createClient>

async function fetchBadgeProps(
  db: SupabaseClient,
  orgId: string,
  ba: { bank_name: string; account_number: string | null } | null,
): Promise<Extract<SovereignBadgeProps, { variant: "agent" }> | null> {
  if (!ba) return null
  const { data: org, error: orgError } = await db.from("organisations").select("name, trading_as, ppra_ffc_number").eq("id", orgId).single()
    logQueryError("fetchBadgeProps organisations", orgError)
  if (!org) return null
  return {
    variant: "agent",
    bankName: ba.bank_name,
    bankAccountLast4: ba.account_number ? ba.account_number.slice(-4) : "",
    agencyName: (org.trading_as as string | null)?.trim() || (org.name as string),
    ffcNumber: (org.ppra_ffc_number as string | null) ?? null,
  }
}

function TrustCloseContent() {
  const { orgId } = useOrg()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") ?? ""

  const [session, setSession] = useState<SessionData | null>(null)
  const [bankAcct, setBankAcct] = useState<BankAccountData | null>(null)
  const [badgeProps, setBadgeProps] = useState<Extract<SovereignBadgeProps, { variant: "agent" }> | null>(null)
  const [ledgerCents, setLedgerCents] = useState(0)
  const [loading, setLoading] = useState(true)
  const [bankBalanceInput, setBankBalanceInput] = useState("")
  const [items, setItems] = useState<OutstandingItem[]>([])
  const [addingItem, setAddingItem] = useState(false)
  const [newItem, setNewItem] = useState<Partial<OutstandingItem>>({ item_type: "deposit_in_transit" })
  const [notes, setNotes] = useState("")
  const [varianceAcknowledged, setVarianceAcknowledged] = useState(false)
  const [varianceNotes, setVarianceNotes] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orgId || !sessionId) return
    setLoading(true)
    const db = createClient()

    const [sessRes, txnRes] = await Promise.all([
      db.from("bank_recon_sessions")
        .select("id, bank_account_id, period_start, period_end, status, unmatched_lines")
        .eq("id", sessionId)
        .eq("org_id", orgId)
        .single(),
      db.from("trust_transactions")
        .select("direction, amount_cents, statement_month")
        .eq("org_id", orgId),
    ])

    if (sessRes.error) { console.error("session:", sessRes.error.message); setLoading(false); return }
    const sess = sessRes.data as SessionData
    setSession(sess)

    // Fetch bank account info separately to avoid join type complexity
    const { data: ba, error: baError } = await db
      .from("bank_accounts")
      .select("bank_name, account_number")
      .eq("id", sess.bank_account_id)
      .single()
    logQueryError("load bank_accounts", baError)
    const baTyped = ba ? { bank_name: ba.bank_name as string, account_number: ba.account_number as string | null } : null
    if (baTyped) setBankAcct(baTyped)
    const badge = await fetchBadgeProps(db, orgId, baTyped)
    if (badge) setBadgeProps(badge)

    const periodStart = new Date(sess.period_start)
    const periodEnd = new Date(sess.period_end)
    let ledger = 0
    for (const t of txnRes.data ?? []) {
      if (!t.statement_month) continue
      const d = new Date(t.statement_month)
      if (d >= periodStart && d <= periodEnd) {
        ledger += t.direction === "credit" ? t.amount_cents : -t.amount_cents
      }
    }
    setLedgerCents(ledger)
    setLoading(false)
  }, [orgId, sessionId])

  useEffect(() => { void load() }, [load])

  const bankCents     = useMemo(() => centsFromZAR(bankBalanceInput), [bankBalanceInput])
  const outstandingSum = useMemo(() => items.reduce((s, i) => s + i.amount_cents, 0), [items])
  const reconCents    = useMemo(() => bankCents + outstandingSum, [bankCents, outstandingSum])
  const varianceCents = useMemo(() => reconCents - ledgerCents, [reconCents, ledgerCents])
  const hasVariance   = varianceCents !== 0

  function addItem() {
    if (!newItem.description || !newItem.amount_cents || !newItem.expected_clear_date || !newItem.item_type) return
    const complete: OutstandingItem = {
      description:         newItem.description,
      amount_cents:        newItem.amount_cents,
      expected_clear_date: newItem.expected_clear_date,
      item_type:           newItem.item_type,
    }
    setItems(prev => [...prev, complete])
    setNewItem({ item_type: "deposit_in_transit" })
    setAddingItem(false)
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, j) => j !== index))
  }

  async function handleSignOff() {
    if (!session || !orgId) return
    if (hasVariance && !varianceAcknowledged) return
    if (hasVariance && !varianceNotes.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const noteParts = [notes, varianceNotes ? `Variance explanation:\n${varianceNotes}` : ""].filter(Boolean)
      const result = await closeTrustPeriod({
        bankAccountId:             session.bank_account_id,
        periodStart:               session.period_start,
        periodEnd:                 session.period_end,
        bankClosingBalanceCents:   bankCents,
        ledgerClosingBalanceCents: ledgerCents,
        reconComputedClosingCents: reconCents,
        varianceCents,
        varianceAcknowledged,
        outstandingItems:          items,
        signedOffNotes:            noteParts.join("\n\n") || null,
        bankReconSessionId:        session.id,
        stepUpToken:               null,
      })

      if (!result.ok) {
        setError("stepUpChallenge" in result
          ? "Step-up authentication required. Please verify your identity."
          : result.error)
        return
      }
      router.push(`/finance/trust-ledger/audit/${result.periodId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error")
    } finally {
      setSubmitting(false)
    }
  }

  if (!sessionId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-muted-foreground">
        No reconciliation session specified. <InlineLink href="/finance/trust-ledger">Back to ledger</InlineLink>
      </div>
    )
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto py-12 text-center text-muted-foreground text-sm">Loading…</div>
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-muted-foreground">
        Reconciliation session not found. <InlineLink href="/finance/trust-ledger">Back to ledger</InlineLink>
      </div>
    )
  }

  if (session.status === "signed_off") {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
        <p className="font-medium">This period is already signed off.</p>
        <div className="mt-4"><InlineLink href="/finance/trust-ledger">Back to ledger</InlineLink></div>
      </div>
    )
  }

  const periodLabel = formatPeriod(session.period_start)
  const varianceLabel = varianceCents > 0
    ? `+${formatZAR(varianceCents)}`
    : `–${formatZAR(Math.abs(varianceCents))}`

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <div className="mb-2"><InlineLink href="/finance/trust-ledger">← Trust Account Ledger</InlineLink></div>
        <h1 className="font-heading text-2xl">Close trust reconciliation — {periodLabel}</h1>
        {bankAcct && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {bankAcct.bank_name} {maskAccount(bankAcct.account_number)}
          </p>
        )}
        {session.unmatched_lines > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {session.unmatched_lines} unmatched {session.unmatched_lines === 1 ? "line" : "lines"} remain. Complete reconciliation before closing.
            </span>
          </div>
        )}
      </div>

      {/* Sovereign trust badge */}
      {badgeProps && <SovereignBadge {...badgeProps} />}

      {/* Three-balance card */}
      <div className="rounded-xl border bg-card divide-y">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Bank statement closing balance</p>
              <p className="text-xs text-muted-foreground mt-0.5">From your {bankAcct?.bank_name ?? "bank"} statement for {periodLabel}</p>
            </div>
            <input
              type="text"
              placeholder="R 0.00"
              value={bankBalanceInput}
              onChange={e => setBankBalanceInput(e.target.value)}
              className="w-40 text-right font-mono text-sm rounded-md border px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Pleks trust ledger closing balance</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sum of all trust transactions for {periodLabel}</p>
            </div>
            <span className="font-mono text-sm font-medium tabular-nums">{formatZAR(Math.abs(ledgerCents))}</span>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Pleks recon-computed closing</p>
              <p className="text-xs text-muted-foreground mt-0.5">Bank closing + outstanding items below</p>
            </div>
            <span className="font-mono text-sm font-medium tabular-nums">{formatZAR(Math.abs(reconCents))}</span>
          </div>
        </div>

        <div className="px-5 py-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Variance</span>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-sm font-semibold tabular-nums ${hasVariance ? "text-amber-600" : "text-emerald-600"}`}>
                {hasVariance ? varianceLabel : formatZAR(0)}
              </span>
              {hasVariance
                ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            </div>
          </div>
        </div>
      </div>

      {/* Variance acknowledgement */}
      {hasVariance && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-3">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Variance exists between recon-computed and Pleks ledger.</p>
              <p className="text-xs mt-1 text-amber-700">Possible causes: unrecorded bank charge, duplicate transaction, or timing difference not captured as an outstanding item.</p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={varianceAcknowledged}
              onChange={e => setVarianceAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span>I have investigated the variance and acknowledge it</span>
          </label>
          {varianceAcknowledged && (
            <textarea
              value={varianceNotes}
              onChange={e => setVarianceNotes(e.target.value)}
              placeholder="Explain the variance (required)…"
              rows={3}
              className="w-full text-sm rounded-md border px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          )}
        </div>
      )}

      {/* Outstanding items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Outstanding items at month-end ({items.length})</h2>
          <button
            onClick={() => setAddingItem(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        </div>

        {items.length > 0 && (
          <div className="rounded-xl border bg-card divide-y">
            {items.map((item, i) => (
              <div key={`${item.description}-${item.expected_clear_date}`} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {ITEM_TYPES.find(t => t.value === item.item_type)?.label} · {formatZAR(item.amount_cents)} · expected {item.expected_clear_date}
                  </p>
                </div>
                <button
                  onClick={() => removeItem(i)}
                  className="text-muted-foreground hover:text-red-500 transition-colors ml-4"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {addingItem && (
          <div className="rounded-xl border bg-card px-4 py-4 space-y-3">
            <p className="text-sm font-medium">New outstanding item</p>
            <input
              type="text"
              placeholder="Description"
              value={newItem.description ?? ""}
              onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
              className="w-full text-sm rounded-md border px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Amount (R)"
                value={newItem.amount_cents ? (newItem.amount_cents / 100).toFixed(2) : ""}
                onChange={e => setNewItem(p => ({ ...p, amount_cents: centsFromZAR(e.target.value) }))}
                className="flex-1 text-sm rounded-md border px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="date"
                value={newItem.expected_clear_date ?? ""}
                onChange={e => setNewItem(p => ({ ...p, expected_clear_date: e.target.value }))}
                className="flex-1 text-sm rounded-md border px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select
              value={newItem.item_type}
              onChange={e => setNewItem(p => ({ ...p, item_type: e.target.value as OutstandingItem["item_type"] }))}
              className="w-full text-sm rounded-md border px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <ActionButton tone="secondary" onClick={() => { setAddingItem(false); setNewItem({ item_type: "deposit_in_transit" }) }}>Cancel</ActionButton>
              <ActionButton onClick={addItem} disabled={!newItem.description || !newItem.amount_cents || !newItem.expected_clear_date}>Add</ActionButton>
            </div>
          </div>
        )}
      </div>

      {/* Sign-off notes */}
      <div className="space-y-2">
        <label htmlFor="signoff-notes" className="text-sm font-medium">Sign-off notes (optional)</label>
        <textarea
          id="signoff-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Any notes for the record…"
          className="w-full text-sm rounded-md border px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Actions */}
      {confirming ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-4">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              <strong>This will permanently lock all trust transactions for {periodLabel}.</strong>{" "}
              You will not be able to edit or delete any entry after this action. Any corrections must be made as new entries in the current open period.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <ActionButton tone="secondary" onClick={() => setConfirming(false)} disabled={submitting}>Cancel</ActionButton>
            <ActionButton onClick={handleSignOff} disabled={submitting}>
              {submitting ? "Signing off…" : "Confirm sign-off"}
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-3">
          <InlineLink href="/finance/trust-ledger">Cancel</InlineLink>
          <ActionButton
            disabled={
              !bankBalanceInput ||
              session.unmatched_lines > 0 ||
              (hasVariance && (!varianceAcknowledged || !varianceNotes.trim()))
            }
            onClick={() => setConfirming(true)}
          >
            Sign off and close
          </ActionButton>
        </div>
      )}
    </div>
  )
}

export default function TrustClosePage() {
  return (
    <Suspense>
      <TrustCloseContent />
    </Suspense>
  )
}
