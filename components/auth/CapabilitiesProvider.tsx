"use client"

/**
 * components/auth/CapabilitiesProvider.tsx — client capability context (ADDENDUM_RBAC Phase 4 primitives)
 *
 * Notes:  Hydrated ONCE on mount from getMyCapabilities() (via the fetchMyCapabilities server action) in the
 *         dashboard layout. useCan(cap) reads it. This is AFFORDANCE ONLY — it decides what UI to show/hide.
 *         The boundary is always the server capability check (can()) + RLS. Never gate a mutation on useCan
 *         alone. Capabilities are empty until hydration resolves; gate UX should treat that as "loading".
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { fetchMyCapabilities } from "@/lib/auth/capabilityActions"

const CapabilitiesContext = createContext<{ caps: readonly string[]; hydrated: boolean }>({ caps: [], hydrated: false })

export function CapabilitiesProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [caps, setCaps] = useState<readonly string[]>([])
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    fetchMyCapabilities().then((c) => { setCaps(c); setHydrated(true) }).catch(() => setHydrated(true))
  }, [])
  const value = useMemo(() => ({ caps, hydrated }), [caps, hydrated])
  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>
}

/**
 * Client affordance check — UX only; the server capability check + RLS are the boundary. Fail-OPEN while
 * capabilities are still hydrating, so a legitimate user never sees nav/items flash away on load (a
 * non-capable user briefly over-sees an item that then hides — harmless, the route/action still guard).
 */
export function useCan(capability: string): boolean {
  const { caps, hydrated } = useContext(CapabilitiesContext)
  return !hydrated || caps.includes(capability)
}
