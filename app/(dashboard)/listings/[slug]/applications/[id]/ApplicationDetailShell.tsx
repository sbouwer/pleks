/**
 * app/(dashboard)/listings/[slug]/applications/[id]/ApplicationDetailShell.tsx
 * Client tab-shell for the canonical application detail page: owns the active-tab state, URL-synced via ?tab=,
 * and renders DetailPageLayout + DetailTabs. Panels are server-rendered and passed in (switched client-side, no
 * refetch). Initial tab comes from the server (so no useSearchParams Suspense boundary needed).
 */
"use client"
import { useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { DetailPageLayout } from "@/components/detail/DetailPageLayout"
import { DetailTabs } from "@/components/detail/DetailTabs"
import type { DetailFact, DetailStatus, DetailTab } from "@/lib/detail/types"

export function ApplicationDetailShell({
  backHref, title, status, badge, sub, facts, actions, tabs, panels, initialTab,
}: Readonly<{
  backHref: string; title: string; status: DetailStatus; badge?: string; sub?: string
  facts: DetailFact[]; actions: ReactNode; tabs: DetailTab[]; panels: Record<string, ReactNode>; initialTab: string
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const [active, setActive] = useState(tabs.some((t) => t.id === initialTab) ? initialTab : tabs[0].id)

  function go(id: string) {
    setActive(id)
    router.replace(`${pathname}?tab=${id}`, { scroll: false })
  }

  return (
    <DetailPageLayout
      category="Applications"
      backHref={backHref}
      title={title}
      status={status}
      badge={badge}
      sub={sub}
      facts={facts}
      actions={actions}
      tabs={<DetailTabs tabs={tabs} current={active} onChange={go} />}
    >
      {panels[active] ?? panels[tabs[0].id]}
    </DetailPageLayout>
  )
}
