"use client"

/**
 * app/(dashboard)/leases/new/LeaseInProgressNotice.tsx — shown instead of the lease wizard when a colleague is
 *                                                         already creating the lease for this application
 *
 * Route:  /leases/new?application=<id>
 * Auth:   parent page gates on getServerOrgMembership
 * Notes:  Arc 2 (Stéan 2026-10-09). The marker is advisory, so the agent may take over — the page then retakes it
 *         with take_over=1. Whoever presses Create first still wins the one-lease claim.
 */
import { useRouter } from "next/navigation"
import { ActionButton } from "@/components/ui/actions"

export function LeaseInProgressNotice({
  applicationId, holderName, startedAgo,
}: Readonly<{ applicationId: string; holderName: string | null; startedAgo: string }>) {
  const router = useRouter()
  const who = holderName ?? "A colleague"
  return (
    <div className="mx-auto mt-16 max-w-lg border border-[var(--border)] p-6">
      <h1 className="text-lg font-semibold">Lease already in progress</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {who} is currently creating a lease for this application (started {startedAgo}).
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Taking over lets you continue instead. If they press Create first, theirs is the lease.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <ActionButton tone="secondary" onClick={() => router.back()}>Go back</ActionButton>
        <ActionButton tone="primary" onClick={() => router.replace(`/leases/new?application=${applicationId}&take_over=1`)}>
          Take over
        </ActionButton>
      </div>
    </div>
  )
}
