"use client"

/**
 * app/(applicant)/apply/[slug]/preview/ApplyLoginButton.tsx — header "Log in" affordance for the apply preview
 *
 * Auth:   public (token-gated prefix) — preview only
 * Notes:  Existing Pleks tenants can log in to auto-fill their applicant details instead of re-entering
 *         everything. Opens a light inline modal (kept inside the .pleks-public surface so it matches the
 *         warm theme, unlike a portalled dialog). "Log in" routes through /login with a redirect back here;
 *         the post-login auto-fill of the applicant form from the tenant's contact record is the follow-up.
 */

import { useState } from "react"
import { LogIn, X } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"

export function ApplyLoginButton({ slug }: Readonly<{ slug: string }>) {
  const [open, setOpen] = useState(false)
  function login() {
    globalThis.location.href = `/login?redirect=${encodeURIComponent(`/apply/${slug}/preview`)}`
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-[var(--rule)] px-3 py-1.5 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]"
      >
        <LogIn className="size-4" /> Log in
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
