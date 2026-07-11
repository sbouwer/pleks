"use client"

/**
 * app/(public)/TierGrid.tsx — Interactive tier pricing grid with lease-count suggester
 *
 * Route:  / (rendered inside the marketing homepage pricing section)
 * Auth:   none — public
 * Data:   TIERS from lib/marketing/tiers.ts (static)
 */

import { useState } from "react"
import type { TierData } from "@/lib/marketing/tiers"

import { absoluteUrl, marketingUrl } from "@/lib/routing/absoluteUrl"

// Absolute URL to avoid RSC prefetch CORS failures across subdomain boundary
export type { TierData }

function getSuggestedTier(count: number, tiers: readonly TierData[]): string {
  for (const tier of tiers) {
    if (tier.leaseCap !== null && count <= tier.leaseCap) return tier.name
  }
  return tiers.at(-1)!.name
}

export function TierGrid({ tiers }: Readonly<{ tiers: readonly TierData[] }>) {
  const [raw, setRaw] = useState("")
  const num = raw === "" ? null : Math.max(1, Number.parseInt(raw) || 1)
  const suggested = num === null ? null : getSuggestedTier(num, tiers)

  return (
    <>
      {/* Lease counter */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "14px 20px", border: "1px solid var(--rule)",
        borderRadius: "var(--r-md)", background: "var(--paper-sunk)",
        marginBottom: 20, fontSize: 14, color: "var(--ink-soft)",
      }}>
        <span style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>I manage</span>
        <div style={{
          display: "flex", alignItems: "stretch",
          border: "1px solid var(--rule-strong)", borderRadius: "var(--r-sm)",
          background: "var(--paper)", overflow: "hidden", flexShrink: 0,
        }}>
          <input
            type="number" min={1} value={raw}
            id="lease-count" name="lease-count"
            onChange={e => setRaw(e.target.value)}
            placeholder="—"
            className="pub-lease-input"
            aria-label="Number of active leases"
          />
        </div>
        <span style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>active leases today.</span>
        {suggested ? (
          <span style={{ color: "var(--amber-ink)", fontWeight: 500 }}>
            → <strong>{suggested}</strong> is your tier.
          </span>
        ) : (
          <span style={{ color: "var(--ink-faint)" }}>→ Pick a tier below, or type a number.</span>
        )}
      </div>

      {/* Tier cards — subgrid aligns rows across all cards */}
      <div className="pub-tier-grid" style={{ marginBottom: 12 }}>
        {tiers.map(tier => {
          const isActive = suggested === tier.name
          return (
            <div key={tier.name} className={`pub-tier${isActive ? " pub-tier-active" : ""}`}>

              {/* Row 1 — name */}
              <div className={`pub-tier-name${isActive ? " stoep" : ""}`}>{tier.name}</div>

              {/* Row 2 — description */}
              <p className="pub-tier-desc">{tier.desc}</p>

              {/* Row 3 — lease cap */}
              <div className="pub-tier-sub">
                {tier.leaseCap
                  ? <>Up to <strong>{tier.leaseCap}</strong> active leases</>
                  : tier.leases}
              </div>

              {/* Row 4 — price */}
              {tier.price ? (
                <div className="pub-tier-price">
                  <span className="currency">R</span>{tier.price}<span className="period">/mo</span>
                </div>
              ) : (
                <div className="pub-tier-talk">Let&apos;s talk</div>
              )}

              {/* Row 5 — per-lease */}
              <div className="pub-tier-per">{tier.perLease}</div>

              {/* Row 6 — CTA */}
              {tier.price ? (
                <a href={absoluteUrl("/onboarding")} className="pub-tier-cta">
                  Start as {tier.name} →
                </a>
              ) : (
                <a href={marketingUrl("/contact")} className="pub-tier-cta pub-tier-cta-amber">
                  Email the founder →
                </a>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
