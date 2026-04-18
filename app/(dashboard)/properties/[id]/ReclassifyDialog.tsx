"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tag } from "lucide-react"
import { SCENARIOS, type ScenarioType, type ScenarioSegment } from "@/lib/properties/scenarios"
import { reclassifyProperty } from "@/lib/actions/reclassifyProperty"

// ── Scenario options (flattened from SCENARIOS + "other") ────────────────────

const SEGMENT_LABEL: Record<ScenarioSegment, string> = {
  residential:          "Residential",
  commercial_industrial: "Commercial / Industrial",
  mixed:                "Mixed use",
}

interface ScenarioOption {
  code:         ScenarioType
  label:        string
  segmentLabel: string
}

function buildOptions(): ScenarioOption[] {
  const opts: ScenarioOption[] = Object.values(SCENARIOS).map((s) => ({
    code:         s.code,
    label:        s.label,
    segmentLabel: SEGMENT_LABEL[s.segment],
  }))
  opts.push({ code: "other", label: "Other / advanced", segmentLabel: "Other" })
  return opts
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReclassifyDialogProps {
  propertyId:         string
  currentScenario:    ScenarioType | null
  currentScenarioLabel: string
  unitCount:          number
}

export function ReclassifyDialog({
  propertyId,
  currentScenario,
  currentScenarioLabel,
  unitCount,
}: Readonly<ReclassifyDialogProps>) {
  const [open, setOpen]           = useState(false)
  const [target, setTarget]       = useState<ScenarioType | "">("")
  const [error, setError]         = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const options = buildOptions()

  function handleConfirm() {
    if (!target || target === currentScenario) return
    setError(null)
    startTransition(async () => {
      const result = await reclassifyProperty(propertyId, target as ScenarioType)
      if (result.ok) {
        setOpen(false)
        setTarget("")
      } else {
        setError(result.error ?? "Failed to reclassify")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Tag className="w-3.5 h-3.5" />
        Reclassify
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reclassify property</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p className="font-medium">Currently classified as:</p>
            <p className="text-muted-foreground">
              {currentScenarioLabel}
              {unitCount > 1 && ` (${unitCount} units)`}
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium block">Change to:</span>
            <Select value={target} onValueChange={(v) => setTarget(v as ScenarioType | "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a scenario…" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.code} value={o.code} disabled={o.code === currentScenario}>
                    {o.segmentLabel} — {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Reclassifying will:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>Update the scenario type on this property</li>
              <li>Re-derive default clauses and inspection profiles</li>
              <li>Keep all existing units, leases, and inspections as-is</li>
              <li>Log the change to the audit trail</li>
            </ul>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!target || target === currentScenario || pending}
          >
            {pending ? "Reclassifying…" : "Reclassify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
