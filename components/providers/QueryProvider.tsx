"use client"

/**
 * components/providers/QueryProvider.tsx — React Query client provider with global defaults
 *
 * Auth:   none — wraps the entire app tree; individual queries enforce their own auth
 * Notes:  staleTime 60s + refetchOnWindowFocus prevents stale UI without hammering the server
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function QueryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: true,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
