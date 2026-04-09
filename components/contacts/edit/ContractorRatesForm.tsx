"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ContractorRatesFormProps {
  contractorId: string
  callOutRateCents: number | null
  hourlyRateCents: number | null
  specialities: string[]
  heritageApproved?: boolean
  heritageSpecialities?: string[]
  onSaved: () => void
}

const FALLBACK_SPECIALITIES = [
  "Plumbing", "Electrical", "Painting", "Tiling", "Carpentry", "Roofing", "HVAC",
  "Landscaping", "Cleaning", "Security", "General",
]

const HERITAGE_SPECIALITY_OPTIONS = [
  "Stonework", "Lime mortar", "Sandstone", "Timber joinery", "Timber windows",
  "Original materials", "Slate roofing", "Cast iron", "Victorian brickwork", "SAHRA compliance",
]

export function ContractorRatesForm({
  contractorId, callOutRateCents, hourlyRateCents,
  specialities: initialSpecialities,
  heritageApproved: initialHeritageApproved = false,
  heritageSpecialities: initialHeritageSpecialities = [],
  onSaved,
}: Readonly<ContractorRatesFormProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [callOut, setCallOut] = useState(callOutRateCents ? String(callOutRateCents / 100) : "")
  const [hourly, setHourly] = useState(hourlyRateCents ? String(hourlyRateCents / 100) : "")
  const [specialities, setSpecialities] = useState(initialSpecialities)
  const [heritageApproved, setHeritageApproved] = useState(initialHeritageApproved)
  const [heritageSpecialities, setHeritageSpecialities] = useState<string[]>(initialHeritageSpecialities)

  function toggleSpeciality(s: string) {
    setSpecialities((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }

  function toggleHeritageSpeciality(s: string) {
    setHeritageSpecialities((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/contractors", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractorId,
            callOutRateCents: callOut ? Math.round(Number.parseFloat(callOut) * 100) : null,
            hourlyRateCents: hourly ? Math.round(Number.parseFloat(hourly) * 100) : null,
            specialities,
            heritageApproved,
            heritageSpecialities,
          }),
        })
        if (!res.ok) throw new Error()
        toast.success("Rates saved")
        router.refresh()
        onSaved()
      } catch {
        toast.error("Failed to save")
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Call-out rate (R)</Label>
          <Input value={callOut} onChange={(e) => setCallOut(e.target.value)} type="number" min="0" step="0.01" className="h-8 text-sm mt-1" />
        </div>
        <div>
          <Label className="text-xs">Hourly rate (R)</Label>
          <Input value={hourly} onChange={(e) => setHourly(e.target.value)} type="number" min="0" step="0.01" className="h-8 text-sm mt-1" />
        </div>
      </div>

      <div>
        <Label className="text-xs">Specialities</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {FALLBACK_SPECIALITIES.map((s) => (
            <button
              key={s} type="button" onClick={() => toggleSpeciality(s)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${specialities.includes(s) ? "bg-brand text-white border-brand" : "border-border text-muted-foreground hover:border-brand/50"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Heritage approval */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 accent-brand"
            checked={heritageApproved}
            onChange={(e) => setHeritageApproved(e.target.checked)}
          />
          <div>
            <p className="text-xs font-medium">Approved for heritage buildings</p>
            <p className="text-xs text-muted-foreground">Contractor will appear for heritage properties that require specialist contractors.</p>
          </div>
        </label>

        {heritageApproved && (
          <div>
            <Label className="text-xs text-amber-700 dark:text-amber-400">Heritage specialities</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {HERITAGE_SPECIALITY_OPTIONS.map((s) => (
                <button
                  key={s} type="button" onClick={() => toggleHeritageSpeciality(s)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${heritageSpecialities.includes(s) ? "bg-amber-500 text-white border-amber-500" : "border-border text-muted-foreground hover:border-amber-500/50"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onSaved} disabled={isPending} className="h-7 text-xs">
          Cancel
        </Button>
      </div>
    </div>
  )
}
