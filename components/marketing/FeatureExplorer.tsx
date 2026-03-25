"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Check, UserCheck, FileText, Banknote, BarChart3, Wrench, Building2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface Category {
  key: string
  label: string
  icon: LucideIcon
  desc: string
  features: string[]
}

const CATEGORIES: Category[] = [
  {
    key: "screening",
    label: "Screening & Applications",
    icon: UserCheck,
    desc: "Two-stage screening where applicants pay. You get the FitScore — never a raw credit report.",
    features: [
      "FitScore (credit, income ratio, rental history, employment)",
      "Free Stage 1 pre-screen for every applicant",
      "Applicant pays R399 for Stage 2 — not you",
      "Joint applications and co-applicants",
      "Foreign national screening with visa expiry check",
      "Motivation letters and additional document upload",
      "Real-time affordability indicator",
    ],
  },
  {
    key: "lease",
    label: "Lease & Compliance",
    icon: FileText,
    desc: "Leases generated, signed digitally, and stored with a full audit trail. Tribunal-ready from day one.",
    features: [
      "Digital lease signing via DocuSeal",
      "Residential and commercial lease templates",
      "CPA auto-renewal notices (20 business days)",
      "Lease renewal and escalation management",
      "Deposit tracking — 7/14/21-day RHA timers",
      "Inspection reports with GPS + timestamp photos",
      "Deposit deduction schedule with wear-and-tear classification",
    ],
  },
  {
    key: "collections",
    label: "Collections & Arrears",
    icon: Banknote,
    desc: "DebiCheck mandate created with the lease. Rent collects automatically. Arrears handled without you.",
    features: [
      "DebiCheck mandate management (no separate integration)",
      "Automated rent invoicing on the 1st",
      "Bank statement reconciliation",
      "Arrears sequence: Day 3 SMS → Day 7 email → Day 14 letter → Day 20 LOD",
      "AI-drafted arrears communications (you approve)",
      "Payment arrangement tracking",
      "Arrears case history and audit trail",
    ],
  },
  {
    key: "financials",
    label: "Financials & Reporting",
    icon: BarChart3,
    desc: "SARS-ready owner statements, trust account tracking, and one-click annual summaries.",
    features: [
      "Owner statements with full income/expense breakdown",
      "SARS annual income summary",
      "Rent roll report",
      "Trust account and business account separation",
      "Municipal bill extraction and unit allocation",
      "Supplier invoice processing",
      "Fees due and trust balance dashboard",
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    desc: "Work orders with quote-before-work. Contractors get their own portal.",
    features: [
      "Maintenance request logging with AI triage",
      "Work order creation and contractor dispatch",
      "Quote approval before work starts",
      "Contractor portal (quotes, invoices, job status)",
      "Preferred contractors per property or building",
      "Heritage building pre-approval workflow",
      "Supplier invoice tracking",
    ],
  },
  {
    key: "properties",
    label: "Properties & Buildings",
    icon: Building2,
    desc: "Multi-building erfs, heritage buildings, sectional title, HOA — all in one place.",
    features: [
      "Residential, commercial, and mixed-use properties",
      "Multi-building erf support (heritage + new build)",
      "Heritage building maintenance rhythm",
      "HOA / body corporate module",
      "5-method levy calculation (PQ, m², equal, fixed, %)",
      "Sectional title compliance tools (Firm)",
      "CSOS levy management",
    ],
  },
]

export function FeatureExplorer() {
  const [activeKey, setActiveKey] = useState("screening")
  const active = CATEGORIES.find((c) => c.key === activeKey) ?? CATEGORIES[0]

  return (
    <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
      <h2 className="font-heading text-3xl md:text-4xl mb-3 text-center">Everything in one place</h2>
      <p className="text-muted-foreground text-center mb-12">
        No more juggling five platforms and a spreadsheet.
      </p>

      {/* Mobile: horizontal scrolling pills */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 md:hidden scrollbar-none">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const isActive = cat.key === activeKey
          return (
            <button
              key={cat.key}
              onClick={() => setActiveKey(cat.key)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors shrink-0",
                isActive
                  ? "bg-brand/15 text-brand"
                  : "bg-surface text-muted-foreground hover:bg-surface-elevated"
              )}
            >
              <Icon className="size-4" />
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Desktop: sidebar + content */}
      <div className="hidden md:grid md:grid-cols-[240px_1fr] gap-8">
        {/* Sidebar */}
        <nav className="space-y-1">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isActive = cat.key === activeKey
            return (
              <button
                key={cat.key}
                onClick={() => setActiveKey(cat.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                  isActive
                    ? "bg-surface-elevated text-brand border-l-2 border-brand"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {cat.label}
              </button>
            )
          })}
        </nav>

        {/* Content */}
        <div key={active.key} className="animate-in fade-in-0 slide-in-from-right-2 duration-200">
          <h3 className="font-heading text-2xl mb-2">{active.label}</h3>
          <p className="text-muted-foreground leading-relaxed mb-8 max-w-xl">{active.desc}</p>
          <ul className="space-y-3">
            {active.features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <Check className="size-4 text-brand mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Mobile: content for active category */}
      <div className="md:hidden">
        <div key={active.key} className="animate-in fade-in-0 duration-200">
          <h3 className="font-heading text-xl mb-2">{active.label}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">{active.desc}</p>
          <ul className="space-y-3">
            {active.features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <Check className="size-4 text-brand mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
