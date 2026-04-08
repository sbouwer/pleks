"use client"

/**
 * Listing status card — shown on unit detail page.
 * Displays listing URL, stats, status controls.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, ExternalLink, Pause, Play, CheckSquare } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pleks.co.za"

interface Listing {
  id: string
  public_slug: string | null
  status: "draft" | "active" | "paused" | "filled" | "expired"
  asking_rent_cents: number
  available_from: string | null
  views_count: number | null
  applications_count: number | null
  created_at: string
}

interface Props {
  listing: Listing
  unitLabel: string
  propertyName: string
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  active:  { label: "Active",  variant: "default" },
  draft:   { label: "Draft",   variant: "secondary" },
  paused:  { label: "Paused",  variant: "outline" },
  filled:  { label: "Filled",  variant: "secondary" },
  expired: { label: "Expired", variant: "destructive" },
}

export function ListingCard({ listing, unitLabel, propertyName }: Props) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const listingUrl = listing.public_slug ? `${APP_URL}/apply/${listing.public_slug}` : null
  const badge = STATUS_BADGE[listing.status] ?? { label: listing.status, variant: "outline" as const }

  async function copyUrl() {
    if (!listingUrl) return
    await navigator.clipboard.writeText(listingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function updateStatus(newStatus: "active" | "paused" | "filled") {
    setSaving(true)
    const supabase = createClient()
    await supabase.from("listings").update({ status: newStatus }).eq("id", listing.id)
    setSaving(false)
    router.refresh()
  }

  const publishedDate = new Date(listing.created_at)
  const daysSincePublished = Math.floor(
    (new Date().getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Listing — {unitLabel}, {propertyName}
          </CardTitle>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Rent + date */}
        <p className="text-sm text-muted-foreground">
          {formatZAR(listing.asking_rent_cents)}/mo
          {listing.available_from && ` · Available ${new Date(listing.available_from).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`}
          {" "}· Published {daysSincePublished === 0 ? "today" : `${daysSincePublished}d ago`}
        </p>

        {/* Stats */}
        {(listing.views_count != null || listing.applications_count != null) && (
          <p className="text-sm text-muted-foreground">
            {listing.views_count ?? 0} views · {listing.applications_count ?? 0} applications
          </p>
        )}

        {/* URL */}
        {listingUrl && (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded truncate">
              {listingUrl}
            </code>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyUrl}>
              {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" render={<a href={listingUrl} target="_blank" rel="noreferrer" />}>
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {listing.status === "active" && (
            <Button variant="outline" size="sm" onClick={() => updateStatus("paused")} disabled={saving}>
              <Pause className="size-3.5 mr-1.5" />Pause
            </Button>
          )}
          {listing.status === "paused" && (
            <Button variant="outline" size="sm" onClick={() => updateStatus("active")} disabled={saving}>
              <Play className="size-3.5 mr-1.5" />Resume
            </Button>
          )}
          {(listing.status === "active" || listing.status === "paused") && (
            <Button variant="outline" size="sm" onClick={() => updateStatus("filled")} disabled={saving}>
              <CheckSquare className="size-3.5 mr-1.5" />Mark as filled
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
