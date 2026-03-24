"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Clock, Circle } from "lucide-react"

const STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "documents", label: "Documents" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "payment", label: "Payment" },
  { key: "screening", label: "Screening" },
  { key: "decision", label: "Decision" },
]

export default function Stage2StatusPage() {
  const params = useParams()
  const token = params.token as string

  // Placeholder state — in production, fetched via Supabase Realtime
  const [currentStep] = useState(4) // 0-indexed: screening stage

  function stepIcon(index: number) {
    if (index < currentStep) {
      return <CheckCircle2 className="size-5 text-green-500" />
    }
    if (index === currentStep) {
      return <Clock className="size-5 text-yellow-500 animate-pulse" />
    }
    return <Circle className="size-5 text-muted-foreground" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Screening in progress</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your background checks are being processed. We&apos;ll notify you when
          the results are ready.
        </p>
      </div>

      {/* Progress steps */}
      <Card>
        <CardContent className="py-2">
          <div className="space-y-0">
            {STEPS.map((step, i) => (
              <div key={step.key} className="flex items-center gap-3 py-3">
                {stepIcon(i)}
                <span
                  className={
                    i <= currentStep
                      ? "text-sm font-medium"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Timeline info */}
      <Card>
        <CardHeader>
          <CardTitle>What happens next?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Background checks typically complete within a few hours. In some
            cases, it may take up to 24 hours.
          </p>
          <p>
            Once complete, the property manager will review the results and
            make a decision. You&apos;ll be notified via email and this page
            will update automatically.
          </p>
        </CardContent>
      </Card>

      {/* Reference */}
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Token reference:{" "}
            <span className="font-mono text-foreground text-xs">{token}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
