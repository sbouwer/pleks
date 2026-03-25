import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, Download, AlertTriangle, CheckCircle2, Clock } from "lucide-react"

export const metadata = {
  title: "Switch to Pleks | Move your portfolio in a weekend",
}

export default function MigratePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div className="text-center">
        <h1 className="font-heading text-3xl mb-2">Move your portfolio to Pleks</h1>
        <p className="text-muted-foreground">
          Whatever platform you&apos;re on — we&apos;ll help you move your portfolio without losing a day.
        </p>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How it works (1–2 hours)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { week: "Step 1", label: "Import properties & units via CSV", icon: Download },
            { week: "Step 2", label: "Import tenants", icon: Download },
            { week: "Step 3", label: "Set up active leases with opening balances", icon: CheckCircle2 },
            { week: "Step 4", label: "Run one cycle in parallel (invoices + statements)", icon: Clock },
            { week: "Step 5", label: "Cut over — cancel your old system", icon: CheckCircle2 },
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="rounded-full bg-brand/10 p-2 mt-0.5">
                <step.icon className="size-4 text-brand" />
              </div>
              <div>
                <p className="text-sm font-medium">{step.week}</p>
                <p className="text-xs text-muted-foreground">{step.label}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* What you can import */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What you can import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Properties & Units</p>
              <p className="text-xs text-muted-foreground mt-1">
                Addresses, unit numbers, bedrooms, bathrooms, asking rent
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Tenants</p>
              <p className="text-xs text-muted-foreground mt-1">
                Names, contact details, ID numbers, employment info
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Active Leases</p>
              <p className="text-xs text-muted-foreground mt-1">
                Lease dates, rent amounts, deposits held, arrears outstanding
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DebiCheck warning */}
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                Debit order mandates cannot be transferred
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Existing DebiCheck or NAEDO mandates from your current system are
                bank-to-bank agreements that cannot be moved. You&apos;ll need to create
                new DebiCheck mandates for each debit order tenant. This takes 2–5
                business days — plan your cut-over date accordingly.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CSV export from current system */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Using a CSV export from your current system?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Most property management platforms let you export your contacts and lease data as CSV. Pleks auto-detects common column formats and maps them automatically.</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Export your tenants and property data as CSV from your current system</li>
            <li>In Pleks, go to <strong>Settings → Import</strong></li>
            <li>Upload the CSV — Pleks will detect the format</li>
            <li>Review the column mapping and confirm the import</li>
          </ol>
          <p className="text-xs">
            Date formats (DD/MM/YYYY) and SA currency (R 6,600.00) are converted automatically. Not sure how to export? Email support@pleks.co.za — we&apos;ll walk you through it for your specific setup.
          </p>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">What about my historical payment records?</p>
            <p className="text-xs text-muted-foreground mt-1">
              Historical payments from your previous system are not imported — only the
              opening balance as at today. You can note the migration date on each lease.
              Your previous system&apos;s records remain available for reference.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Can I run both systems in parallel?</p>
            <p className="text-xs text-muted-foreground mt-1">
              Yes — we recommend running Pleks alongside your current system for one billing
              cycle to verify everything matches before cutting over.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">What if I have 10+ properties?</p>
            <p className="text-xs text-muted-foreground mt-1">
              For larger portfolios, email your export to support@pleks.co.za and our team
              will do an assisted migration for you.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="text-center">
        <Button size="lg" render={<Link href="/login" />}>
          Get started <ArrowRight className="size-4 ml-2" />
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Free to start. Import your portfolio today.
        </p>
      </div>
    </div>
  )
}
