"use client"

/**
 * components/providers/QueryProvider.tsx — React Query client provider with global defaults
 *
 * Auth:   none — wraps the entire app tree; individual queries enforce their own auth
 * Notes:  Defaults tuned for a throttled DB: data stays "fresh" for 2 min (no refetch on remount within
 *         that window) and cached results are retained for 30 min after the last observer unmounts (gcTime),
 *         so navigating away from a nav category and back reuses the cache instead of re-running slow
 *         queries. Per-query staleTime overrides (portfolio 5–10 min, tier/permissions 5 min) still win.
 *         refetchOnWindowFocus stays on but only fires for queries already past their staleTime.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function QueryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: true,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
