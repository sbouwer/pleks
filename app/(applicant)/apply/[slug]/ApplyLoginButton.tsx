"use client"

/**
 * app/(applicant)/apply/[slug]/ApplyLoginButton.tsx — compact header "Log in" / account affordance for apply
 *
 * Auth:   public (token-gated prefix)
 * Notes:  Existing Pleks tenants can log in to auto-fill their applicant details. Logged OUT → a small "Log in"
 *         button opening a light inline modal (kept inside .pleks-public so it matches the warm theme). Logged
 *         IN → a compact initials avatar with a dropdown ("Signed in as …", details auto-filled, Sign out) so the
 *         header stays uncluttered. Post-login auto-fill of the form from the tenant's record is wired elsewhere.
 */

import { useState } from "react"
import { LogIn, LogOut, X, CheckCircle2, User } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"

export function ApplyLoginButton({ slug, loggedIn, name }: Readonly<{ slug: string; loggedIn?: boolean; name?: string | null }>) {
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  function login() {
    globalThis.location.href = `/login?redirect=${encodeURIComponent(`/apply/${slug}`)}`
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null)
    globalThis.location.href = `/apply/${slug}`
  }

  // Already authenticated — the portal's user-profile icon button (pa-iconbtn + User); the "signed in as /
  // auto-filled / sign out" detail lives in the dropdown so the header isn't cluttered.
  if (loggedIn) {
    return (
      <div className="relative">
        <button type="button" onClick={() => setMenuOpen((o) => !o)} className="pa-iconbtn" aria-label="Account menu" title="Account">
          <User size={15} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[55]" onClick={() => setMenuOpen(false)} aria-hidden />
            <div className="absolute right-0 top-[42px] z-[60] min-w-[220px] overflow-hidden rounded-[var(--r-button)] border border-border bg-popover shadow-lg">
              <div className="border-b border-border px-3 py-2">
                <p className="text-[13px] font-medium text-foreground">Signed in{name ? ` as ${name}` : ""}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" /> Your details are auto-filled
                </p>
              </div>
              <button type="button" onClick={logout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-destructive transition-colors hover:bg-muted">
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-[var(--rule)] px-3 py-1.5 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]"
      >
        <LogIn className="size-4" /> <span className="hidden sm:inline">Log in</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-6 text-[var(--ink)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-base font-semibold">Already a Pleks tenant?</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-[var(--ink-mute)] transition-colors hover:text-[var(--ink)]">
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Log in and we&apos;ll auto-fill your details — current tenants won&apos;t have to re-enter everything. Not a tenant yet? Just apply as normal.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <ActionButton tone="secondary" onClick={() => setOpen(false)}>Apply as new</ActionButton>
              <ActionButton tone="primary" icon={<LogIn className="size-4" />} onClick={login}>Log in</ActionButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
