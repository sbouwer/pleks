"use client"

import { useState, useEffect } from "react"
import { FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WelcomePackBannerProps {
  orgId: string
  landlordId: string
  landlordName?: string
}

export function WelcomePackBanner({ orgId, landlordId, landlordName }: Readonly<WelcomePackBannerProps>) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const key = `pleks_welcome_dismissed_${landlordId}`
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!localStorage.getItem(key)) setVisible(true)
  }, [landlordId])

  function handleDismiss() {
    localStorage.setItem(`pleks_welcome_dismissed_${landlordId}`, "1")
    setVisible(false)
  }

  if (!visible) return null

  const url = `/api/reports/welcome-pack?orgId=${encodeURIComponent(orgId)}&landlordId=${encodeURIComponent(landlordId)}`

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 mb-4">
      <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          Welcome Pack available{landlordName ? ` for ${landlordName}` : ""}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Make a great first impression — send your new client a portfolio overview with
          rental analysis, compliance calendar, and personalised recommendations.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={() => window.open(url, "_blank")}>
          Generate Welcome Pack
        </Button>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
