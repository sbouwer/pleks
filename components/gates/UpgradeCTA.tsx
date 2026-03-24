"use client"

import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"

const featureLabels: Record<string, string> = {
  bank_recon: "Bank Reconciliation",
  owner_statements: "Owner Statements",
  debicheck: "DebiCheck Collections",
  arrears_automation: "Arrears Automation",
  reports_full: "Full Reporting Suite",
  hoa_module: "HOA Management",
  contractor_portal: "Contractor Portal",
  opus_ai: "AI Legal Documents",
  application_pipeline: "Application Pipeline",
  municipal_bills: "Municipal Bill Extraction",
  lease_automation: "Lease Automation",
  fitscore_included: "FitScore Screening",
}

export function UpgradeCTA({ feature }: Readonly<{ feature: string }>) {
  const label = featureLabels[feature] || feature.replaceAll("_", " ")

  return (
    <Card className="border-dashed border-brand/30 bg-brand-dim/30">
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <div className="rounded-xl bg-brand-dim p-3 mb-4">
          <Lock className="h-6 w-6 text-brand" />
        </div>
        <h3 className="text-lg font-medium mb-1 capitalize">{label}</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Upgrade your plan to access this feature.
        </p>
        <Button variant="default" render={<Link href="/settings" />}>
          Upgrade Plan
        </Button>
      </CardContent>
    </Card>
  )
}
