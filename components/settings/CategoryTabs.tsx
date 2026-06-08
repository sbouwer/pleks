"use client"

/**
 * components/settings/CategoryTabs.tsx — the canonical settings category tab strip
 *
 * Notes:  DetailTabs (door-grammar underline) wired to URL ?tab= so tabs deep-link. Used by every
 *         settings category page (My profile, Security, …) — pass the tab set (from a plain tabs.ts) +
 *         the server-resolved active id. The server page owns ?tab and renders the matching body.
 */
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { DetailTabs } from "@/components/detail/DetailTabs"
import type { DetailTab } from "@/lib/detail/types"

export function CategoryTabs({ tabs, current }: Readonly<{ tabs: DetailTab[]; current: string }>) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function setTab(id: string) {
    const next = new URLSearchParams(params)
    next.set("tab", id)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return <DetailTabs tabs={tabs} current={current} onChange={setTab} />
}
