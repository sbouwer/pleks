/**
 * app/not-found.tsx — global 404, rendered in the branded ErrorShell
 *
 * Notes:  Shown for any unmatched route. "Go to my workspace" routes via /auth/resolver (which sends
 *         unauthenticated visitors to login); "Back to home" is the marketing home.
 */
import { SearchX } from "lucide-react"
import { ErrorShell, ErrorAction } from "@/components/layout/ErrorShell"

export const metadata = { title: "Page not found" }

export default function NotFound() {
  return (
    <ErrorShell
      icon={<SearchX className="h-10 w-10" aria-hidden="true" />}
      title="Page not found"
      message="We couldn't find that page. It may have moved, or the link is out of date."
    >
      <ErrorAction href="/auth/resolver">Go to my workspace</ErrorAction>
      <ErrorAction href="/" ghost>Back to home</ErrorAction>
    </ErrorShell>
  )
}
