"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface PrimeRateWidgetProps {
  currentRate: number
  effectiveSince: string
}

export function PrimeRateWidget({ currentRate, effectiveSince }: Readonly<PrimeRateWidgetProps>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rate, setRate] = useState("")
  const [effectiveDate, setEffectiveDate] = useState("")
  const [mpcDate, setMpcDate] = useState("")
  const [notes, setNotes] = useState("")

  async function handleSave() {
    if (!rate || !effectiveDate) {
      toast.error("Rate and effective date are required")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/admin/prime-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rate_percent: Number.parseFloat(rate),
          effective_date: effectiveDate,
          mpc_meeting_date: mpcDate || null,
          notes: notes || null,
        }),
      })
      if (!res.ok) throw new Error("Failed to update")
      toast.success(`Prime rate updated to ${rate}%`)
      setOpen(false)
      setRate("")
      setEffectiveDate("")
      setMpcDate("")
      setNotes("")
      router.refresh()
    } catch {
      toast.error("Failed to update prime rate")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-brand/30">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">SA Prime Rate</p>
            <p className="font-heading text-2xl text-brand">{currentRate}%</p>
            <p className="text-xs text-muted-foreground">
              Since {new Date(effectiveSince).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger>
              <Button variant="outline" size="sm">Update</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update prime rate</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>New rate (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    step="0.25"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="e.g. 11.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Effective date</Label>
                  <Input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>MPC meeting date (optional)</Label>
                  <Input
                    type="date"
                    value={mpcDate}
                    onChange={(e) => setMpcDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. MPC cut 25bps"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={loading}>
                    {loading ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}
