"use client"

/**
 * components/legal/ConsentGateModal.tsx — hard consent gate for ToS / Privacy updates
 *
 * Notes:  Hard modal — no dismiss, no escape, no backdrop click. Consent acceptance
 *         is a compliance-grade legal artifact (D-AUTH-RESOLVER-17).
 *         Acceptance writes via POST /api/legal/accept-terms, which updates server-side
 *         cookies and the tos_acceptances table.
 *         Mount via <ConsentGate /> wrapper that reads the ?pending_consent query param.
 */
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import type { ChangeHighlight } from "@/lib/legal/changelog"

interface ConsentGateModalProps {
  changeHighlights?: ChangeHighlight[]
}

export function ConsentGateModal({ changeHighlights }: ConsentGateModalProps) {
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const acceptBtnRef = useRef<HTMLButtonElement>(null)

  // Focus trap — lock focus inside modal
  useEffect(() => {
    acceptBtnRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation() }
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [])

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

      // Remove the ?pending_consent param and reload without triggering a full nav
      const url = new URL(globalThis.location.href)
      url.searchParams.delete("pending_consent")
      globalThis.history.replaceState(null, "", url.toString())
      // Force a re-render by reloading — simplest way to unmount since
      // the modal reads the query param from the URL on mount.
      globalThis.location.reload()
    } catch {
      setError("Something went wrong. Please try again.")
      setAccepting(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position:   "fixed",
          inset:      0,
          background: "rgba(0,0,0,0.6)",
          zIndex:     9999,
        }}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-gate-title"
        style={{
          position:   "fixed",
          inset:      0,
          zIndex:     10000,
          display:    "flex",
          alignItems: "center",
          justifyContent: "center",
          padding:    "20px",
        }}
      >
        <div
          style={{
            background:   "var(--surface-base, #fff)",
            borderRadius: 10,
            boxShadow:    "0 24px 64px rgba(0,0,0,0.24)",
            maxWidth:     480,
            width:        "100%",
            padding:      "32px 32px 28px",
          }}
        >
          <h2
            id="consent-gate-title"
            style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.01em" }}
          >
            We&apos;ve updated our Terms &amp; Privacy Policy
          </h2>

          <p style={{ fontSize: 13.5, color: "var(--ink-soft, #666)", margin: "0 0 20px" }}>
            To continue using Pleks, please review and accept the updated documents.
          </p>

          {changeHighlights && changeHighlights.length > 0 && (
            <div
              style={{
                background:   "var(--surface-raised, #f5f5f5)",
                borderRadius: 6,
                padding:      "12px 14px",
                marginBottom: 20,
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", color: "var(--ink-mute, #888)" }}>
                WHAT CHANGED
              </p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {changeHighlights.map((h, i) => (
                  <li key={i} style={{ fontSize: 13, color: "var(--ink-soft, #666)", marginBottom: 4 }}>
                    <strong>{h.section}</strong> — {h.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginBottom: 16, fontSize: 13 }}>
            <Link
              href="/terms"
              target="_blank"
              style={{ color: "var(--amber-ink, #c47600)", textDecoration: "underline" }}
            >
              Terms of Service {LEGAL_VERSIONS.terms}
            </Link>
            <span style={{ color: "var(--ink-faint, #bbb)" }}>·</span>
            <Link
              href="/privacy"
              target="_blank"
              style={{ color: "var(--amber-ink, #c47600)", textDecoration: "underline" }}
            >
              Privacy Policy {LEGAL_VERSIONS.privacy}
            </Link>
          </div>

          {error && (
            <p style={{ fontSize: 13, color: "var(--danger, #c00)", marginBottom: 12 }}>{error}</p>
          )}

          <button
            ref={acceptBtnRef}
            onClick={() => void handleAccept()}
            disabled={accepting}
            style={{
              width:          "100%",
              padding:        "10px 20px",
              borderRadius:   6,
              border:         "none",
              background:     "oklch(0.68 0.14 65)",
              color:          "oklch(0.18 0.012 260)",
              fontSize:       14,
              fontWeight:     600,
              cursor:         accepting ? "default" : "pointer",
              opacity:        accepting ? 0.7 : 1,
              transition:     "opacity .15s",
            }}
          >
            {accepting ? "Saving…" : "I accept the updated Terms &amp; Privacy Policy"}
          </button>

          <p style={{ fontSize: 12, color: "var(--ink-faint, #bbb)", textAlign: "center", marginTop: 12, marginBottom: 0 }}>
            You cannot access Pleks without accepting the updated terms.
          </p>
        </div>
      </div>
    </>
  )
}
