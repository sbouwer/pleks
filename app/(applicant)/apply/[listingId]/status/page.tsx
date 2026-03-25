"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Clock, Circle, ShieldCheck, AlertTriangle, XCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type PreScreenLevel = "strong" | "borderline" | "insufficient" | "pending"

const STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "documents", label: "Documents" },
  { key: "review", label: "Under review" },
  { key: "decision", label: "Decision" },
]

function statusToStep(stage1Status: string | null): number {
  switch (stage1Status) {
    case "submitted": return 0
    case "pending_documents": return 0
    case "documents_submitted": return 1
    case "extracting": return 1
    case "pre_screen_complete": return 2
    case "shortlisted": return 3
    case "not_shortlisted": return 3
    default: return 0
  }
}

export default function StatusPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const listingId = params.listingId as string
  const applicationId = searchParams.get("application")

  const [currentStep, setCurrentStep] = useState(0)
  const [preScreen, setPreScreen] = useState<PreScreenLevel>("pending")
  const [stage1Status, setStage1Status] = useState<string | null>(null)

  useEffect(() => {
    if (!applicationId) return

    const supabase = createClient()

    // Initial fetch
    async function load() {
      const { data } = await supabase
        .from("applications")
        .select("stage1_status, prescreen_affordability_flag")
        .eq("id", applicationId!)
        .single()

      if (data) {
        setStage1Status(data.stage1_status)
        setCurrentStep(statusToStep(data.stage1_status))
        setPreScreen((data.prescreen_affordability_flag as PreScreenLevel) ?? "pending")
      }
    }
    load()

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`application-${applicationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `id=eq.${applicationId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>
          setStage1Status(updated.stage1_status as string)
          setCurrentStep(statusToStep(updated.stage1_status as string))
          if (updated.prescreen_affordability_flag) {
            setPreScreen(updated.prescreen_affordability_flag as PreScreenLevel)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [applicationId])

  function stepIcon(index: number) {
    if (index < currentStep) return <CheckCircle2 className="size-5 text-green-500" />
    if (index === currentStep) return <Clock className="size-5 text-yellow-500 animate-pulse" />
    return <Circle className="size-5 text-muted-foreground" />
  }

  function preScreenIcon(level: PreScreenLevel) {
    switch (level) {
      case "strong": return <ShieldCheck className="size-5 text-green-500" />
      case "borderline": return <AlertTriangle className="size-5 text-yellow-500" />
      case "insufficient": return <XCircle className="size-5 text-red-500" />
      default: return <Clock className="size-5 text-muted-foreground" />
    }
  }

  function preScreenText(level: PreScreenLevel) {
    switch (level) {
      case "strong": return "Your application looks strong based on the information provided."
      case "borderline": return "Your application is borderline. Uploading additional documents may improve your chances."
      case "insufficient": return "Based on the information provided, your application may not meet the requirements. Consider strengthening it below."
      default: return "Your application is being processed."
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Application status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          This page updates automatically as your application is reviewed.
        </p>
      </div>

      {/* Shortlisted notification */}
      {stage1Status === "shortlisted" && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              You&apos;ve been shortlisted! Check your email for the next steps.
            </p>
          </CardContent>
        </Card>
      )}

      {stage1Status === "not_shortlisted" && (
        <Card className="border-muted">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Thank you for your application. Unfortunately, we are unable to
              proceed at this time. We wish you well in your search.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress steps */}
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

      {/* Pre-screen indicator — only after extraction complete */}
      {preScreen !== "pending" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {preScreenIcon(preScreen)}
              Application strength
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{preScreenText(preScreen)}</p>
          </CardContent>
        </Card>
      )}

      {/* Strengthen application section */}
      {preScreen !== "pending" && preScreen !== "strong" && stage1Status !== "shortlisted" && stage1Status !== "not_shortlisted" && (
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
            </ul>
            <Button
              variant="outline"
              className="w-full h-12"
              render={<Link href={`/apply/${listingId}/documents?application=${applicationId}`} />}
            >
              Upload additional documents
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Contact info */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Have questions? Contact the agent managing this listing.
          </p>
          <p className="text-sm mt-2 text-muted-foreground">
            Reference: <span className="font-mono text-foreground">{applicationId ?? "—"}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
