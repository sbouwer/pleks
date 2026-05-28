"use client"

/**
 * app/(tenant)/tenant/_components/ReportIssueLink.tsx — stopPropagation wrapper for the maintenance card
 *
 * Notes: Needed because tenant/page.tsx is a Server Component and cannot pass onClick
 *        to InlineLink (a Client Component). Bakes stopPropagation in so the Server
 *        Component needs no event handler prop.
 */
import { InlineLink } from "@/components/ui/actions"

export function ReportIssueLink() {
  return (
    <InlineLink
      href="/tenant/maintenance/new"
      withArrow={false}
      onClick={(e) => e.stopPropagation()}
    >
      Report issue
    </InlineLink>
  )
}
