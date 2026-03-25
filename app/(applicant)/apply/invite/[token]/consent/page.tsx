"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ShieldCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function Stage2ConsentPage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleDecline() {
    if (!confirm("Are you sure you want to withdraw your application?")) return

    const supabase = createClient()
    const { data: tokenData } = await supabase
      .from("application_tokens")
      .select("application_id")
      .eq("token", token)
      .single()

    if (tokenData) {
      await supabase.from("applications").update({
        stage2_status: "withdrawn",
      }).eq("id", tokenData.application_id)
    }

    router.push(`/apply/invite/${token}`)
  }

  async function handleAgree() {
    if (!agreed) return
    setSubmitting(true)

    try {
      const supabase = createClient()

      // Look up application from token
      const { data: tokenData } = await supabase
        .from("application_tokens")
        .select("application_id, applicant_email")
        .eq("token", token)
        .single()

      if (!tokenData) {
        alert("Invalid or expired token.")
        setSubmitting(false)
        return
      }

      // Get application org_id
      const { data: app } = await supabase
        .from("applications")
        .select("org_id")
        .eq("id", tokenData.application_id)
        .single()

      // Log Stage 2 consent
      await supabase.from("consent_log").insert({
        org_id: app?.org_id,
        subject_email: tokenData.applicant_email,
        consent_type: "credit_check",
        consent_version: "1.0-searchworx-stage2",
        metadata: {
          application_id: tokenData.application_id,
          bureau: "searchworx",
          check_types: ["transunion", "xds", "csi_id", "csi_id_photo", "tpn_adverse"],
          stage: 2,
        },
      })

      // Update application with Stage 2 consent
      await supabase.from("applications").update({
        stage2_consent_given: true,
        stage2_consent_given_at: new Date().toISOString(),
        stage2_status: "pending_payment",
      }).eq("id", tokenData.application_id)

      router.push(`/apply/invite/${token}/payment`)
    } catch {
      alert("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Credit check consent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          To proceed with screening, we need your consent to perform background
          checks.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            POPIA Consent — Background Screening
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            By consenting below, you authorise Pleks and its screening partner
            <strong className="text-foreground"> Searchworx</strong> to perform
            the following checks:
          </p>

          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-foreground">TransUnion credit check</strong>{" "}
              — credit score, payment history, and credit accounts
            </li>
            <li>
              <strong className="text-foreground">XDS credit check</strong>{" "}
              — alternative credit bureau for comprehensive coverage
            </li>
            <li>
              <strong className="text-foreground">ID verification</strong>{" "}
              — confirmation of your identity against the Department of Home
              Affairs records
            </li>
            <li>
              <strong className="text-foreground">TPN rental profile</strong>{" "}
              — rental payment history and previous landlord references
            </li>
            <li>
              <strong className="text-foreground">Adverse listings</strong>{" "}
              — judgements, defaults, sequestrations, and blacklisting
            </li>
          </ul>

          <div className="space-y-2">
            <p className="font-medium text-foreground">Your rights:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>You may request a copy of the screening report</li>
              <li>You may dispute any inaccurate information</li>
              <li>
                You may withdraw consent at any time, though this will result in
                your application being withdrawn
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Consent checkbox */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-border accent-primary"
        />
        <span className="text-sm">
          I consent to the credit and background check as described above.
        </span>
      </label>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Button
          className="w-full h-12 text-base font-semibold"
          size="lg"
          disabled={!agreed || submitting}
          onClick={handleAgree}
        >
          {submitting ? "Processing..." : "Agree and pay"}
        </Button>

        <Button
          variant="ghost"
          className="w-full"
          onClick={handleDecline}
        >
          Decline — withdraw my application
        </Button>
      </div>
    </div>
  )
}
