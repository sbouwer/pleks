"use client"

/**
 * app/(onboarding)/welcome/WelcomeClient.tsx — Welcome interstitial interaction layer
 *
 * Notes:  Step 1 (TOTP): links to /settings/security/enrol-totp?mandatory=true&redirect=/welcome?step=passkey.
 *         If user already has a verified TOTP factor (detected on mount), auto-advances to step 2.
 *         Step 2 (passkey): inline registration via useEnrolPasskey — optional, skippable.
 *         Both exit paths (add/skip) call markWelcomeSeen() then push to /auth/resolver.
 *         §F.3: TOTP + passkey only — magic-link and SMS never presented as MFA here.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useEnrolPasskey } from "@/lib/auth/passkeys/useEnrolPasskey"
import { markWelcomeSeen } from "@/lib/actions/welcome"
import { toast } from "sonner"
import { Shield, Fingerprint, ChevronRight, Loader2, CheckCircle2 } from "lucide-react"

type Step = "orient" | "passkey"

interface WelcomeClientProps {
  firstName: string
  orgName: string
  role: string
  delegationCount: number
  delegatedByName: string
  initialStep: Step
}

export default function WelcomeClient({
  firstName,
  orgName,
  role,
  delegationCount,
  delegatedByName,
  initialStep,
}: Readonly<WelcomeClientProps>) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(initialStep)
  const [finishing, setFinishing] = useState(false)
  const { enrol, state: passkeyState, errorMsg, reset } = useEnrolPasskey()

  const isFounder = role === "owner"
  const enrolTotpUrl = `/settings/security/enrol-totp?mandatory=true&redirect=${encodeURIComponent("/welcome?step=passkey")}`

  // If user already has a verified TOTP factor on arrival, skip straight to passkey step
  useEffect(() => {
    if (initialStep === "passkey") return
    const supabase = createClient()
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = (data?.totp ?? []).filter(f => f.status === "verified")
      if (verified.length > 0) setStep("passkey")
    })
  }, [initialStep])

  // Show passkey error via toast
  useEffect(() => {
    if (passkeyState === "error" && errorMsg && errorMsg !== "Cancelled") {
      toast.error("Passkey setup failed — you can try again in Settings.")
    }
  }, [passkeyState, errorMsg])

  async function handleFinish() {
    setFinishing(true)
    await markWelcomeSeen()
    router.push("/auth/resolver")
  }

  async function handleAddPasskey() {
    reset()
    await enrol()
    // enrol() resolves regardless of success/error — proceed to dashboard either way
    if (passkeyState !== "error") {
      toast.success("Passkey added — sign in with Face ID or Touch ID next time")
    }
    await handleFinish()
  }

  const isPasskeying = passkeyState === "in_progress"
  const stepLabel = step === "orient" ? "Step 1 of 2" : "Step 2 of 2"
  const orientHeading = firstName ? `Welcome to Pleks, ${firstName}.` : "Welcome to Pleks."
  const heading = step === "orient" ? orientHeading : "One-tap sign-in"
  const doneLabel = passkeyState === "success" ? "Continue to Pleks →" : "Skip for now — add later in Settings"
  const skipLabel = finishing ? "Loading…" : doneLabel

  return (
    <div style={{ fontFamily: "var(--font-sans, system-ui)" }}>

      {/* Step label */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-mute, #888)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
        {stepLabel}
      </div>

      {/* Heading */}
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--ink, #111)", margin: "0 0 10px", lineHeight: 1.25 }}>
        {heading}
      </h1>

      {/* Orientation subheading */}
      {step === "orient" && (
        <>
          <p style={{ fontSize: 15, color: "var(--ink-soft, #555)", marginTop: 0, marginBottom: 6, lineHeight: 1.6 }}>
            {isFounder
              ? `Your ${orgName} is ready — let's secure it.`
              : `You've joined ${orgName}.`}
          </p>
          {!isFounder && delegationCount > 0 && (
            <p style={{ fontSize: 13.5, color: "var(--ink-mute, #888)", marginBottom: 0, lineHeight: 1.55 }}>
              {delegatedByName} has assigned you {delegationCount === 1 ? "a setup task" : `${delegationCount} setup tasks`} — {delegationCount === 1 ? "it's" : "they're"} waiting on your dashboard.
            </p>
          )}
        </>
      )}

      <div style={{ marginTop: 36 }}>

        {/* ── Orient step: TOTP ── */}
        {step === "orient" && (
          <div>
            <div style={{ padding: "20px 24px", background: "var(--surface-2, #f4f4f5)", borderRadius: 12, marginBottom: 24, display: "flex", gap: 16, alignItems: "flex-start" }}>
              <Shield size={22} style={{ color: "var(--amber-ink, #b45309)", flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink, #111)", marginBottom: 4 }}>
                  Secure your account
                </div>
                <div style={{ fontSize: 13.5, color: "var(--ink-soft, #555)", lineHeight: 1.55 }}>
                  Set up your authenticator app. You&apos;ll need it each time you sign in — it keeps client data and trust funds protected.
                </div>
              </div>
            </div>
            <a
              href={enrolTotpUrl}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "13px 20px",
                background: "var(--amber-ink, #b45309)", color: "#fff",
                borderRadius: 8, fontSize: 14.5, fontWeight: 600,
                textDecoration: "none", boxSizing: "border-box",
              }}
            >
              Set up authenticator <ChevronRight size={16} />
            </a>
          </div>
        )}

        {/* ── Passkey step ── */}
        {step === "passkey" && (
          <div>
            <div style={{ padding: "20px 24px", background: "var(--surface-2, #f4f4f5)", borderRadius: 12, marginBottom: 24, display: "flex", gap: 16, alignItems: "flex-start" }}>
              <Fingerprint size={22} style={{ color: "var(--amber-ink, #b45309)", flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink, #111)", marginBottom: 4 }}>
                  Add Face ID / Touch ID
                </div>
                <div style={{ fontSize: 13.5, color: "var(--ink-soft, #555)", lineHeight: 1.55 }}>
                  Sign in with a single tap next time — no password required. Your authenticator app remains the security anchor; this is convenience only.
                </div>
              </div>
            </div>

            {passkeyState === "success" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "var(--green-subtle, #f0fdf4)", borderRadius: 8, marginBottom: 16, fontSize: 13.5, color: "var(--green-ink, #166534)" }}>
                <CheckCircle2 size={16} /> Passkey added.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {passkeyState !== "success" && (
                <button
                  onClick={handleAddPasskey}
                  disabled={isPasskeying || finishing}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    width: "100%", padding: "13px 20px",
                    background: "var(--amber-ink, #b45309)", color: "#fff",
                    border: "none", borderRadius: 8, fontSize: 14.5, fontWeight: 600,
                    cursor: isPasskeying || finishing ? "not-allowed" : "pointer",
                    opacity: isPasskeying || finishing ? 0.65 : 1,
                  }}
                >
                  {isPasskeying
                    ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Setting up…</>
                    : <><Fingerprint size={16} /> Add passkey</>}
                </button>
              )}
              <button
                onClick={handleFinish}
                disabled={isPasskeying || finishing}
                style={{
                  width: "100%", padding: "11px 20px",
                  background: "transparent", color: "var(--ink-mute, #6b7280)",
                  border: "1px solid var(--border, #e5e7eb)", borderRadius: 8,
                  fontSize: 13.5, cursor: isPasskeying || finishing ? "not-allowed" : "pointer",
                  opacity: isPasskeying || finishing ? 0.65 : 1,
                }}
              >
                {skipLabel}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
