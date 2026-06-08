"use client"

/**
 * app/(dashboard)/settings/profile/MyProfileTabs.tsx — My profile tab strip (door-grammar underline)
 *
 * Route:  /settings/profile?tab=personal|contact|signature
 * Notes:  The DetailTabs strip (same underline tabs as suppliers/landlords/tenants), passed into
 *         DetailPageLayout's `tabs` slot. URL-synced + deep-linkable; the server page owns the active
 *         tab (from ?tab) and renders the matching body. PROFILE_TABS is the single source of truth for
 *         the tab set (also used by the page to validate ?tab and title the panel).
 */
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { DetailTabs } from "@/components/detail/DetailTabs"
import { PROFILE_TABS } from "./tabs"

export function MyProfileTabs({ current }: Readonly<{ current: string }>) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function setTab(id: string) {
    const next = new URLSearchParams(params)
    next.set("tab", id)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return <DetailTabs tabs={PROFILE_TABS} current={current} onChange={setTab} />
}
