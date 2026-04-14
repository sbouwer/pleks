"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { MobileSettingsNav } from "@/components/mobile/MobileSettingsNav"

export default function SettingsPage() {
  const router = useRouter()

  useEffect(() => {
    // On desktop (lg+, sidebar visible) redirect to the first settings page.
    // On mobile the CSS lg:hidden wrapper below handles visibility instead.
    if (!globalThis.matchMedia("(max-width: 1023px)").matches) {
      router.replace("/settings/profile")
    }
  }, [router])

  // Mobile: visible drill-down nav. Desktop: hidden by lg:hidden while redirect fires.
  return (
    <div className="lg:hidden">
      <MobileSettingsNav />
    </div>
  )
}
