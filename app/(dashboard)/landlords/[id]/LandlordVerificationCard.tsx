/**
 * app/(dashboard)/landlords/[id]/LandlordVerificationCard.tsx — CIPC + Deeds verification card
 *
 * Auth:   gateway-protected parent; property_intelligence tier gate enforced server-side
 * Data:   property_intelligence_pulls (via /api/property-intelligence/initiate + polling)
 * Notes:  ADDENDUM_14A. Client component. Two render branches keyed on entity_type:
 *         - "organisation" (juristic): cipc_company pull with verify/re-verify button; mismatch flag
 *         - natural person: read-only linked deeds pulls from property verifications; mismatch flag
 *         Hidden entirely when canAccessIntelligence=false.
 */
"use client"

import { useState, useCallback } from "react"
import { CheckCircle2, AlertTriangle, Clock, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PayFastForm } from "@/components/payfast/PayFastForm"
import { cn } from "@/lib/utils"
import type { LatestPull } from "../../properties/[id]/PropertyVerificationCard"

export type { LatestPull }

export interface LinkedDeedsPull {
  propertyId:   string
  propertyName: string
  status:       string
  completedAt:  string | null
  ownerName:    string | null
}

interface Props {
  landlordContactId:     string
  entityType:            string | null
  registrationNumber:    string | null
  companyName:           string | null
  landlordDisplayName:   string
  canAccessIntelligence: boolean
  latestCipcCompany:     LatestPull | null
  linkedDeedsPulls:      LinkedDeedsPull[]
}

type ModalState =
  | { open: false }
  | {
      open:           true
      step:           "confirm" | "checkout" | "adhoc_wait"
      pullId?:        string
      formData?:      { url: string; data: Record<string, string> }
      suppressed?:    boolean
      recentPullDate?: string
    }

const PRODUCT_LABEL = "CIPC Company Verification"
const PRODUCT_PRICE = "R25"

function formatDate(d: string | null): string {
  if (!d) return ""
  try {
    return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return d
  }
}

function CipcCompanyResult({
  facts,
  companyName,
}: Readonly<{
  facts:       Record<string, unknown>
  companyName: string | null
}>) {
  const registeredName = facts.registered_name as string | undefined
  const mismatch =
    companyName &&
    registeredName &&
    registeredName.toLowerCase().trim() !== companyName.toLowerCase().trim()

  return (
    <div className="space-y-1.5 text-sm">
      {(
        [
          ["Registered name",     registeredName],
          ["Registration number", facts.registration_number as string | undefined],
          ["Status",              facts.status as string | undefined],
          ["Status date",         facts.status_date ? formatDate(facts.status_date as string) : undefined],
          ["Registered address",  facts.registered_address as string | undefined],
          ["Business start",      facts.business_start_date ? formatDate(facts.business_start_date as string) : undefined],
        ] as [string, string | undefined][]
      ).map(([label, value]) =>
        value ? (
          <div key={label} className="flex justify-between gap-3">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="text-xs font-medium text-right">{value}</span>
          </div>
        ) : null,
      )}
      {mismatch && (
        <div className="flex items-center gap-1.5 pt-1">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-600">
            Registered name differs from landlord record — confirm with client
          </span>
        </div>
      )}
    </div>
  )
}

function DeedsOwnershipList({
  pulls,
  landlordDisplayName,
}: Readonly<{
  pulls:               LinkedDeedsPull[]
  landlordDisplayName: string
}>) {
  if (pulls.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No deeds verifications linked. Run a Deeds Office search from each property&apos;s overview tab.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {pulls.map((pull) => {
        const isComplete  = pull.status === "complete"
        const isNoData    = pull.status === "no_data_found"
        const isFailed    = pull.status === "failed"
        const isPending   = pull.status === "running" || pull.status === "pending"
        const mismatch =
          isComplete &&
          pull.ownerName &&
          pull.ownerName.toLowerCase().trim() !== landlordDisplayName.toLowerCase().trim()

        return (
          <div key={pull.propertyId} className="flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
            <div className="mt-0.5 shrink-0">
              {isComplete  && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {isNoData    && <AlertTriangle className="h-4 w-4 text-amber-500" />}
              {isFailed    && <AlertTriangle className="h-4 w-4 text-red-500" />}
              {isPending   && <Clock className="h-4 w-4 text-muted-foreground animate-pulse" />}
              {!pull.status && <div className="h-4 w-4 rounded-full border-2 border-muted" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{pull.propertyName}</p>
              {isComplete && pull.ownerName && (
                <p className={cn("text-xs", mismatch ? "text-amber-600" : "text-muted-foreground")}>
                  {mismatch && <AlertTriangle className="inline h-3 w-3 mr-1 shrink-0" />}
                  {pull.ownerName}
                  {mismatch && " — name mismatch"}
                </p>
              )}
              {isNoData && <p className="text-xs text-muted-foreground">No record found</p>}
              {isFailed && <p className="text-xs text-red-500">Verification failed</p>}
            </div>
            {isComplete && pull.completedAt && (
              <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                {formatDate(pull.completedAt)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function LandlordVerificationCard({
  landlordContactId,
  entityType,
  registrationNumber,
  companyName,
  landlordDisplayName,
  canAccessIntelligence,
  latestCipcCompany: initialCipcCompany,
  linkedDeedsPulls,
}: Readonly<Props>) {
  const [modal,           setModal]          = useState<ModalState>({ open: false })
  const [loading,         setLoading]        = useState(false)
  const [latestCipcCompany, setLatestCipcCompany] = useState(initialCipcCompany)

  const isJuristic = entityType === "organisation"

  const pollForResult = useCallback((pullId: string) => {
    const MAX_POLLS = 30
    let polls = 0
    const interval = setInterval(async () => {
      polls++
      if (polls > MAX_POLLS) { clearInterval(interval); return }
      try {
        const res  = await fetch(`/api/property-intelligence/status/${pullId}`)
        const json = await res.json() as { status?: string; pull?: LatestPull }
        if (json.status === "complete" || json.status === "no_data_found" || json.status === "failed") {
          clearInterval(interval)
          if (json.pull) setLatestCipcCompany(json.pull)
          setModal({ open: false })
        }
      } catch { /* network blip — keep polling */ }
    }, 3000)
  }, [])

  const handleVerify = useCallback(async (forceRun = false) => {
    if (!registrationNumber) return
    setLoading(true)
    try {
      const res = await fetch("/api/property-intelligence/initiate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          productType:       "cipc_company",
          subjectIdentifier: registrationNumber,
          subjectLabel:      companyName ?? registrationNumber,
          landlordId:        landlordContactId,
          forceRun,
        }),
      })
      const json = await res.json() as {
        mode?:          "checkout" | "adhoc"
        pullId?:        string
        url?:           string
        data?:          Record<string, string>
        suppressed?:    boolean
        recentPullDate?: string
      }

      if (json.suppressed) {
        setModal({ open: true, step: "confirm", suppressed: true, recentPullDate: json.recentPullDate })
        return
      }

      if (json.mode === "checkout" && json.url && json.data) {
        setModal({ open: true, step: "checkout", pullId: json.pullId, formData: { url: json.url, data: json.data } })
      } else if (json.mode === "adhoc" && json.pullId) {
        setModal({ open: true, step: "adhoc_wait", pullId: json.pullId })
        pollForResult(json.pullId)
      }
    } finally {
      setLoading(false)
    }
  }, [registrationNumber, companyName, landlordContactId, pollForResult])

  if (!canAccessIntelligence) return null

  const isComplete   = latestCipcCompany?.status === "complete"
  const isNoData     = latestCipcCompany?.status === "no_data_found"
  const isFailed     = latestCipcCompany?.status === "failed"
  const isInProgress = latestCipcCompany?.status === "running" || latestCipcCompany?.status === "pending"
  const forceReVerify = isComplete || isNoData

  // Extracted to avoid nested ternary inside the JSX branch
  const juristicContent = registrationNumber ? (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isComplete   && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
          {isNoData     && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
          {isFailed     && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
          {isInProgress && <Clock className="h-4 w-4 text-muted-foreground shrink-0 animate-pulse" />}
          {!latestCipcCompany && <div className="h-4 w-4 rounded-full border-2 border-muted shrink-0" />}
          <span className="text-sm font-medium">CIPC status</span>
        </div>
        {!isInProgress && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={loading}
            onClick={() => handleVerify(forceReVerify)}
          >
            {forceReVerify
              ? <><RefreshCw className="h-3 w-3 mr-1" />Re-verify {PRODUCT_PRICE}</>
              : `Verify — ${PRODUCT_PRICE}`}
          </Button>
        )}
      </div>

      {isComplete && latestCipcCompany.extracted_facts_jsonb && (
        <div className="ml-6 pl-3 border-l border-border/40">
          <CipcCompanyResult
            facts={latestCipcCompany.extracted_facts_jsonb}
            companyName={companyName}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Verified {formatDate(latestCipcCompany.completed_at)} ·{" "}
            <a href="/intelligence" className="underline underline-offset-2">View report</a>
          </p>
        </div>
      )}
      {isNoData && (
        <p className="ml-6 text-xs text-muted-foreground">
          No CIPC record found — check registration number and try again
        </p>
      )}
      {isFailed && (
        <p className="ml-6 text-xs text-red-500">Verification failed — your card was refunded</p>
      )}
      {isInProgress && (
        <p className="ml-6 text-xs text-muted-foreground">Verification in progress…</p>
      )}
      {!latestCipcCompany && (
        <p className="ml-6 text-xs text-muted-foreground">Not yet verified</p>
      )}
    </div>
  ) : (
    <p className="text-xs text-muted-foreground">
      Add a registration number to enable CIPC verification.
    </p>
  )

  return (
    <>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {isJuristic ? "Company verification" : "Property ownership"}
          </span>
        </div>
        <div className="px-4 py-4">
          {isJuristic ? juristicContent : (
            <DeedsOwnershipList
              pulls={linkedDeedsPulls}
              landlordDisplayName={landlordDisplayName}
            />
          )}
        </div>
      </div>

      {/* ── Modal ─────────────────────────────────────────────────────── */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl border shadow-lg w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="font-semibold">{PRODUCT_LABEL}</h3>

            {modal.step === "confirm" && modal.suppressed && (
              <>
                <p className="text-sm text-muted-foreground">
                  A verification was completed {modal.recentPullDate ? formatDate(modal.recentPullDate) : "recently"}.
                  Results are valid for 30 days.
                </p>
                <p className="text-sm">Force a new verification?</p>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setModal({ open: false })}>Cancel</Button>
                  <Button disabled={loading} onClick={() => handleVerify(true)}>
                    Re-verify — {PRODUCT_PRICE}
                  </Button>
                </div>
              </>
            )}

            {modal.step === "checkout" && modal.formData && (
              <>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Company</span>
                    <span className="font-medium">{companyName ?? registrationNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost</span>
                    <span className="font-medium">{PRODUCT_PRICE} incl. VAT</span>
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
                    label={`Pay ${PRODUCT_PRICE} →`}
                  />
                </div>
              </>
            )}

            {modal.step === "adhoc_wait" && (
              <>
                <p className="text-sm text-muted-foreground">Charging saved card and contacting CIPC via Searchworx…</p>
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
