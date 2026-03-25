"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Clock, Circle, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatZAR, APPLICATION_FEE_CENTS } from "@/lib/constants"

const STEPS = [
  { key: "submitted", label: "Application submitted" },
  { key: "documents", label: "Documents uploaded" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "payment", label: "Payment received" },
  { key: "screening", label: "Background screening" },
  { key: "decision", label: "Decision" },
]

function statusToStep(stage2Status: string | null, feeStatus: string | null): number {
  if (stage2Status === "approved" || stage2Status === "declined") return 5
  if (stage2Status === "screening_complete") return 5
  if (stage2Status === "screening_in_progress") return 4
  if (feeStatus === "paid") return 3
  if (stage2Status === "pending_payment") return 2
  if (stage2Status === "invited") return 2
  return 1
}

export default function Stage2StatusPage() {
  const params = useParams()
  const token = params.token as string

  const [currentStep, setCurrentStep] = useState(3)
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [stage2Status, setStage2Status] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let channelRef: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      const { data: tokenData } = await supabase
        .from("application_tokens")
        .select("application_id")
        .eq("token", token)
        .single()

      if (!tokenData) {
        setLoading(false)
        return
      }

      setApplicationId(tokenData.application_id)

      const { data: app } = await supabase
        .from("applications")
        .select("stage2_status, fee_status")
        .eq("id", tokenData.application_id)
        .single()

      if (app) {
        setStage2Status(app.stage2_status)
        setCurrentStep(statusToStep(app.stage2_status, app.fee_status))
      }
      setLoading(false)

      channelRef = supabase
        .channel(`stage2-${tokenData.application_id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "applications",
            filter: `id=eq.${tokenData.application_id}`,
          },
          (payload) => {
            const updated = payload.new as Record<string, unknown>
            setStage2Status(updated.stage2_status as string)
            setCurrentStep(statusToStep(
              updated.stage2_status as string,
              updated.fee_status as string
            ))
          }
        )
        .subscribe()
    }
    load()

    return () => { if (channelRef) supabase.removeChannel(channelRef) }
  }, [token])

  function stepIcon(index: number) {
    if (index < currentStep) return <CheckCircle2 className="size-5 text-green-500" />
    if (index === currentStep) return <Clock className="size-5 text-yellow-500 animate-pulse" />
    return <Circle className="size-5 text-muted-foreground" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Application status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Screening fee: {formatZAR(APPLICATION_FEE_CENTS)} paid
        </p>
      </div>

      {stage2Status === "approved" && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Congratulations! Your application has been approved. Check your email
              for lease details.
            </p>
          </CardContent>
        </Card>
      )}

      {stage2Status === "declined" && (
        <Card className="border-muted">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Thank you for your application. After careful consideration, we are
              unable to proceed at this time. We wish you well in finding a suitable home.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-2">
          <div className="space-y-0">
            {STEPS.map((step, i) => (
              <div key={step.key} className="flex items-center gap-3 py-3">
                {stepIcon(i)}
                <span className={i <= currentStep ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {stage2Status === "screening_in_progress" && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Your background checks are being processed. This typically completes
              within a few hours. We&apos;ll email you when a decision has been made.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Have questions? Contact the agent managing this listing.
          </p>
          {applicationId && (
            <p className="text-sm mt-2 text-muted-foreground">
              Reference: <span className="font-mono text-foreground">{applicationId}</span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
