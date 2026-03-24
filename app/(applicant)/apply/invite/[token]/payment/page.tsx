"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { formatZAR, APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CreditCard, Landmark, ShieldCheck } from "lucide-react"

export default function PaymentPage() {
  const params = useParams()
  const token = params.token as string

  // Placeholder: in production, fetch from application to determine joint vs single
  const [isJoint] = useState(false)
  const fee = isJoint ? JOINT_APPLICATION_FEE_CENTS : APPLICATION_FEE_CENTS

  const [processing, setProcessing] = useState(false)

  async function handlePay() {
    setProcessing(true)
    // Placeholder: would redirect to PayFast payment page
    // e.g., window.location.href = `/api/payments/screening?token=${token}`
    await new Promise((r) => setTimeout(r, 1500))
    // After payment, PayFast would redirect to status page
    window.location.href = `/apply/invite/${token}/status`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Payment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete payment to begin your background screening.
        </p>
      </div>

      {/* Fee breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Fee summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm">
              {isJoint ? "Joint screening fee" : "Screening fee"}
            </span>
            <span className="text-sm font-medium">{formatZAR(fee)}</span>
          </div>
          <div className="border-t border-border pt-2 flex items-center justify-between">
            <span className="font-medium">Total</span>
            <span className="text-xl font-semibold">{formatZAR(fee)}</span>
          </div>

          <p className="text-xs text-muted-foreground">
            This is a once-off, non-refundable screening fee. It covers credit
            checks, ID verification, and background screening.
          </p>
        </CardContent>
      </Card>

      {/* Payment methods */}
      <Card>
        <CardHeader>
          <CardTitle>Payment methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <CreditCard className="size-4 text-muted-foreground" />
              Visa
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <CreditCard className="size-4 text-muted-foreground" />
              Mastercard
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <Landmark className="size-4 text-muted-foreground" />
              Instant EFT
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <Landmark className="size-4 text-muted-foreground" />
              Bank transfer
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secure badge */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" />
        <span>Secured by PayFast — 256-bit SSL encryption</span>
      </div>

      {/* Pay button */}
      <Button
        className="w-full h-12 text-base font-semibold"
        size="lg"
        disabled={processing}
        onClick={handlePay}
      >
        {processing ? "Redirecting to PayFast..." : `Pay ${formatZAR(fee)} with PayFast`}
      </Button>
    </div>
  )
}
