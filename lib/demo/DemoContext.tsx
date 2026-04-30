"use client"

/**
 * lib/demo/DemoContext.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createContext, useContext } from "react"
import { DEMO_DATA, type DemoData } from "./demoData"

interface DemoContextValue {
  data: DemoData
  isDemoMode: true
}

const DemoContext = createContext<DemoContextValue | null>(null)

export function DemoProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <DemoContext.Provider value={{ data: DEMO_DATA, isDemoMode: true }}>
      {children}
    </DemoContext.Provider>
  )
}

export function useDemoData() {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error("useDemoData must be used inside DemoProvider")
  return ctx
}

export function useDemoAction() {
  return {
    showDemoToast: () => {
      // Dynamic import to avoid circular deps
      import("sonner").then(({ toast }) => {
        toast.info("This is a demo — set up your account to use this feature", {
          action: {
            label: "Set up account",
            onClick: () => { globalThis.location.href = "/onboarding?setup=true" },
          },
        })
      })
    },
  }
}
