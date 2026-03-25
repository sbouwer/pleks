import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  Check,
  Smartphone,
  FileText,
  Bot,
  Upload,
  CreditCard,
  Banknote,
} from "lucide-react"

export const metadata = {
  title: "For Property Agents | Pleks",
  description:
    "Built by someone who has placed tenants, chased arrears, inspected units, and sat in Tribunal. Then rebuilt the software to fix what was broken.",
}

function FitScoreSVG() {
  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Card container */}
      <rect x="20" y="40" width="280" height="240" rx="12" stroke="var(--brand)" strokeOpacity={0.25} strokeWidth={1} />

      {/* Column headers */}
      <line x1="40" y1="65" x2="100" y2="65" stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={2} />
      <line x1="180" y1="65" x2="220" y2="65" stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={2} />
      <line x1="240" y1="65" x2="270" y2="65" stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={2} />
      <line x1="40" y1="75" x2="280" y2="75" stroke="var(--brand)" strokeOpacity={0.08} strokeWidth={0.5} />

      {/* Row 1 */}
      <circle cx="50" cy="100" r="10" stroke="var(--brand)" strokeOpacity={0.4} strokeWidth={1} />
      <line x1="68" y1="97" x2="130" y2="97" stroke="var(--brand)" strokeOpacity={0.3} strokeWidth={2} />
      <line x1="68" y1="105" x2="110" y2="105" stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={1.5} />
      <rect x="180" y="93" width="90" height="6" rx="3" stroke="var(--brand)" strokeOpacity={0.1} strokeWidth={0.5} />
      <rect x="180" y="93" width="77" height="6" rx="3" fill="var(--brand)" fillOpacity={0.3} />

      {/* Row 2 */}
      <circle cx="50" cy="145" r="10" stroke="var(--brand)" strokeOpacity={0.5} strokeWidth={1} />
      <line x1="68" y1="142" x2="140" y2="142" stroke="var(--brand)" strokeOpacity={0.3} strokeWidth={2} />
      <line x1="68" y1="150" x2="105" y2="150" stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={1.5} />
      <rect x="180" y="138" width="90" height="6" rx="3" stroke="var(--brand)" strokeOpacity={0.1} strokeWidth={0.5} />
      <rect x="180" y="138" width="56" height="6" rx="3" fill="var(--brand)" fillOpacity={0.4} />

      {/* Row 3 */}
      <circle cx="50" cy="190" r="10" stroke="var(--brand)" strokeOpacity={0.7} strokeWidth={1} />
      <line x1="68" y1="187" x2="125" y2="187" stroke="var(--brand)" strokeOpacity={0.3} strokeWidth={2} />
      <line x1="68" y1="195" x2="115" y2="195" stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={1.5} />
      <rect x="180" y="183" width="90" height="6" rx="3" stroke="var(--brand)" strokeOpacity={0.1} strokeWidth={0.5} />
      <rect x="180" y="183" width="82" height="6" rx="3" fill="var(--brand)" fillOpacity={0.5} />

      {/* Row 4 */}
      <circle cx="50" cy="235" r="10" stroke="var(--brand)" strokeOpacity={0.35} strokeWidth={1} />
      <line x1="68" y1="232" x2="135" y2="232" stroke="var(--brand)" strokeOpacity={0.3} strokeWidth={2} />
      <line x1="68" y1="240" x2="100" y2="240" stroke="var(--brand)" strokeOpacity={0.15} strokeWidth={1.5} />
      <rect x="180" y="228" width="90" height="6" rx="3" stroke="var(--brand)" strokeOpacity={0.1} strokeWidth={0.5} />
      <rect x="180" y="228" width="40" height="6" rx="3" fill="var(--brand)" fillOpacity={0.25} />

      {/* FitScore ring — foreground */}
      <circle cx="330" cy="90" r="55" stroke="var(--brand)" strokeOpacity={0.1} strokeWidth={4} />
      <circle cx="330" cy="90" r="55" stroke="var(--brand)" strokeOpacity={0.9} strokeWidth={4}
        strokeDasharray="280 66" strokeLinecap="round" transform="rotate(-90 330 90)" />
      <line x1="315" y1="85" x2="345" y2="85" stroke="var(--brand)" strokeOpacity={0.7} strokeWidth={2.5} />
      <line x1="322" y1="95" x2="338" y2="95" stroke="var(--brand)" strokeOpacity={0.4} strokeWidth={1.5} />

      {/* Small badge below ring */}
      <rect x="305" y="160" width="50" height="20" rx="6" stroke="var(--brand)" strokeOpacity={0.3} strokeWidth={0.8} />
      <line x1="315" y1="170" x2="345" y2="170" stroke="var(--brand)" strokeOpacity={0.25} strokeWidth={1.5} />
    </svg>
  )
}

export default function ForAgentsPage() {
  return (
    <div>
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 pt-24 pb-20 md:pt-36 md:pb-28">
          <div className="md:grid md:grid-cols-[1fr_40%] md:items-center md:gap-8">
            <div>
              <Badge className="bg-brand/20 text-brand border-brand/30 mb-6">
                For property agents
              </Badge>
              <h1 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight mb-6">
                The property management platform
                <br />
                <span className="text-brand">your stack has been missing.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
                Built by someone who has placed tenants, chased arrears, inspected units, set up body corporates, and sat in Tribunal. Then rebuilt it all for the way it should work. Credit checks are paid by applicants. Not you.
              </p>
              <Button
                size="lg"
                className="text-base h-13 px-8"
                render={<Link href="/login" />}
              >
                Start 14-day trial <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
            <div className="hidden md:block" style={{ maskImage: "linear-gradient(to right, black 60%, transparent 100%)" }}>
              <FitScoreSVG />
            </div>
          </div>
        </div>
      </section>

      {/* ─── The screening problem solved ─── */}
      <section className="bg-surface/50 py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              The screening problem, solved
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            A two-stage model that eliminates your screening costs entirely.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <Card className="border-l-4 border-l-brand bg-surface">
              <CardContent className="pt-6 space-y-3">
                <Badge variant="secondary">Stage 1 — Free</Badge>
                <h3 className="font-heading text-xl">Pre-screen</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Applicants apply free. Pleks extracts income from their bank
                  statement and generates an instant pre-screen score. You see
                  affordability before spending a cent.
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-brand bg-surface">
              <CardContent className="pt-6 space-y-3">
                <Badge className="bg-brand/20 text-brand border-brand/30">
                  Stage 2 — Paid by applicant
                </Badge>
                <h3 className="font-heading text-xl">Full credit check</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Shortlisted applicants pay for their own credit check.
                  You receive a full FitScore — credit history, income ratio,
                  rental history, employment verification, judgements, and
                  defaults.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg bg-surface p-4 border border-border/50">
            <p className="text-sm">
              <span className="font-medium text-brand">FitScore</span> — a
              single composite score combining credit, affordability, employment
              stability, and rental history. Compare applicants side-by-side
              without reading 20-page reports.
            </p>
          </div>
        </div>
      </section>

      {/* ─── DebiCheck built in ─── */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Banknote className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              DebiCheck built in
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            A DebiCheck mandate is created at the same time as the lease — not
            bolted on later. If a tenant rejects or revokes their mandate, the
            system flags the lease as at-risk and starts the arrears workflow
            automatically.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              "Mandate created with lease",
              "Auto-collect on the 1st",
              "Auto-arrears on rejection",
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

      {/* ─── Inspections on your phone ─── */}
      <section className="bg-surface/50 py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Smartphone className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              Inspections on your phone
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            A PWA that works offline. Take photos, note condition, capture GPS
            coordinates. When you&apos;re back online, everything syncs
            automatically. The output is a Tribunal-ready PDF with timestamped
            photos, GPS metadata, and digital signatures.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              "Works offline",
              "GPS coordinates",
              "Timestamped photos",
              "Tribunal-ready PDF",
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

      {/* ─── Owner statements in one click ─── */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              Owner statements in one click
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            Generate SARS-ready owner statements with one click. Net-to-owner
            calculation, itemised expenses, management fees, and a full
            transaction history — ready to send or download as PDF.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              "SARS-ready format",
              "Net to owner",
              "Itemised expenses",
              "Monthly or annual",
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

      {/* ─── Arrears automation ─── */}
      <section className="bg-surface/50 py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              Arrears automation
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            A four-step escalation runs automatically. Every notice is logged,
            timestamped, and stored for Tribunal evidence. AI drafts the letters
            — you just review and send.
          </p>

          <div className="space-y-4">
            {[
              {
                day: "Day 3",
                action: "SMS reminder",
                desc: "Friendly SMS sent to tenant with outstanding amount and payment details.",
              },
              {
                day: "Day 7",
                action: "Email notice",
                desc: "Formal email with statement attached. Tenant can pay directly from the email.",
              },
              {
                day: "Day 14",
                action: "Firm letter",
                desc: "Written notice referencing the Consumer Protection Act and lease terms.",
              },
              {
                day: "Day 20",
                action: "Letter of Demand",
                desc: "AI-drafted LOD citing the Rental Housing Act. Ready for your review before sending.",
              },
            ].map((step) => (
              <div
                key={step.day}
                className="flex items-start gap-4 rounded-lg bg-surface p-4"
              >
                <Badge
                  variant="outline"
                  className="shrink-0 mt-0.5 font-mono"
                >
                  {step.day}
                </Badge>
                <div>
                  <p className="font-medium text-sm">{step.action}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Switching ─── */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Upload className="size-8 text-brand" />
            <h2 className="font-heading text-3xl md:text-4xl">
              Switching is easier than you think
            </h2>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            Bring your portfolio over in a weekend. CSV import for properties,
            tenants, and active leases. Set opening balances. Run one cycle in
            parallel. Cut over.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {[
              "CSV import",
              "Opening balances",
              "14-day free trial",
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
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              size="lg"
              className="text-base h-13 px-8"
              render={<Link href="/login" />}
            >
              Start 14-day trial <ArrowRight className="ml-2 size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base h-13 px-8"
              render={<Link href="/migrate" />}
            >
              How switching works <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
