"use client"

/**
 * app/error.tsx — route-level error boundary, rendered in the branded ErrorShell
 *
 * Notes:  Catches errors thrown in routes under the root layout (global-error.tsx still backstops errors
 *         in the root layout itself, where globals/FocusShell are unavailable). Reports to Sentry; offers
 *         a reset ("Try again") plus a route back to the workspace.
 */
import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { TriangleAlert } from "lucide-react"
import { ErrorShell, ErrorAction } from "@/components/layout/ErrorShell"

export default function RouteError({
  error, reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => { Sentry.captureException(error) }, [error])

  return (
    <ErrorShell
      icon={<TriangleAlert className="h-10 w-10" aria-hidden="true" />}
      title="Something went wrong"
      message="That didn't load as expected. Your data is safe — try again, or head back to your workspace."
    >
      <ErrorAction onClick={reset}>Try again</ErrorAction>
      <ErrorAction href="/auth/resolver" ghost>Go to my workspace</ErrorAction>
    </ErrorShell>
  )
}
