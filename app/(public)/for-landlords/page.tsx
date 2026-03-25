import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  Check,
  BarChart3,
  Shield,
  FileSpreadsheet,
  Wrench,
  Eye,
} from "lucide-react"

export const metadata = {
  title: "For Landlords | Track Your Rental Portfolio with Pleks",
  description:
    "Real-time owner statements, deposit compliance tracking, SARS-ready annual summaries, and full maintenance visibility. Know exactly what is happening with your property.",
}

export default function ForLandlordsPage() {
  return (
    <div>
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 pt-24 pb-20 md:pt-36 md:pb-28">
          <Badge className="bg-brand/20 text-brand border-brand/30 mb-6">
            For landlords
          </Badge>
          <h1 className="font-heading text-5xl md:text-7xl leading-[1.05] tracking-tight mb-6">
            Know exactly what&apos;s happening
            <br />
            <span className="text-brand">with your property.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            Real-time statements. Deposit compliance from day one. SARS-ready
            annual summaries. Full maintenance visibility. No more wondering
            where your money is.
          </p>
          <Button
            size="lg"
            className="text-base h-13 px-8"
            render={<Link href="/login" />}
          >
            Get started free <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </section>

      {/* ─── Owner portal ─── */}
      <section className="bg-surface/50 py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Eye className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              Your owner portal
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            See rent collected, expenses paid, and net-to-owner — live. Every
            transaction is itemised. No waiting until month-end for a PDF you
            can&apos;t query.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              "Rent collected",
              "Expenses itemised",
              "Net to owner",
              "Live — not monthly",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2.5 rounded-lg bg-surface p-3 text-sm"
              >
                <Check className="size-4 text-brand shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Deposit compliance (RHA) ─── */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              Deposit compliance
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            The Rental Housing Act requires deposits to be held in an
            interest-bearing account and refunded within strict timelines. Pleks
            tracks this from day one — so you never miss a deadline.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-l-4 border-l-brand bg-surface">
              <CardContent className="pt-6 space-y-2">
                <h3 className="font-heading text-xl">Tracked from day one</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Deposit amount, receipt date, and interest-bearing account
                  details are captured when the lease is created.
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-brand bg-surface">
              <CardContent className="pt-6 space-y-2">
                <h3 className="font-heading text-xl">14/21-day timers</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Automatic countdown timers after lease ends. You get reminders
                  before the 14-day inspection and 21-day refund deadlines.
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-brand bg-surface">
              <CardContent className="pt-6 space-y-2">
                <h3 className="font-heading text-xl">Itemised deductions</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  If deductions are required, they are itemised with photos and
                  inspection references — Tribunal-ready if challenged.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── SARS annual summary ─── */}
      <section className="bg-surface/50 py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <FileSpreadsheet className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              SARS annual summary
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            One-click download. Rental income, deductible expenses, management
            fees, and net profit — ready to hand to your accountant or file
            directly.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              "Rental income",
              "Deductible expenses",
              "Management fees",
              "Net profit",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2.5 rounded-lg bg-surface p-3 text-sm"
              >
                <Check className="size-4 text-brand shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Maintenance visibility ─── */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Wrench className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              Maintenance visibility
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            Every work order is visible in your portal. Quotes require your
            approval before any work begins. Invoices are stored against the
            property so nothing gets lost.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              "Every work order visible",
              "Quote approval required",
              "Invoices stored",
              "Full audit trail",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2.5 rounded-lg bg-surface p-3 text-sm"
              >
                <Check className="size-4 text-brand shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Start free CTA ─── */}
      <section className="bg-brand-dim py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <BarChart3 className="size-10 text-brand mx-auto mb-4" />
          <h2 className="font-heading text-3xl md:text-4xl mb-4">
            Own 1 property? Start on the free Owner plan.
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            One property, one user, everything you need to track your rental.
            Upgrade anytime as your portfolio grows.
          </p>
          <Button
            size="lg"
            className="text-base h-13 px-8"
            render={<Link href="/login" />}
          >
            Start free <ArrowRight className="ml-2 size-4" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            No credit card required. Free forever for 1 unit.
          </p>
        </div>
      </section>
    </div>
  )
}
