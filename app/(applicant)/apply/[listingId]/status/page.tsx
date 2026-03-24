"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Clock, Circle, ShieldCheck, AlertTriangle, XCircle } from "lucide-react"

type PreScreenLevel = "strong" | "borderline" | "insufficient"

const STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "documents", label: "Documents" },
  { key: "review", label: "Under review" },
  { key: "decision", label: "Decision" },
]

export default function StatusPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const listingId = params.listingId as string
  const applicationId = searchParams.get("application")

  // Placeholder state — in production, fetched via Supabase Realtime
  const [currentStep] = useState(2) // 0-indexed: review stage
  const [preScreen] = useState<PreScreenLevel | null>("borderline")

  function stepIcon(index: number) {
    if (index < currentStep) {
      return <CheckCircle2 className="size-5 text-green-500" />
    }
    if (index === currentStep) {
      return <Clock className="size-5 text-yellow-500 animate-pulse" />
    }
    return <Circle className="size-5 text-muted-foreground" />
  }

  function preScreenIcon(level: PreScreenLevel) {
    switch (level) {
      case "strong":
        return <ShieldCheck className="size-5 text-green-500" />
      case "borderline":
        return <AlertTriangle className="size-5 text-yellow-500" />
      case "insufficient":
        return <XCircle className="size-5 text-red-500" />
    }
  }

  function preScreenText(level: PreScreenLevel) {
    switch (level) {
      case "strong":
        return "Your application looks strong based on the information provided."
      case "borderline":
        return "Your application is borderline. Uploading additional documents may improve your chances."
      case "insufficient":
        return "Based on the information provided, your application may not meet the requirements. Consider strengthening it below."
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Application status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          We&apos;ll update this page as your application is reviewed.
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

      {/* Pre-screen indicator */}
      {preScreen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {preScreenIcon(preScreen)}
              Application strength
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {preScreenText(preScreen)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Strengthen application section */}
      {preScreen && preScreen !== "strong" && (
        <Card>
          <CardHeader>
            <CardTitle>Strengthen my application</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You can improve your application by providing additional supporting
              documents:
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>Proof of savings or investments</li>
              <li>Pension or retirement fund statement</li>
              <li>Additional income proof (side income, rental income)</li>
              <li>Reference letter from previous landlord</li>
              <li>Guarantor details</li>
            </ul>
            <Button
              variant="outline"
              className="w-full h-12"
              render={
                <Link
                  href={`/apply/${listingId}/documents?application=${applicationId}`}
                />
              }
            >
              Upload additional documents
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Contact info */}
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Have questions? Contact the agent managing this listing for more
            information about your application.
          </p>
          <p className="text-sm mt-2 text-muted-foreground">
            Reference: <span className="font-mono text-foreground">{applicationId ?? "—"}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
