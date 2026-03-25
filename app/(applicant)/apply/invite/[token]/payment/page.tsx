"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { formatZAR, APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CreditCard, Landmark, ShieldCheck, Loader2 } from "lucide-react"

export default function PaymentPage() {
  const params = useParams()
  const token = params.token as string
  const formRef = useRef<HTMLFormElement>(null)

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [isJoint, setIsJoint] = useState(false)
  const [payfastUrl, setPayfastUrl] = useState("")
  const [payfastData, setPayfastData] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const fee = isJoint ? JOINT_APPLICATION_FEE_CENTS : APPLICATION_FEE_CENTS

  useEffect(() => {
    let cancelled = false
    async function loadPayment() {
      try {
        const res = await fetch("/api/payments/screening", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? "Failed to load payment")
        }

        const data = await res.json()
        if (!cancelled) {
          setIsJoint(data.is_joint)
          setPayfastUrl(data.payfast_url)
          setPayfastData(data.payfast_data)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load payment")
          setLoading(false)
        }
      }
    }
    loadPayment()
    return () => { cancelled = true }
  }, [token])

  function handlePay() {
    setProcessing(true)
    // Submit the hidden form to PayFast
    formRef.current?.submit()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 text-center py-12">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
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

      {/* Hidden PayFast form */}
      <form ref={formRef} action={payfastUrl} method="POST" className="hidden">
        {Object.entries(payfastData).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      </form>

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
