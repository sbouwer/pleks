"use client"

/**
 * components/layout/PrivacyPolicyBanner.tsx — Non-blocking Privacy Policy update banner
 *
 * Notes:  Reads pleks_privacy_version cookie (non-httpOnly) and compares to LEGAL_VERSIONS.privacy.
 *         Shown when the accepted version is outdated. Dismissed by clicking "Got it" which
 *         sets the cookie to the current version (no DB write — banner is advisory only).
 *         ToS updates are handled separately via the blocking proxy.ts checkTosGate.
 */
import { useState, useEffect } from "react"
import Link from "next/link"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string) {
  const secure = location.protocol === "https:" ? "; Secure" : ""
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

export function PrivacyPolicyBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const accepted = getCookie("pleks_privacy_version")
    setShow(accepted !== LEGAL_VERSIONS.privacy)
  }, [])

  function dismiss() {
    setCookie("pleks_privacy_version", LEGAL_VERSIONS.privacy)
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 flex items-center justify-between gap-4">
      <span>
        Our{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-blue-700">
          Privacy Policy
        </Link>{" "}
        has been updated ({LEGAL_VERSIONS.privacy}). Please review the changes.
      </span>
      <button
        onClick={dismiss}
        className="shrink-0 text-blue-700 hover:text-blue-900 underline underline-offset-2"
      >
        Got it
      </button>
    </div>
  )
}
