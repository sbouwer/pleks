"use client"

/**
 * app/(auth)/login/first-setup/page.tsx — First-login setup wizard
 *
 * Route:  /login/first-setup
 * Auth:   Authenticated; no AAL2 requirement (accessible before MFA enrolment)
 * Notes:  Shown to first-time users by the resolver when everAccepted=false and no MFA
 *         factor exists. Steps: Welcome → ToS acceptance → MFA handoff to the enrol chooser
 *         (passkey or authenticator; FIX-70).
 *         Returns to this page at ?wizard_step=4 after MFA enrolment completes,
 *         showing a first-property CTA before navigating to the dashboard.
 */

import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Shield, CheckCircle2, Building2 } from "lucide-react"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import { MARKETING_URL } from "@/lib/env"

// ── Shared button styles ──────────────────────────────────────────────────────

const BTN_PRIMARY: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  gap: 8, width: "100%", padding: "10px 20px", borderRadius: 6, border: "none",
  background: "oklch(0.68 0.14 65)", color: "oklch(0.18 0.012 260)",
  fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "opacity .15s",
  textDecoration: "none",
}

const BTN_GHOST: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  gap: 8, width: "100%", padding: "10px 20px", borderRadius: 6,
  border: "1px solid var(--border, #ddd)",
  background: "transparent", color: "inherit",
  fontSize: 14, fontWeight: 500, cursor: "pointer",
  textDecoration: "none",
}

// ── Step dots ─────────────────────────────────────────────────────────────────

function dotColor(i: number, current: number): string {
  if (i < current)  return "oklch(0.68 0.14 65 / 0.35)"
  if (i === current) return "oklch(0.68 0.14 65)"
  return "var(--border, #ddd)"
}

function StepDots({ current }: Readonly<{ current: number }>) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(i, current) }}
        />
      ))}
    </div>
  )
}

// ── Step 1 — Welcome ──────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: Readonly<{ onNext: () => void }>) {
  return (
    <div style={{ textAlign: "center" }}>
      <StepDots current={0} />
      <div style={{ fontSize: 42, marginBottom: 16, lineHeight: 1 }}>👋</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
        Welcome to Pleks
      </h1>
      <p style={{ fontSize: 14, color: "var(--ink-soft, #666)", margin: "0 0 32px", lineHeight: 1.6 }}>
        Let&apos;s get your account set up. We&apos;ll cover your agreement, then secure
        your account with two-factor authentication.
      </p>
      <button style={BTN_PRIMARY} onClick={onNext}>
        Get started
      </button>
    </div>
  )
}

// ── Step 2 — Terms of Service ─────────────────────────────────────────────────

function TosStep({ onAccepted }: Readonly<{ onAccepted: () => void }>) {
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setAccepting(true)
    setError(null)
    try {
      const res = await fetch("/api/legal/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tosVersion:     LEGAL_VERSIONS.terms,
          privacyVersion: LEGAL_VERSIONS.privacy,
        }),
      })
      if (!res.ok) throw new Error("Acceptance failed")
      onAccepted()
    } catch {
      setError("Something went wrong. Please try again.")
      setAccepting(false)
    }
  }

  return (
    <div>
      <StepDots current={1} />
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
        Terms &amp; Privacy Policy
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft, #666)", margin: "0 0 20px", lineHeight: 1.6 }}>
        Before accessing your workspace, please review and accept our terms of service
        and privacy policy.
      </p>
      <div style={{ display: "flex", gap: 12, marginBottom: 24, fontSize: 13 }}>
        <a
          href={`${MARKETING_URL}/terms`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--amber-ink, #c47600)", textDecoration: "underline" }}
        >
          Terms of Service {LEGAL_VERSIONS.terms}
        </a>
        <span style={{ color: "var(--ink-faint, #bbb)" }}>·</span>
        <a
          href={`${MARKETING_URL}/privacy`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--amber-ink, #c47600)", textDecoration: "underline" }}
        >
          Privacy Policy {LEGAL_VERSIONS.privacy}
        </a>
      </div>
      {error && (
        <p style={{ fontSize: 13, color: "var(--danger, #c00)", marginBottom: 12 }}>{error}</p>
      )}
      <button
        style={{ ...BTN_PRIMARY, opacity: accepting ? 0.7 : 1, cursor: accepting ? "default" : "pointer" }}
        onClick={() => void handleAccept()}
        disabled={accepting}
      >
        {accepting ? "Saving…" : "I accept the Terms of Service and Privacy Policy"}
      </button>
      <p style={{ fontSize: 12, color: "var(--ink-faint, #bbb)", textAlign: "center", marginTop: 12, marginBottom: 0 }}>
        You cannot access Pleks without accepting these terms.
      </p>
    </div>
  )
}

// ── Step 3 — MFA setup handoff ────────────────────────────────────────────────

function MfaStep() {
  const mfaReturnUrl = "/login/first-setup?wizard_step=4"

  return (
    <div>
      <StepDots current={2} />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <Shield style={{ width: 40, height: 40, color: "oklch(0.68 0.14 65)" }} />
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", textAlign: "center", letterSpacing: "-0.01em" }}>
        Secure your account
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft, #666)", margin: "0 0 28px", lineHeight: 1.6, textAlign: "center" }}>
        Two-factor authentication is required for the Pleks workspace. Set up a passkey
        (recommended) or an authenticator app — whichever suits you.
      </p>
      <Link
        href={`/settings/security/enrol?mandatory=true&redirect=${encodeURIComponent(mfaReturnUrl)}`}
        style={BTN_PRIMARY}
      >
        Secure my account
      </Link>
    </div>
  )
}

// ── Step 4 — Done CTA ─────────────────────────────────────────────────────────

function CtaStep({ finalDestination }: Readonly<{ finalDestination: string }>) {
  return (
    <div style={{ textAlign: "center" }}>
      <CheckCircle2 style={{ width: 48, height: 48, color: "oklch(0.55 0.15 145)", margin: "0 auto 16px" }} />
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
        You&apos;re all set!
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft, #666)", margin: "0 0 28px", lineHeight: 1.6 }}>
        Your account is secured and ready. Create your first property now, or explore
        the dashboard first.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link href="/properties/new" style={BTN_PRIMARY}>
          <Building2 style={{ width: 16, height: 16 }} />
          Create first property
        </Link>
        <Link href={finalDestination} style={BTN_GHOST}>
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

function FirstSetupContent() {
  const searchParams = useSearchParams()
  const wizardStep   = searchParams.get("wizard_step")
  const redirectParam = searchParams.get("redirect")
  const finalDestination = redirectParam ? safeRedirect(redirectParam) : "/dashboard"

  const [step, setStep] = useState<1 | 2 | 3 | 4>(wizardStep === "4" ? 4 : 1)

  return (
    <div
      style={{
        flex: 1,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "32px 20px",
      }}
    >
      <div
        style={{
          background:   "var(--surface-base, #fff)",
          borderRadius: 10,
          boxShadow:    "0 8px 40px rgba(0,0,0,0.10)",
          maxWidth:     448,
          width:        "100%",
          padding:      "36px 36px 32px",
        }}
      >
        {step === 1 && <WelcomeStep onNext={() => setStep(2)} />}
        {step === 2 && <TosStep onAccepted={() => setStep(3)} />}
        {step === 3 && <MfaStep />}
        {step === 4 && <CtaStep finalDestination={finalDestination} />}
      </div>
    </div>
  )
}

export default function FirstSetupPage() {
  return (
    <Suspense>
      <FirstSetupContent />
    </Suspense>
  )
}
