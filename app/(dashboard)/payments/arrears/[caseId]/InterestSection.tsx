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
import { formatZAR } from "@/lib/constants"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface InterestSectionProps {
  caseId: string
  totalArrearsCents: number
  interestAccruedCents: number
  interestEnabled: boolean
  primeRatePercent: number
  marginPercent: number
}

export function InterestSection({
  caseId,
  totalArrearsCents,
  interestAccruedCents,
  interestEnabled,
  primeRatePercent,
  marginPercent,
}: Readonly<InterestSectionProps>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)

  const effectiveRate = primeRatePercent + marginPercent
  const totalOwed = totalArrearsCents + interestAccruedCents

  async function handleWaive() {
    if (!reason.trim()) {
      toast.error("Please provide a reason for waiving interest")
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/arrears/${caseId}/waive-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) throw new Error("Failed to waive")
      const data = await res.json()
      toast.success(`${formatZAR(data.waivedCents)} interest waived`)
      setOpen(false)
      setReason("")
      router.refresh()
    } catch {
      toast.error("Failed to waive interest")
    } finally {
      setLoading(false)
    }
  }

  if (!interestEnabled) {
    return (
      <p className="text-sm text-muted-foreground mb-6">
        Interest not applicable — no interest clause on this lease.
      </p>
    )
  }

  if (interestAccruedCents <= 0) return null

  return (
    <Card className="mb-6">
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Arrears balance</span>
          <span className="text-danger font-medium">{formatZAR(totalArrearsCents)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Interest accrued</span>
          <span className="text-brand font-medium">{formatZAR(interestAccruedCents)}</span>
        </div>
        <div className="border-t border-border/50 pt-2 flex justify-between text-sm font-semibold">
          <span>Total owed</span>
          <span>{formatZAR(totalOwed)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Rate: Prime {primeRatePercent}% + {marginPercent}% = {effectiveRate.toFixed(2)}% p.a.
        </p>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger>
            <Button variant="outline" size="sm" className="text-brand border-brand/30">
              Waive all interest
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Waive interest</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Waive {formatZAR(interestAccruedCents)} interest? This is permanent and cannot be undone.
            </p>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Tenant agreed to pay balance by Friday"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleWaive} disabled={loading}>
                {loading ? "Waiving..." : "Confirm waive"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
