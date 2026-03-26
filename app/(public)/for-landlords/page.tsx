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

function OwnerStatementSVG() {
  const barHeights = [230, 200, 245, 210, 220, 205]
  const barX = [50, 100, 150, 200, 250, 300]
  const baseY = 260

  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((pct) => (
        <line key={pct} x1="30" y1={baseY - pct * 220} x2="340" y2={baseY - pct * 220} stroke="var(--brand)" strokeOpacity={0.06} strokeWidth={0.5} />
      ))}

      {/* Ground line */}
      <line x1="30" y1={baseY} x2="340" y2={baseY} stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={1} />

      {/* Bars */}
      {barX.map((x, i) => {
        const h = barHeights[i]
        const opacity = i < 2 ? 0.25 : i < 4 ? 0.5 : 0.8
        return (
          <rect key={i} x={x} y={baseY - h} width={30} height={h} rx={3}
            stroke="var(--brand)" strokeOpacity={opacity} strokeWidth={1.2} />
        )
      })}

      {/* Trend line */}
      <polyline
        points={barX.map((x, i) => `${x + 15},${baseY - barHeights[i]}`).join(" ")}
        stroke="var(--brand)" strokeOpacity={0.5} strokeWidth={1.5} fill="none" strokeLinejoin="round"
      />

      {/* Dots on peaks */}
      {barX.map((x, i) => (
        <circle key={i} cx={x + 15} cy={baseY - barHeights[i]} r={3} fill="var(--brand)" fillOpacity={0.6} />
      ))}

      {/* Statement card overlay */}
      <rect x="220" y="170" width="160" height="120" rx="8" fill="var(--background)" fillOpacity={0.85}
        stroke="var(--brand)" strokeOpacity={0.35} strokeWidth={1} />
      {/* Card rows */}
      <line x1="235" y1="195" x2="310" y2="195" stroke="var(--brand)" strokeOpacity={0.25} strokeWidth={1.5} />
      <line x1="330" y1="195" x2="365" y2="195" stroke="var(--brand)" strokeOpacity={0.2} strokeWidth={1.5} />
      <line x1="235" y1="215" x2="300" y2="215" stroke="var(--brand)" strokeOpacity={0.2} strokeWidth={1.5} />
      <line x1="335" y1="215" x2="365" y2="215" stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={1.5} />
      <line x1="235" y1="235" x2="295" y2="235" stroke="var(--brand)" strokeOpacity={0.2} strokeWidth={1.5} />
      <line x1="340" y1="235" x2="365" y2="235" stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={1.5} />
      {/* Total row — thicker */}
      <line x1="235" y1="260" x2="280" y2="260" stroke="var(--brand)" strokeOpacity={0.5} strokeWidth={2} />
      <line x1="325" y1="260" x2="365" y2="260" stroke="var(--brand)" strokeOpacity={0.7} strokeWidth={2} />
      <line x1="235" y1="255" x2="365" y2="255" stroke="var(--brand)" strokeOpacity={0.1} strokeWidth={0.5} />
    </svg>
  )
}

export default function ForLandlordsPage() {
  return (
    <div>
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 pt-24 pb-20 md:pt-36 md:pb-28">
          <div className="md:grid md:grid-cols-[1fr_40%] md:items-center md:gap-8">
            <div>
              <Badge className="bg-brand/20 text-brand border-brand/30 mb-6">
                For landlords
              </Badge>
              <h1 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight mb-6">
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
                render={<Link href="/onboarding" />}
              >
                Get started free <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
            <div className="hidden md:block" style={{ maskImage: "linear-gradient(to right, black 60%, transparent 100%)" }}>
              <OwnerStatementSVG />
            </div>
          </div>
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
            render={<Link href="/onboarding" />}
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
