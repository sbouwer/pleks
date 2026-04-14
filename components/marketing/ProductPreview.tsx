/*
 * SCREENSHOTS NEEDED — replace placeholders
 *
 * Before go-live, take these screenshots and save to /public/screenshots/
 *
 * 1. dashboard.png
 *    URL: /dashboard
 *    Show: main dashboard with sidebar, some data populated
 *    Size: 1440x900, then save at 2x for retina → 900px display width
 *
 * 2. inspections.png
 *    URL: /inspections or inspection detail page
 *    Show: inspection form with photos, condition ratings visible
 *    Size: same
 *
 * 3. screening.png
 *    URL: /applications or FitScore view
 *    Show: applicant pipeline with FitScore visible
 *    Size: same
 *
 * Replace the placeholder divs with:
 *   <Image
 *     src="/screenshots/[name].png"
 *     alt="[description]"
 *     width={900} height={562}
 *     className="w-full h-auto rounded-b-lg"
 *   />
 */

"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

const TABS = [
  { key: "dashboard", label: "Dashboard", placeholder: "Dashboard preview — replace with screenshot" },
  { key: "inspections", label: "Inspections", placeholder: "Inspections view — replace with screenshot" },
  { key: "screening", label: "Screening", placeholder: "Screening pipeline — replace with screenshot" },
]

export function ProductPreview() {
  const [activeTab, setActiveTab] = useState("dashboard")
  const active = TABS.find((t) => t.key === activeTab) ?? TABS[0]

  return (
    <section className="bg-surface/30 py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-4">
        <p className="text-brand text-sm font-semibold uppercase tracking-widest mb-3">
          Inside Pleks
        </p>
        <h2 className="font-heading text-3xl md:text-4xl mb-4">
          See what you&apos;re getting
        </h2>
        <p className="text-muted-foreground mb-12 max-w-xl">
          Purpose-built for SA property management. Every screen designed to save you time.
        </p>

        {/* Tab selector — horizontal scroll on mobile */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                tab.key === activeTab
                  ? "bg-brand text-primary-foreground"
                  : "bg-surface text-muted-foreground hover:bg-surface-elevated"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Browser chrome frame — chrome hidden on mobile, shown on md+ */}
        <div className="max-w-[900px] mx-auto">
          <div className="rounded-xl overflow-hidden md:shadow-[0_24px_48px_rgba(0,0,0,0.4)] md:border md:border-border/40">
            {/* Title bar — desktop only */}
            <div className="hidden md:flex bg-surface border-b border-border/40 px-4 py-3 items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-brand/30" />
                <div className="w-3 h-3 rounded-full bg-brand/20" />
                <div className="w-3 h-3 rounded-full bg-brand/15" />
              </div>
              <div className="flex-1 mx-8">
                <div className="h-5 rounded-md bg-muted/50 max-w-xs" />
              </div>
            </div>
            {/* Amber accent bar */}
            <div className="h-[3px] bg-brand" />

            {/* Content area */}
            <div key={active.key} className="aspect-[16/10] bg-surface flex items-center justify-center transition-opacity duration-300">
              {/*
                SCREENSHOT NEEDED:
                Take a screenshot at 1440x900px, save as
                public/screenshots/{active.key}.png
                Then replace this div with:
                <Image src={`/screenshots/${active.key}.png`}
                  alt={active.label} width={900} height={562}
                  className="w-full h-auto" />
              */}
              <p className="text-sm text-muted-foreground/50">{active.placeholder}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
