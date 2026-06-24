"use client"

/**
 * app/(applicant)/apply/[slug]/applyChrome.tsx — shared "begun" state for the apply page chrome.
 *
 * Notes:  The top header (server-rendered) and StepPanel (client) both need to know whether the applicant has
 *         begun (left the "Apply as" landing). This lifts that one flag into a client context so the top-header
 *         unit strip can show ONLY once in the application, while StepPanel still drives the flag.
 */

import { createContext, useContext, useState, type ReactNode } from "react"

interface BegunCtx { begun: boolean; setBegun: (b: boolean) => void }
const Ctx = createContext<BegunCtx>({ begun: false, setBegun: () => {} })

export function ApplyChromeProvider({ initial, children }: Readonly<{ initial: boolean; children: ReactNode }>) {
  const [begun, setBegun] = useState(initial)
  return <Ctx.Provider value={{ begun, setBegun }}>{children}</Ctx.Provider>
}

export function useBegun(): BegunCtx {
  return useContext(Ctx)
}

/** Top-header unit summary — renders ONLY once in the application (the landing shows the unit in the side card). */
export function ApplyUnitStrip({ title, detail }: Readonly<{ title: string; detail: string }>) {
  const { begun } = useBegun()
  // Pre-begin: a flex spacer (not null) so the account controls stay right-aligned in the justify-between row.
  if (!begun) return <span className="flex-1" aria-hidden />
  return (
    <p className="min-w-0 flex-1 truncate text-sm text-[var(--ink-soft)]">
      <span className="font-medium text-[var(--ink)]">{title}</span>
      <span className="hidden md:inline"> · {detail}</span>
    </p>
  )
}
