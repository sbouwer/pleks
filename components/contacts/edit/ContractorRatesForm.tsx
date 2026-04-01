"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CONTRACTOR_SPECIALITIES } from "@/lib/constants"

interface ContractorRatesFormProps {
  contractorId: string
  callOutRateCents: number | null
  hourlyRateCents: number | null
  specialities: string[]
  onSaved: () => void
}

const FALLBACK_SPECIALITIES = [
  "Plumbing", "Electrical", "Painting", "Tiling", "Carpentry", "Roofing", "HVAC", "Landscaping", "Cleaning", "Security", "General"
]

export function ContractorRatesForm({
  contractorId, callOutRateCents, hourlyRateCents, specialities: initialSpecialities, onSaved
}: Readonly<ContractorRatesFormProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [callOut, setCallOut] = useState(callOutRateCents ? String(callOutRateCents / 100) : "")
  const [hourly, setHourly] = useState(hourlyRateCents ? String(hourlyRateCents / 100) : "")
  const [specialities, setSpecialities] = useState(initialSpecialities)

  const specList = (typeof CONTRACTOR_SPECIALITIES !== "undefined" && CONTRACTOR_SPECIALITIES) ? CONTRACTOR_SPECIALITIES : FALLBACK_SPECIALITIES

  function toggleSpeciality(s: string) {
    setSpecialities((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/contractors", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: contractorId,
            call_out_rate_cents: callOut ? Math.round(parseFloat(callOut) * 100) : null,
            hourly_rate_cents: hourly ? Math.round(parseFloat(hourly) * 100) : null,
            specialities,
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Call-out rate (R)</Label><Input value={callOut} onChange={(e) => setCallOut(e.target.value)} type="number" min="0" step="0.01" className="h-8 text-sm mt-1" /></div>
        <div><Label className="text-xs">Hourly rate (R)</Label><Input value={hourly} onChange={(e) => setHourly(e.target.value)} type="number" min="0" step="0.01" className="h-8 text-sm mt-1" /></div>
      </div>
      <div>
        <Label className="text-xs">Specialities</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {specList.map((s) => (
            <button key={s} type="button" onClick={() => toggleSpeciality(s)} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${specialities.includes(s) ? "bg-brand text-white border-brand" : "border-border text-muted-foreground hover:border-brand/50"}`}>{s}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1"><Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">{isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="outline" onClick={onSaved} disabled={isPending} className="h-7 text-xs">Cancel</Button></div>
    </div>
  )
}
