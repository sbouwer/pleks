"use client"

/**
 * components/layout/PrivacyPolicyBanner.tsx — Non-blocking Privacy Policy update banner
 *
 * Notes:  Fast path: if the pleks_privacy_version cookie already equals LEGAL_VERSIONS.privacy, stay hidden.
 *         Otherwise the cookie is absent/stale (fresh login, new browser, cleared cookies) — so it falls back to
 *         the DB (/api/legal/accepted-version, the source of truth) before nagging: if the user has in fact
 *         accepted the current version it hydrates the cookie and stays hidden; only a genuinely-behind user
 *         sees the advisory. Dismissed via "Got it" (cookie only — no DB write; banner is advisory).
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
    if (getCookie("pleks_privacy_version") === LEGAL_VERSIONS.privacy) return // cookie current — no nag, no fetch
    // Cookie absent/stale — consult the DB (source of truth) before nagging. A user who accepted the current
    // version on another browser shouldn't be nagged just because this browser lacks the cookie.
    let cancelled = false
    fetch("/api/legal/accepted-version")
      .then((r) => (r.ok ? r.json() : { privacy: null }))
      .then((d: { privacy: string | null }) => {
        if (cancelled) return
        if (d.privacy === LEGAL_VERSIONS.privacy) setCookie("pleks_privacy_version", LEGAL_VERSIONS.privacy)
        else setShow(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
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
