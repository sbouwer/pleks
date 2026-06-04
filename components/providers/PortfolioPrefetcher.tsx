"use client"

/**
 * components/providers/PortfolioPrefetcher.tsx — warms the portfolio list caches in the background
 *
 * Auth:   client island; the prefetched server actions run through gateway() (agent read)
 * Data:   React Query cache for tenants / landlords / contractors / leases
 * Notes:  Warms caches so navigating to those list pages is instant. CRITICAL: it does this
 *         DEFERRED (requestIdleCallback) and SEQUENTIALLY — firing all four in parallel on every
 *         mount stampedes the DB with concurrent reads, which on a small instance self-throttles
 *         into multi-second stalls (and cascaded the /login bounce). One at a time, after the page
 *         is interactive, never competing with the active page's own fetches. Best-effort: a failed
 *         warm is swallowed (the list page will fetch on navigation anyway).
 */
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useOrg } from "@/hooks/useOrg"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import {
  fetchTenantsAction, fetchLandlordsAction,
  fetchContractorsAction, fetchLeasesAction,
} from "@/lib/queries/portfolioActions"

export function PortfolioPrefetcher() {
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!orgId) return
    let cancelled = false

    const warmers = [
      () => queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId), queryFn: () => fetchTenantsAction(orgId), staleTime: STALE_TIME.tenants }),
      () => queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId), queryFn: () => fetchLandlordsAction(orgId), staleTime: STALE_TIME.landlords }),
      () => queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId), queryFn: () => fetchContractorsAction(orgId), staleTime: STALE_TIME.contractors }),
      () => queryClient.prefetchQuery({ queryKey: PORTFOLIO_QUERY_KEYS.leases(orgId), queryFn: () => fetchLeasesAction(orgId), staleTime: STALE_TIME.leases }),
    ]

    async function warmSequentially() {
      for (const warm of warmers) {
        if (cancelled) return
        try { await warm() } catch { /* best-effort — the list page fetches on navigation */ }
      }
    }

    // Defer to idle so warming never competes with the initial render's own queries.
    const w = globalThis as unknown as {
      requestIdleCallback?: (cb: () => void) => number
      cancelIdleCallback?: (id: number) => void
    }
    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(() => { void warmSequentially() })
    } else {
      timeoutId = setTimeout(() => { void warmSequentially() }, 2000)
    }

    return () => {
      cancelled = true
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [orgId, queryClient])

  return null
}
