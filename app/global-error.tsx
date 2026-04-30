"use client"

/**
 * app/global-error.tsx — Root error boundary wired to Sentry
 *
 * Notes: Next.js renders this when an unhandled error escapes the root layout.
 *        Must be "use client" and must render its own <html>/<body> since the
 *        root layout is unavailable at this point.
 */
import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center" }}>
        <h2 style={{ marginBottom: "1rem" }}>Something went wrong</h2>
        <button
          onClick={reset}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
