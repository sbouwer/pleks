"use client"

/**
 * app/(auth)/accept-terms/page.tsx — ToS version-update acceptance gate
 *
 * Route:  /accept-terms?next={returnPath}
 * Auth:   authenticated (manifest: skipOrgCheck — user has no org yet during onboarding edge case)
 * Data:   none at render; acceptCurrentTerms() server action writes tos_acceptances + sets cookie
 * Notes:  Shown when pleks_tos_version cookie is missing or stale (proxy.ts checkTosGate).
 *         No dashboard chrome — rendered in (auth) layout.
 */
import { useSearchParams } from "next/navigation"
import { useTransition, Suspense } from "react"
import { acceptCurrentTerms } from "./actions"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"

function AcceptTermsForm() {
  const searchParams = useSearchParams()
  const nextPath = searchParams.get("next") ?? "/dashboard"
  const [isPending, startTransition] = useTransition()

  function handleAccept() {
    startTransition(async () => {
      await acceptCurrentTerms(nextPath)
    })
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Updated Terms of Service
      </h1>
      <p style={{ color: "var(--ink-mute)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
        We&rsquo;ve updated our Terms of Service. You&rsquo;re now on{" "}
        <strong>{LEGAL_VERSIONS.terms}</strong>. Please review and accept to continue.
      </p>

      <ul style={{ marginBottom: "1.5rem", paddingLeft: "1.25rem", lineHeight: 1.8, color: "var(--ink-mute)" }}>
        <li>Cancellation and data retention terms (§04)</li>
        <li>Subscription pause and dormancy policy (§10)</li>
        <li>Your data access rights during and after cancellation</li>
      </ul>

      <p style={{ marginBottom: "1.5rem", fontSize: "0.875rem", color: "var(--ink-mute)" }}>
        Read the full{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
          Terms of Service {LEGAL_VERSIONS.terms}
        </a>
        .
      </p>

      <button
        onClick={handleAccept}
        disabled={isPending}
        style={{
          width: "100%",
          padding: "0.75rem 1.5rem",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: "0.5rem",
          fontWeight: 600,
          fontSize: "1rem",
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? "Accepting…" : "I accept the updated Terms of Service"}
      </button>
    </div>
  )
}

export default function AcceptTermsPage() {
  return (
    <Suspense>
      <AcceptTermsForm />
    </Suspense>
  )
}
