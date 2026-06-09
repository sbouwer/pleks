"use client"

/**
 * components/auth/CapabilitiesProvider.tsx — client capability context (ADDENDUM_RBAC Phase 4 primitives)
 *
 * Notes:  Hydrated ONCE on mount from getMyCapabilities() (via the fetchMyCapabilities server action) in the
 *         dashboard layout. useCan(cap) reads it. This is AFFORDANCE ONLY — it decides what UI to show/hide.
 *         The boundary is always the server capability check (can()) + RLS. Never gate a mutation on useCan
 *         alone. Capabilities are empty until hydration resolves; gate UX should treat that as "loading".
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { fetchMyCapabilities } from "@/lib/auth/capabilityActions"

const CapabilitiesContext = createContext<readonly string[]>([])

export function CapabilitiesProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [capabilities, setCapabilities] = useState<readonly string[]>([])
  useEffect(() => {
    fetchMyCapabilities().then(setCapabilities).catch(() => {})
  }, [])
  return <CapabilitiesContext.Provider value={capabilities}>{children}</CapabilitiesContext.Provider>
}

/** Client affordance check — UX only; the server capability check + RLS are the boundary. */
export function useCan(capability: string): boolean {
  return useContext(CapabilitiesContext).includes(capability)
}
