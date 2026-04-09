"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { formatZAR } from "@/lib/constants"
import { Plus, Trash2 } from "lucide-react"

type AllocationMode = "all_landlord" | "all_tenant" | "split"
type CollectionMethod = "next_invoice" | "separate_invoice" | "deposit_deduction" | "already_paid"
type AllocationType = "landlord_expense" | "tenant_charge"

interface AllocationRow {
  key: string
  type: AllocationType
  description: string
  amount: string
  collectionMethod: CollectionMethod
  clauseRef: string
}

interface SignOffCardProps {
  requestId: string
  actualCostCents: number | null
}

const COLLECTION_LABELS: Record<CollectionMethod, string> = {
  next_invoice: "Add to next rent invoice",
  separate_invoice: "Issue separate invoice",
  deposit_deduction: "Deduct from deposit at lease end",
  already_paid: "Already paid on-site",
}

function newRow(type: AllocationType, amount = ""): AllocationRow {
  return {
    key: crypto.randomUUID(),
    type,
    description: "",
    amount,
    collectionMethod: "next_invoice",
    clauseRef: "",
  }
}

export function SignOffCard({ requestId, actualCostCents }: Readonly<SignOffCardProps>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<AllocationMode>("all_landlord")
  const [rows, setRows] = useState<AllocationRow[]>([newRow("landlord_expense"), newRow("tenant_charge")])

  const totalCents = actualCostCents ?? 0
  const totalFormatted = totalCents > 0 ? formatZAR(totalCents) : "unknown"

  // Sum of current split rows
  const splitSum = rows.reduce((s, r) => s + (Number.parseFloat(r.amount) * 100 || 0), 0)
  const splitValid = totalCents === 0 || Math.round(splitSum) === totalCents

  function updateRow(key: string, patch: Partial<AllocationRow>) {
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows((prev) => [...prev, newRow("landlord_expense")])
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  function buildAllocations() {
    if (mode === "all_landlord") {
      return [{
        type: "landlord_expense" as AllocationType,
        amountCents: totalCents,
        description: "Maintenance expense",
      }]
    }
    if (mode === "all_tenant") {
      const row = rows.find((r) => r.type === "tenant_charge") ?? rows[0]
      return [{
        type: "tenant_charge" as AllocationType,
        amountCents: totalCents,
        description: row.description || "Maintenance charge",
        collectionMethod: row.collectionMethod,
        clauseRef: row.clauseRef || undefined,
      }]
    }
    // split
    return rows.map((r) => ({
      type: r.type,
      amountCents: Math.round(Number.parseFloat(r.amount) * 100) || 0,
      description: r.description || (r.type === "landlord_expense" ? "Maintenance expense" : "Maintenance charge"),
      collectionMethod: r.type === "tenant_charge" ? r.collectionMethod : undefined,
      clauseRef: r.clauseRef || undefined,
    }))
  }

  function handleSignOff() {
    if (mode === "split" && !splitValid) {
      toast.error("Allocation total must equal the total cost")
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/maintenance/sign-off", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, allocations: buildAllocations() }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error((data as { error?: string }).error || "Failed to sign off")
          return
        }
        toast.success("Signed off")
        setOpen(false)
        router.refresh()
      } catch {
        toast.error("Failed to sign off")
      }
    })
  }

  // Tenant row for "all_tenant" mode
  const tenantRow = rows.find((r) => r.type === "tenant_charge") ?? rows[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm" type="button">Sign Off</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sign off</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Total */}
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted-foreground">Contractor total</span>
            <span className="font-heading text-base">{totalFormatted}</span>
          </div>

          {/* Mode */}
          <div>
            <Label className="text-xs mb-2 block">Cost allocation</Label>
            <div className="space-y-1.5">
              {(["all_landlord", "split", "all_tenant"] as AllocationMode[]).map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="accent-brand"
                  />
                  <span>
                    {m === "all_landlord" && "All landlord expense"}
                    {m === "split" && "Split cost"}
                    {m === "all_tenant" && "All tenant charge"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* All-tenant: just show collection method */}
          {mode === "all_tenant" && (
            <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  className="h-8 text-sm mt-1"
                  placeholder="e.g. Toilet seat replacement — tenant damage"
                  value={tenantRow.description}
                  onChange={(e) => updateRow(tenantRow.key, { description: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Lease clause reference (optional)</Label>
                <Input
                  className="h-8 text-sm mt-1"
                  placeholder="e.g. Clause 12.3 — tenant responsible for damage"
                  value={tenantRow.clauseRef}
                  onChange={(e) => updateRow(tenantRow.key, { clauseRef: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Collect via</Label>
                <div className="space-y-1 mt-1">
                  {(Object.entries(COLLECTION_LABELS) as [CollectionMethod, string][]).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="radio"
                        name="collect_all"
                        value={val}
                        checked={tenantRow.collectionMethod === val}
                        onChange={() => updateRow(tenantRow.key, { collectionMethod: val })}
                        className="accent-brand"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Split rows */}
          {mode === "split" && (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.key} className="rounded-lg border border-border p-3 space-y-2 bg-muted/30 relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {row.type === "landlord_expense" ? "Landlord" : "Tenant"}
                    </span>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Type selector */}
                  <div className="flex gap-3">
                    {(["landlord_expense", "tenant_charge"] as AllocationType[]).map((t) => (
                      <label key={t} className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input
                          type="radio"
                          name={`type_${row.key}`}
                          value={t}
                          checked={row.type === t}
                          onChange={() => updateRow(row.key, { type: t })}
                          className="accent-brand"
                        />
                        {t === "landlord_expense" ? "Landlord" : "Tenant"}
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">Description</Label>
                      <Input
                        className="h-8 text-sm mt-0.5"
                        placeholder="e.g. Basin leak repair"
                        value={row.description}
                        onChange={(e) => updateRow(row.key, { description: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Amount (R)</Label>
                      <Input
                        className="h-8 text-sm mt-0.5"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={row.amount}
                        onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                      />
                    </div>
                    {row.type === "tenant_charge" && (
                      <div>
                        <Label className="text-xs">Clause ref</Label>
                        <Input
                          className="h-8 text-sm mt-0.5"
                          placeholder="e.g. 12.3"
                          value={row.clauseRef}
                          onChange={(e) => updateRow(row.key, { clauseRef: e.target.value })}
                        />
                      </div>
                    )}
                  </div>

                  {row.type === "tenant_charge" && (
                    <div>
                      <Label className="text-xs">Collect via</Label>
                      <div className="grid grid-cols-2 gap-x-4 mt-0.5">
                        {(Object.entries(COLLECTION_LABELS) as [CollectionMethod, string][]).map(([val, label]) => (
                          <label key={val} className="flex items-center gap-1.5 cursor-pointer text-xs">
                            <input
                              type="radio"
                              name={`collect_${row.key}`}
                              value={val}
                              checked={row.collectionMethod === val}
                              onChange={() => updateRow(row.key, { collectionMethod: val })}
                              className="accent-brand"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-brand hover:text-brand/80 transition-colors"
              >
                <Plus className="size-3.5" />
                Add another allocation
              </button>

              {/* Running total */}
              <div className={`flex justify-between text-xs pt-1 border-t border-border ${splitValid ? "text-success" : "text-destructive"}`}>
                <span>
                  {rows.map((r) => formatZAR(Math.round(Number.parseFloat(r.amount) * 100) || 0)).join(" + ")}
                </span>
                <span>
                  {formatZAR(Math.round(splitSum))} {splitValid ? "✓" : `— need ${formatZAR(totalCents)}`}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              onClick={handleSignOff}
              disabled={isPending || (mode === "split" && !splitValid)}
            >
              {isPending ? "Signing off…" : "Sign off and allocate"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
