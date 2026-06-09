"use client"

/**
 * components/layout/ErrorShell.tsx — branded error/empty-state surface (the "iconic page")
 *
 * Notes:  One card chrome for every reachable error surface (404, route errors, 403) — the same FocusShell
 *         backdrop + fs-panel card as the login screen (wordmark, amber dot + doorsill), with a per-error
 *         icon, title, message, and action buttons. Use ErrorAction for the buttons (href = navigate,
 *         onClick = e.g. an error-boundary reset). NOTE: app/global-error.tsx can't use this (the root
 *         layout + globals.css are gone when it renders) — it keeps its own inline-branded fallback.
 */
import Link from "next/link"
import type { ReactNode } from "react"
import { FocusShell } from "./FocusShell"
import { AccentBracket } from "@/components/ui/AccentBracket"

export function ErrorShell({
  icon, title, message, children,
}: Readonly<{ icon?: ReactNode; title: string; message: string; children: ReactNode }>) {
  // .pleks-public scopes the warm focus-shell palette (--paper-raised, --ink, …). ErrorShell can be hit from
  // the dark dashboard/root where that scope is otherwise absent — without it the card renders see-through.
  return (
    <div className="pleks-public">
    <FocusShell>
      <div className="fs-panel" style={{ maxWidth: 400, textAlign: "center" }}>
        <span className="fs-knob" aria-hidden="true" />
        <span className="pub-wordmark" aria-label="Pleks" style={{ justifyContent: "center", fontSize: 22, display: "inline-flex" }}>
          <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
        </span>

        {/* Warm focus-shell vars, not theme Tailwind colours — this card is a forced light surface even when
            the error is hit from the dark dashboard (text-muted-foreground would wash out there). */}
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {icon ? <div style={{ marginBottom: 12, color: "var(--ink-soft)" }}>{icon}</div> : null}
          <h1 style={{ marginBottom: 6, fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{title}</h1>
          <p className="fs-subhead" style={{ maxWidth: 300, margin: "0 auto" }}>{message}</p>
        </div>

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
      </div>
    </FocusShell>
    </div>
  )
}

/** A primary (amber-doorsill) or ghost action. Pass href to navigate, or onClick (e.g. boundary reset). */
export function ErrorAction({
  href, onClick, ghost = false, children,
}: Readonly<{ href?: string; onClick?: () => void; ghost?: boolean; children: ReactNode }>) {
  const cls = ghost ? "fs-cta-ghost" : "fs-cta"
  const inner = ghost ? children : (
    <>
      <span className="fs-cta-bar" aria-hidden="true" />
      <span className="fs-cta-label">{children}</span>
      <span className="fs-cta-arrow" aria-hidden="true">→</span>
    </>
  )
  if (href) return <Link href={href} className={cls}>{inner}</Link>
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>
}
