"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import Link from "next/link"

interface DashboardBannersProps {
  readonly showTrustBanner: boolean
}

export function DashboardBanners({ showTrustBanner }: DashboardBannersProps) {
  if (!showTrustBanner) return null

  return (
    <Card className="mb-6 border-warning/30 bg-warning-bg">
      <CardContent className="flex items-center gap-3 pt-4">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">Deposit management restricted</p>
          <p className="text-xs text-muted-foreground">
            Add your trust account to unlock full deposit management.
          </p>
        </div>
        <Button size="sm" variant="outline" render={<Link href="/settings/compliance" />}>
          Add Account
        </Button>
      </CardContent>
    </Card>
  )
}
