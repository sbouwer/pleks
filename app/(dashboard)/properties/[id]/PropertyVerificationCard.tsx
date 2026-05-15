/**
 * app/(dashboard)/properties/[id]/PropertyVerificationCard.tsx — Deeds + Lightstone verification card
 *
 * Route:  /properties/[id] (overview tab)
 * Auth:   gateway-protected parent; property_intelligence tier gate enforced server-side in /initiate
 * Data:   property_intelligence_pulls (via /api/property-intelligence/initiate + polling)
 * Notes:  ADDENDUM_14A. Client component. Renders latest pull state for deeds_search and
 *         lightstone_erf_short. Triggers modal → PayFast checkout or 1-click adhoc charge.
 *         Hidden entirely for owner tier (canAccessIntelligence=false).
 *         Recent-pull suppression (30-day) enforced server-side; UI shows suppression message.
 */
"use client"

import { useState, useCallback } from "react"
import { CheckCircle2, AlertTriangle, Clock, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PayFastForm } from "@/components/payfast/PayFastForm"

export interface LatestPull {
  id:                   string
  product_type:         string
  status:               string
  completed_at:         string | null
  extracted_facts_jsonb: Record<string, unknown> | null
  subject_label:        string | null
}

interface Props {
  propertyId:               string
  erfNumber:                string | null
  municipality:             string | null
  canAccessIntelligence:    boolean
  latestDeeds:              LatestPull | null
  latestLightstone:         LatestPull | null
}

type ModalState =
  | { open: false }
  | { open: true; product: "deeds_search" | "lightstone_erf_short"; step: "confirm" | "checkout" | "adhoc_wait" | "result"; pullId?: string; formData?: { url: string; data: Record<string, string> }; suppressed?: boolean; recentPullId?: string; recentPullDate?: string }

const PRODUCT_LABELS = {
  deeds_search:         "Deeds Office Search",
  lightstone_erf_short: "Lightstone Erf Valuation",
}

const PRODUCT_PRICES = {
  deeds_search:         "R30",
  lightstone_erf_short: "R155",
}

function formatDate(d: string | null): string {
  if (!d) return ""
  try { return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) }
  catch { return d }
}

function DeedsResult({ facts }: { facts: Record<string, unknown> }) {
  const rows: [string, string | null | undefined][] = [
    ["Registered owner", facts.owner_name as string],
    ["ID number",        facts.owner_id_number as string],
    ["Purchase date",    facts.purchase_date ? formatDate(facts.purchase_date as string) : null],
    ["Deed number",      facts.deed_number as string],
  ]
  return (
    <div className="space-y-1.5 text-sm">
      {rows.map(([label, value]) => value ? (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-muted-foreground text-xs">{label}</span>
          <span className="text-xs font-medium text-right">{value}</span>
        </div>
      ) : null)}
    </div>
  )
}

function LightstoneResult({ facts }: { facts: Record<string, unknown> }) {
  const fmt = (c: number | null) => c != null ? `R ${(c / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}` : "—"
  const rows: [string, string | null | undefined][] = [
    ["Estimated value",  fmt(facts.estimated_value_cents as number)],
    ["Range",           `${fmt(facts.value_low_cents as number)} – ${fmt(facts.value_high_cents as number)}`],
    ["Confidence",      facts.confidence as string],
    ["Last sale",       facts.last_sale_date ? formatDate(facts.last_sale_date as string) : null],
  ]
  return (
    <div className="space-y-1.5 text-sm">
      {rows.map(([label, value]) => value ? (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-muted-foreground text-xs">{label}</span>
          <span className="text-xs font-medium text-right">{value}</span>
        </div>
      ) : null)}
    </div>
  )
}

function PullRow({
  label,
  price,
  pull,
  onVerify,
  onReVerify,
  canAccessIntelligence,
}: {
  label:                 string
  price:                 string
  pull:                  LatestPull | null
  onVerify:              () => void
  onReVerify:            () => void
  canAccessIntelligence: boolean
}) {
  const isComplete   = pull?.status === "complete"
  const isNoData     = pull?.status === "no_data_found"
  const isFailed     = pull?.status === "failed"
  const isInProgress = pull?.status === "running" || pull?.status === "pending"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isComplete  && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
          {isNoData    && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
          {isFailed    && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
          {isInProgress && <Clock className="h-4 w-4 text-muted-foreground shrink-0 animate-pulse" />}
          {!pull       && <div className="h-4 w-4 rounded-full border-2 border-muted shrink-0" />}
          <span className="text-sm font-medium">{label}</span>
        </div>
        {canAccessIntelligence && !isInProgress && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={isComplete || isNoData ? onReVerify : onVerify}
          >
            {isComplete || isNoData
              ? <><RefreshCw className="h-3 w-3 mr-1" />Re-verify {price}</>
              : `Verify — ${price}`}
          </Button>
        )}
        {!canAccessIntelligence && (
          <span className="text-xs text-muted-foreground">Steward+</span>
        )}
      </div>

      {isComplete && pull.extracted_facts_jsonb && (
        <div className="ml-6 pl-3 border-l border-border/40">
          {pull.product_type === "deeds_search"
            ? <DeedsResult facts={pull.extracted_facts_jsonb} />
            : <LightstoneResult facts={pull.extracted_facts_jsonb} />}
          <p className="text-xs text-muted-foreground mt-1.5">
            Verified {formatDate(pull.completed_at)} · <a href={`/intelligence`} className="underline underline-offset-2">View report</a>
          </p>
        </div>
      )}
      {isNoData && (
        <p className="ml-6 text-xs text-muted-foreground">No record found — check erf number and try again</p>
      )}
      {isFailed && (
        <p className="ml-6 text-xs text-red-500">Verification failed — your card was refunded</p>
      )}
      {isInProgress && (
        <p className="ml-6 text-xs text-muted-foreground">Verification in progress…</p>
      )}
      {!pull && (
        <p className="ml-6 text-xs text-muted-foreground">Not yet verified</p>
      )}
    </div>
  )
}

export function PropertyVerificationCard({
  propertyId,
  erfNumber,
  municipality,
  canAccessIntelligence,
  latestDeeds: initialDeeds,
  latestLightstone: initialLightstone,
}: Props) {
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [loading, setLoading] = useState(false)
  const [latestDeeds, setLatestDeeds]           = useState(initialDeeds)
  const [latestLightstone, setLatestLightstone] = useState(initialLightstone)

  // Build subjectIdentifier for property products: "ERF|MUNICIPALITY"
  const deedsIdentifier      = erfNumber && municipality ? `${erfNumber}|${municipality}` : null
  const lightstoneIdentifier = deedsIdentifier

  const pollForResult = useCallback(async (pullId: string, product: "deeds_search" | "lightstone_erf_short") => {
    const MAX_POLLS = 30
    let polls = 0
    const interval = setInterval(async () => {
      polls++
      if (polls > MAX_POLLS) {
        clearInterval(interval)
        return
      }
      try {
        const res  = await fetch(`/api/property-intelligence/status/${pullId}`)
        const json = await res.json() as { status?: string; pull?: LatestPull }
        if (json.status === "complete" || json.status === "no_data_found" || json.status === "failed") {
          clearInterval(interval)
          if (json.pull) {
            if (product === "deeds_search")        setLatestDeeds(json.pull)
            else                                   setLatestLightstone(json.pull)
          }
          setModal({ open: false })
        }
      } catch { /* network blip — keep polling */ }
    }, 3000)
  }, [])

  const handleVerify = useCallback(async (
    product: "deeds_search" | "lightstone_erf_short",
    forceRun = false,
  ) => {
    const identifier = product === "deeds_search" ? deedsIdentifier : lightstoneIdentifier
    if (!identifier) return

    setLoading(true)
    try {
      const res = await fetch("/api/property-intelligence/initiate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          productType:       product,
          subjectIdentifier: identifier,
          subjectLabel:      erfNumber ?? identifier,
          propertyId,
          forceRun,
        }),
      })
      const json = await res.json() as {
        mode?: "checkout" | "adhoc"
        pullId?: string
        url?: string
        data?: Record<string, string>
        suppressed?: boolean
        recentPullId?: string
        recentPullDate?: string
      }

      if (json.suppressed) {
        setModal({ open: true, product, step: "confirm", suppressed: true, recentPullId: json.recentPullId, recentPullDate: json.recentPullDate })
        return
      }

      if (json.mode === "checkout" && json.url && json.data) {
        setModal({ open: true, product, step: "checkout", pullId: json.pullId, formData: { url: json.url, data: json.data } })
      } else if (json.mode === "adhoc" && json.pullId) {
        setModal({ open: true, product, step: "adhoc_wait", pullId: json.pullId })
        pollForResult(json.pullId, product)
      }
    } finally {
      setLoading(false)
    }
  }, [deedsIdentifier, lightstoneIdentifier, erfNumber, propertyId, pollForResult])


  if (!canAccessIntelligence) {
    // Still render but with upgrade prompt — hidden for owner tier per spec
    // spec says "Card is hidden entirely for Owner free tier"
    return null
  }

  if (!erfNumber) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Property verification</span>
        </div>
        <div className="px-4 py-4">
          <p className="text-xs text-muted-foreground">Add an erf number to enable Deeds Office and Lightstone verification.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Property verification</span>
        </div>
        <div className="px-4 py-4 space-y-4">
          <PullRow
            label="Owner verification"
            price="R30"
            pull={latestDeeds}
            canAccessIntelligence={canAccessIntelligence}
            onVerify={() => handleVerify("deeds_search")}
            onReVerify={() => handleVerify("deeds_search", true)}
          />
          <div className="border-t border-border/40 pt-4">
            <PullRow
              label="Property valuation"
              price="R155"
              pull={latestLightstone}
              canAccessIntelligence={canAccessIntelligence}
              onVerify={() => handleVerify("lightstone_erf_short")}
              onReVerify={() => handleVerify("lightstone_erf_short", true)}
            />
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl border shadow-lg w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="font-semibold">{PRODUCT_LABELS[modal.product]}</h3>

            {modal.step === "confirm" && modal.suppressed && (
              <>
                <p className="text-sm text-muted-foreground">
                  A verification was completed {modal.recentPullDate ? formatDate(modal.recentPullDate) : "recently"}.
                  Results are valid for 30 days.
                </p>
                <p className="text-sm">Force a new verification?</p>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setModal({ open: false })}>Cancel</Button>
                  <Button
                    disabled={loading}
                    onClick={() => handleVerify(modal.product, true)}
                  >
                    Re-verify — {PRODUCT_PRICES[modal.product]}
                  </Button>
                </div>
              </>
            )}

            {modal.step === "checkout" && modal.formData && (
              <>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Property</span>
                    <span className="font-medium">{erfNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost</span>
                    <span className="font-medium">{PRODUCT_PRICES[modal.product]} incl. VAT</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  You will be redirected to PayFast to complete payment. Results appear within ~30 seconds of payment confirmation.
                </p>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setModal({ open: false })}>Cancel</Button>
                  <PayFastForm
                    url={modal.formData.url}
                    data={modal.formData.data}
                    label={`Pay ${PRODUCT_PRICES[modal.product]} →`}
                  />
                </div>
              </>
            )}

            {modal.step === "adhoc_wait" && (
              <>
                <p className="text-sm text-muted-foreground">Charging saved card and contacting Searchworx…</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 animate-pulse" />
                  <span>~20–30 seconds</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setModal({ open: false })}>
                  Run in background
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
