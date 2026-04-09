"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { describeRate } from "@/lib/deposits/interestConfig"
import type { DepositInterestConfig as Config } from "@/lib/deposits/interestConfig"
import { ChevronDown, ChevronUp } from "lucide-react"

interface Props {
  propertyId?: string | null
  unitId?: string | null
  /** Optional: current prime rate to show effective rate preview */
  currentPrime?: number | null
  title?: string
}

const RATE_TYPE_LABELS: Record<string, string> = {
  fixed: "Fixed rate",
  prime_linked: "Prime-linked",
  repo_linked: "Repo-linked",
  manual: "Manual (enter per period)",
}

const COMPOUNDING_LABELS: Record<string, string> = {
  monthly: "Monthly",
  daily: "Daily",
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

export function DepositInterestConfig({ propertyId = null, unitId = null, currentPrime, title }: Props) {
  const [configs, setConfigs] = useState<Config[]>([])
  const [active, setActive] = useState<Config | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Form state
  const [rateType, setRateType] = useState<Config["rate_type"]>("fixed")
  const [fixedRate, setFixedRate] = useState("")
  const [primeOffset, setPrimeOffset] = useState("")
  const [repoOffset, setRepoOffset] = useState("")
  const [compounding, setCompounding] = useState<"daily" | "monthly">("monthly")
  const [bankName, setBankName] = useState("")
  const [accountRef, setAccountRef] = useState("")
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0])
  const [changeReason, setChangeReason] = useState("")

  function buildParams() {
    const p = new URLSearchParams()
    if (unitId) p.set("unitId", unitId)
    else if (propertyId) p.set("propertyId", propertyId)
    return p.toString()
  }

  function loadConfigs() {
    const qs = buildParams()
    fetch(`/api/deposit-interest-config?${qs}&includeHistory=true`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Config[]) => {
        setConfigs(data)
        setActive(data.find((c) => !c.effective_to) ?? null)
      })
  }

  useEffect(() => { loadConfigs() }, [propertyId, unitId]) // eslint-disable-line react-hooks/exhaustive-deps

  function openForm() {
    if (active) {
      setRateType(active.rate_type)
      setFixedRate(active.fixed_rate_percent?.toString() ?? "")
      setPrimeOffset(active.prime_offset_percent?.toString() ?? "")
      setRepoOffset(active.repo_offset_percent?.toString() ?? "")
      setCompounding(active.compounding)
      setBankName(active.bank_name ?? "")
      setAccountRef(active.account_reference ?? "")
    }
    setEffectiveFrom(new Date().toISOString().split("T")[0])
    setChangeReason("")
    setShowForm(true)
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          propertyId,
          unitId,
          rateType,
          compounding,
          bankName: bankName || null,
          accountReference: accountRef || null,
          effectiveFrom,
          changeReason: changeReason || null,
        }
        if (rateType === "fixed") body.fixedRatePercent = Number.parseFloat(fixedRate) || null
        if (rateType === "prime_linked") body.primeOffsetPercent = Number.parseFloat(primeOffset) || null
        if (rateType === "repo_linked") body.repoOffsetPercent = Number.parseFloat(repoOffset) || null

        const res = await fetch("/api/deposit-interest-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error((data as { error?: string }).error ?? "Failed to save config")
          return
        }
        toast.success("Deposit interest config saved")
        setShowForm(false)
        loadConfigs()
      } catch {
        toast.error("Failed to save config")
      }
    })
  }

  const heading = title ?? (unitId ? "Deposit interest — Unit" : propertyId ? "Deposit interest — Property" : "Deposit interest — Organisation default")

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{heading}</CardTitle>
            {active ? (
              <p className="text-sm text-muted-foreground mt-0.5">
                {describeRate(active, currentPrime)} · {COMPOUNDING_LABELS[active.compounding]} compounding
                {active.bank_name && ` · ${active.bank_name}`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-0.5">No config — interest will not be auto-accrued</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={showForm ? () => setShowForm(false) : openForm}>
            {showForm ? "Cancel" : active ? "Update rate" : "Set up"}
          </Button>
        </div>
      </CardHeader>

      {showForm && (
        <CardContent className="border-t border-border pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Rate mode</label>
              <select
                className="h-8 text-sm border border-border rounded-md px-2 bg-background w-full"
                value={rateType}
                onChange={(e) => setRateType(e.target.value as Config["rate_type"])}
              >
                {Object.entries(RATE_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Compounding</label>
              <select
                className="h-8 text-sm border border-border rounded-md px-2 bg-background w-full"
                value={compounding}
                onChange={(e) => setCompounding(e.target.value as "daily" | "monthly")}
              >
                {Object.entries(COMPOUNDING_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {rateType === "fixed" && (
            <div className="w-40">
              <label className="text-xs text-muted-foreground mb-1 block">Rate % p.a.</label>
              <Input type="number" min="0" step="0.001" className="h-8 text-sm" value={fixedRate} onChange={(e) => setFixedRate(e.target.value)} placeholder="5.250" />
            </div>
          )}
          {rateType === "prime_linked" && (
            <div className="w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Prime offset % (negative = below prime)</label>
              <Input type="number" step="0.001" className="h-8 text-sm" value={primeOffset} onChange={(e) => setPrimeOffset(e.target.value)} placeholder="-4.750" />
              {currentPrime != null && primeOffset && (
                <p className="text-xs text-muted-foreground mt-1">
                  Effective: {(currentPrime + Number.parseFloat(primeOffset)).toFixed(2)}% at prime {currentPrime}%
                </p>
              )}
            </div>
          )}
          {rateType === "repo_linked" && (
            <div className="w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Repo offset % (negative = below repo)</label>
              <Input type="number" step="0.001" className="h-8 text-sm" value={repoOffset} onChange={(e) => setRepoOffset(e.target.value)} placeholder="-1.000" />
            </div>
          )}
          {rateType === "manual" && (
            <p className="text-xs text-muted-foreground">Manual mode — deposit interest will be entered manually per period. Auto-accrual is disabled.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Bank (optional)</label>
              <Input className="h-8 text-sm" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="FNB" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Account ref (optional)</label>
              <Input className="h-8 text-sm" value={accountRef} onChange={(e) => setAccountRef(e.target.value)} placeholder="Corporate Saver 62xx" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Effective from</label>
              <Input type="date" className="h-8 text-sm" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Reason for change (optional)</label>
              <Input className="h-8 text-sm" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="e.g. Bank notified rate change" />
            </div>
          </div>

          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : active ? "Update rate" : "Set up interest config"}
          </Button>
        </CardContent>
      )}

      {configs.length > 1 && (
        <CardContent className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showHistory ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            Rate history ({configs.length} entries)
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {configs.map((c) => (
                <div key={c.id} className="text-xs border-l-2 border-border pl-3 py-0.5">
                  <p className="font-medium">{describeRate(c)}</p>
                  <p className="text-muted-foreground">
                    {formatDate(c.effective_from)} → {c.effective_to ? formatDate(c.effective_to) : "current"}
                    {c.bank_name && ` · ${c.bank_name}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
