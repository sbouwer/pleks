"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ClassicCover } from "@/components/branding/templates/ClassicCover"
import { ModernCover } from "@/components/branding/templates/ModernCover"
import { BoldCover } from "@/components/branding/templates/BoldCover"
import { MinimalCover } from "@/components/branding/templates/MinimalCover"
import type { CoverIdentity, CoverBranding } from "@/components/branding/templates/types"

type Template = "classic" | "modern" | "bold" | "minimal"
type Font = "inter" | "merriweather" | "lato" | "playfair"

interface DocumentPreviewProps {
  logoUrl: string | null
  accentColor: string
  layout: Template
  font?: Font
}

const FONT_STACKS: Record<Font, string> = {
  inter: "Inter, system-ui, sans-serif",
  merriweather: "Merriweather, Georgia, serif",
  lato: "Lato, system-ui, sans-serif",
  playfair: '"Playfair Display", Georgia, serif',
}

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&family=Lato:wght@400;700&family=Playfair+Display:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap"

// ── Shared primitives ─────────────────────────────────────────────────────────

function Paper({ children, fontStack }: Readonly<{ children: React.ReactNode; fontStack: string }>) {
  return (
    <div
      className="bg-white border border-border/60 rounded-lg overflow-hidden mx-auto shadow-sm"
      style={{ aspectRatio: "1/1.414", maxWidth: "480px", fontFamily: fontStack }}
    >
      {children}
    </div>
  )
}

function MockupNote({ type }: Readonly<{ type: string }>) {
  return (
    <p className="text-center text-xs text-muted-foreground mt-3">
      This is a preview. {type} will use your branding when available.
    </p>
  )
}

// ── Lease page mock — 4 variants ─────────────────────────────────────────────

function LeasePageClassic({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const line = [identity.address, identity.phone, identity.email].filter(Boolean).join(" · ")
  const a = branding.accentColor
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8" style={{ color: "#333", fontSize: "9px" }}>
      <div className="flex items-center gap-3 mb-2">
        {branding.logoUrl && <img src={branding.logoUrl} alt="" className="h-6 w-auto object-contain shrink-0" />}
        <span className="flex-1 text-center font-medium truncate" style={{ color: "#555" }}>{identity.tradingAs || identity.name || "Agency"}</span>
        <span style={{ color: "#999" }}>Page 2 of 7</span>
      </div>
      <div className="border-t mb-4" style={{ borderColor: a }} />
      {sampleClauses.map((c) => (
        <div key={c.num} className="mb-3">
          <p className="font-semibold uppercase tracking-wide mb-1" style={{ fontSize: "9px", color: a }}>
            {c.num} {c.title}
          </p>
          <p style={{ lineHeight: 1.7, color: "#444", fontSize: "9px" }}>{c.body}</p>
        </div>
      ))}
      <div className="mt-3 flex items-center gap-2" style={{ fontSize: "8px", color: "#999" }}>
        <span>Initials: _______</span>
        <span>Tenant: _______</span>
        <span>Landlord: _______</span>
      </div>
      <div className="mt-auto">
        <div className="border-t mt-3 mb-2" style={{ borderColor: a }} />
        {line && <p className="text-center" style={{ color: "#aaa", fontSize: "9px" }}>{line}</p>}
      </div>
    </div>
  )
}

function LeasePageModern({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      <div className="px-10 py-4 flex items-center justify-between" style={{ borderBottom: `2px solid ${a}` }}>
        <div className="flex items-center gap-2">
          {branding.logoUrl && <img src={branding.logoUrl} alt="" className="h-5 w-auto object-contain shrink-0" />}
          <span className="font-semibold" style={{ color: a }}>{identity.tradingAs || identity.name || "Agency"}</span>
        </div>
        <span style={{ color: "#999" }}>Page 2 / 7</span>
      </div>
      <div className="flex-1 px-10 py-5">
        {sampleClauses.map((c) => (
          <div key={c.num} className="mb-3">
            <p className="font-semibold mb-1" style={{ fontSize: "9px" }}>{c.num}. {c.title}</p>
            <p style={{ lineHeight: 1.7, color: "#555", fontSize: "9px" }}>{c.body}</p>
          </div>
        ))}
      </div>
      <div className="px-10 py-3 flex justify-between" style={{ background: `${a}10`, borderTop: `1px solid ${a}40` }}>
        <span style={{ color: "#999" }}>Lessor: ___________</span>
        <span style={{ color: "#999" }}>Lessee: ___________</span>
      </div>
    </div>
  )
}

function LeasePageBold({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      <div className="h-[6px]" style={{ background: a }} />
      <div className="px-10 py-3 flex items-center justify-between">
        {branding.logoUrl && <img src={branding.logoUrl} alt="" className="h-5 w-auto object-contain" />}
        <span className="font-bold" style={{ color: a, fontSize: "10px" }}>{identity.tradingAs || identity.name || "Agency"}</span>
        <span style={{ color: "#999" }}>2 / 7</span>
      </div>
      <div className="h-[2px]" style={{ background: a }} />
      <div className="flex-1 px-10 py-4">
        {sampleClauses.map((c) => (
          <div key={c.num} className="mb-3">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-bold px-1 rounded text-white" style={{ background: a, fontSize: "8px" }}>{c.num}</span>
              <span className="font-semibold" style={{ fontSize: "9px" }}>{c.title}</span>
            </div>
            <p style={{ lineHeight: 1.7, color: "#555", fontSize: "9px" }}>{c.body}</p>
          </div>
        ))}
      </div>
      <div className="h-[4px]" style={{ background: a }} />
    </div>
  )
}

function LeasePageMinimal({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8" style={{ color: "#333", fontSize: "9px" }}>
      <div className="flex items-center justify-between mb-5 pb-3" style={{ borderBottom: "1px solid #eee" }}>
        <span style={{ color: "#aaa" }}>{identity.tradingAs || identity.name || "Agency"}</span>
        <span style={{ color: "#bbb" }}>Page 2</span>
      </div>
      {sampleClauses.map((c) => (
        <div key={c.num} className="mb-4">
          <p className="font-semibold mb-1" style={{ fontSize: "9px" }}>{c.num}. {c.title}</p>
          <p style={{ lineHeight: 1.8, color: "#666", fontSize: "9px" }}>{c.body}</p>
        </div>
      ))}
      <div className="mt-auto flex justify-end gap-6 pt-3" style={{ borderTop: "1px solid #eee" }}>
        <span style={{ color: "#bbb" }}>Lessor ___</span>
        <span style={{ color: "#bbb" }}>Lessee ___</span>
        <div className="w-6 h-[2px] self-center rounded" style={{ background: a }} />
      </div>
    </div>
  )
}

// ── Invoice mock — 4 variants ─────────────────────────────────────────────────

function InvoiceClassic({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8" style={{ color: "#333", fontSize: "9px" }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt="" className="max-w-[90px] max-h-[36px] object-contain mb-1" />
            : <div className="w-14 h-7 border border-dashed rounded flex items-center justify-center mb-1" style={{ borderColor: `${a}40`, color: "#bbb" }}>LOGO</div>
          }
          <p style={{ color: "#999" }}>{identity.address || "[Address]"}</p>
        </div>
        <div className="text-right">
          <p className="font-bold" style={{ color: a, fontSize: "11px" }}>TAX INVOICE</p>
          <p style={{ color: "#777" }}>INV-2026-042 · 1 Mar 2026</p>
        </div>
      </div>
      <div className="border-t mb-3" style={{ borderColor: a }} />
      <p className="font-medium mb-2">{n}</p>
      <table className="w-full mb-3" style={{ borderCollapse: "collapse" }}>
        <thead><tr style={{ background: `${a}15` }}>
          {["Description", "Amount"].map((h) => <th key={h} className="text-left py-1 px-1.5 font-semibold" style={{ color: a, fontSize: "8px" }}>{h}</th>)}
        </tr></thead>
        <tbody>{invoiceRows.map(([d, v]) => (
          <tr key={d} style={{ borderBottom: "1px solid #f0f0f0" }}>
            <td className="py-1 px-1.5" style={{ color: "#555" }}>{d}</td>
            <td className="py-1 px-1.5 text-right">{v}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="mt-auto">
        <p className="font-medium mb-0.5" style={{ color: a }}>Banking</p>
        <p style={{ color: "#999" }}>FNB · 62xxxxxxxx · 250655</p>
      </div>
    </div>
  )
}

function InvoiceModern({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      <div className="px-10 py-5 flex items-center justify-between" style={{ borderBottom: `3px solid ${a}` }}>
        {branding.logoUrl
          ? <img src={branding.logoUrl} alt="" className="max-w-[80px] max-h-[30px] object-contain" />
          : <span className="font-bold" style={{ color: a }}>{n}</span>
        }
        <div className="text-right">
          <p className="font-bold" style={{ color: a }}>INVOICE</p>
          <p style={{ color: "#999" }}>INV-2026-042</p>
        </div>
      </div>
      <div className="flex-1 px-10 py-5">
        <div className="flex justify-between mb-4">
          <div><p style={{ color: "#999" }}>Billed to</p><p className="font-medium mt-0.5">J. van der Merwe</p></div>
          <div className="text-right"><p style={{ color: "#999" }}>Date</p><p className="mt-0.5">1 March 2026</p></div>
        </div>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead><tr><th className="text-left pb-1 font-medium" style={{ borderBottom: `2px solid ${a}`, fontSize: "8px" }}>Description</th>
            <th className="text-right pb-1 font-medium" style={{ borderBottom: `2px solid ${a}`, fontSize: "8px" }}>Amount</th></tr></thead>
          <tbody>{invoiceRows.map(([d, v]) => (
            <tr key={d} style={{ borderBottom: "1px solid #f5f5f5" }}>
              <td className="py-1" style={{ color: "#555" }}>{d}</td>
              <td className="py-1 text-right">{v}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="px-10 py-4" style={{ borderTop: `2px solid ${a}`, color: "#777" }}>
        <p>{n} · FNB · 62xxxxxxxx</p>
      </div>
    </div>
  )
}

function InvoiceBold({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      <div className="px-10 py-5" style={{ background: a }}>
        <div className="flex items-center justify-between">
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt="" className="max-w-[80px] max-h-[30px] object-contain brightness-0 invert" />
            : <span className="font-bold text-white" style={{ fontSize: "11px" }}>{n}</span>
          }
          <p className="font-bold text-white" style={{ fontSize: "11px" }}>TAX INVOICE</p>
        </div>
        <p className="text-white mt-1" style={{ opacity: 0.8 }}>INV-2026-042 · 1 March 2026</p>
      </div>
      <div className="flex-1 px-10 py-4">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead><tr style={{ background: `${a}20` }}>
            {["Description", "Amount"].map((h) => <th key={h} className="text-left py-1 px-1.5 font-bold" style={{ color: a, fontSize: "8px" }}>{h}</th>)}
          </tr></thead>
          <tbody>{invoiceRows.map(([d, v]) => (
            <tr key={d} style={{ borderBottom: "1px solid #eee" }}>
              <td className="py-1 px-1.5" style={{ color: "#555" }}>{d}</td>
              <td className="py-1 px-1.5 text-right font-medium">{v}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="px-10 py-3" style={{ background: `${a}10`, borderTop: `2px solid ${a}` }}>
        <p style={{ color: "#777" }}>Banking: FNB · 62xxxxxxxx · Branch 250655</p>
      </div>
    </div>
  )
}

function InvoiceMinimal({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8" style={{ color: "#333", fontSize: "9px" }}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-semibold" style={{ fontSize: "11px" }}>{n}</p>
          <p style={{ color: "#999", marginTop: 2 }}>{identity.address || "[Address]"}</p>
        </div>
        {branding.logoUrl && <img src={branding.logoUrl} alt="" className="max-w-[60px] max-h-[28px] object-contain" />}
      </div>
      <p className="font-medium mb-1">Invoice <span style={{ color: "#999" }}>#042</span></p>
      <div className="w-8 h-[2px] rounded mb-4" style={{ background: a }} />
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <tbody>{invoiceRows.map(([d, v]) => (
          <tr key={d} style={{ borderBottom: "1px solid #f0f0f0" }}>
            <td className="py-1" style={{ color: "#555" }}>{d}</td>
            <td className="py-1 text-right">{v}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="mt-auto pt-4" style={{ borderTop: "1px solid #eee", color: "#aaa" }}>
        <p>FNB · 62xxxxxxxx · 250655</p>
      </div>
    </div>
  )
}

// ── Email mock — 4 variants ───────────────────────────────────────────────────

function EmailClassic({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      <div className="px-10 py-5 text-center" style={{ background: "#fafafa" }}>
        {branding.logoUrl
          ? <img src={branding.logoUrl} alt="" className="max-w-[90px] max-h-[36px] object-contain mx-auto" />
          : <p className="font-semibold" style={{ color: a }}>{n}</p>
        }
      </div>
      <div className="h-[2px]" style={{ background: a }} />
      <div className="flex-1 px-10 py-5">
        <p className="mb-3">Dear J. van der Merwe,</p>
        <p style={{ lineHeight: 1.7, color: "#555" }}>Your invoice for March 2026 is attached. Payment is due by 1 March 2026.</p>
        <div className="mt-5 pt-3" style={{ borderTop: "1px solid #eee" }}>
          <p className="font-medium">{n}</p>
          <p style={{ color: "#777", marginTop: 2 }}>{identity.phone || ""} · {identity.email || ""}</p>
        </div>
      </div>
      <div className="px-10 py-3 text-center" style={{ background: "#fafafa", borderTop: "1px solid #eee" }}>
        <p style={{ color: "#aaa" }}>{identity.address || "[Address]"}</p>
      </div>
    </div>
  )
}

function EmailModern({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      <div className="px-10 py-4 flex items-center gap-3" style={{ borderLeft: `4px solid ${a}`, marginLeft: 0, background: "#fafafa" }}>
        {branding.logoUrl
          ? <img src={branding.logoUrl} alt="" className="max-w-[70px] max-h-[28px] object-contain" />
          : <span className="font-bold" style={{ color: a }}>{n}</span>
        }
      </div>
      <div className="flex-1 px-10 py-5">
        <p className="font-medium mb-3" style={{ color: a }}>Invoice for March 2026</p>
        <p className="mb-2">Hi J. van der Merwe,</p>
        <p style={{ lineHeight: 1.7, color: "#555" }}>Please find your invoice attached. Payment due by 1 March 2026.</p>
        <div className="mt-5 pt-3 flex items-center gap-2" style={{ borderTop: `1px solid ${a}30` }}>
          <div className="w-4 h-[3px] rounded" style={{ background: a }} />
          <p className="font-medium">{n}</p>
        </div>
        <p style={{ color: "#777", marginTop: 2 }}>{identity.email || ""}</p>
      </div>
      <div className="px-10 py-3 text-center" style={{ background: `${a}08`, borderTop: `1px solid ${a}20`, color: "#aaa" }}>
        <p>{identity.address || "[Address]"}</p>
      </div>
    </div>
  )
}

function EmailBold({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      <div className="px-10 py-6 text-center" style={{ background: a }}>
        {branding.logoUrl
          ? <img src={branding.logoUrl} alt="" className="max-w-[90px] max-h-[36px] object-contain mx-auto brightness-0 invert" />
          : <p className="font-bold text-white" style={{ fontSize: "11px" }}>{n}</p>
        }
      </div>
      <div className="flex-1 px-10 py-5">
        <p className="font-bold mb-3" style={{ fontSize: "11px" }}>Invoice for March 2026</p>
        <p className="mb-2">Dear J. van der Merwe,</p>
        <p style={{ lineHeight: 1.7, color: "#555" }}>Your invoice is attached. Please ensure payment by 1 March 2026.</p>
        <div className="mt-5 pt-3" style={{ borderTop: "1px solid #eee" }}>
          <p className="font-semibold">{n}</p>
          <p style={{ color: "#777", marginTop: 2 }}>{identity.email || ""}</p>
        </div>
      </div>
      <div className="h-[4px]" style={{ background: a }} />
      <div className="px-10 py-2 text-center" style={{ color: "#aaa" }}>
        <p>{identity.address || "[Address]"}</p>
      </div>
    </div>
  )
}

function EmailMinimal({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8" style={{ color: "#333", fontSize: "9px" }}>
      <div className="flex-1">
        <p className="mb-4" style={{ color: "#999" }}>From: {n} &lt;{identity.email || "noreply"}&gt;</p>
        <p className="font-medium mb-4" style={{ fontSize: "10px" }}>Invoice for March 2026</p>
        <p className="mb-2">Hi J. van der Merwe,</p>
        <p style={{ lineHeight: 1.7, color: "#555" }}>Your invoice is attached. Payment due by 1 March 2026.</p>
        <div className="mt-6">
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt="" className="max-w-[60px] max-h-[24px] object-contain" />
            : <p className="font-medium">{n}</p>
          }
          <div className="w-6 h-[2px] rounded mt-2" style={{ background: a }} />
        </div>
      </div>
      <p style={{ color: "#bbb" }}>{identity.address || ""}</p>
    </div>
  )
}

// ── Letter mock — 4 variants ──────────────────────────────────────────────────

function LetterClassic({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8" style={{ color: "#333", fontSize: "9px" }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt="" className="max-w-[90px] max-h-[36px] object-contain mb-1" />
            : <div className="w-14 h-7 border border-dashed rounded flex items-center justify-center mb-1" style={{ borderColor: `${a}40`, color: "#bbb" }}>LOGO</div>
          }
        </div>
        <div className="text-right" style={{ color: "#666" }}>
          <p className="font-semibold" style={{ color: "#333" }}>{n}</p>
          <p>{identity.address || "[Address]"}</p>
          <p>{identity.phone || ""} · {identity.email || ""}</p>
        </div>
      </div>
      <div className="border-t mb-4" style={{ borderColor: a }} />
      <p style={{ color: "#999" }}>1 March 2026</p>
      <div className="mt-3 mb-3"><p>J. van der Merwe</p><p style={{ color: "#777" }}>Cape Town</p></div>
      <p className="font-medium mb-2"><strong>RE: Lease renewal notice</strong></p>
      <p style={{ lineHeight: 1.7, color: "#555" }}>Your lease expires on 30 April 2026. Please contact us within 30 days to discuss renewal.</p>
      <div className="mt-auto pt-4" style={{ color: "#777" }}>
        <p>Yours faithfully,</p>
        <div className="mt-3 mb-1 w-16 border-b" style={{ borderColor: "#ccc" }} />
        <p className="font-medium">{n}</p>
      </div>
    </div>
  )
}

function LetterModern({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      <div className="h-[3px]" style={{ background: a }} />
      <div className="px-10 py-5 flex items-center justify-between">
        {branding.logoUrl
          ? <img src={branding.logoUrl} alt="" className="max-w-[80px] max-h-[30px] object-contain" />
          : <span className="font-bold" style={{ color: a }}>{n}</span>
        }
        <div className="text-right" style={{ color: "#777" }}>
          <p style={{ color: "#333", fontWeight: 500 }}>{n}</p>
          <p>{identity.phone || ""}</p>
        </div>
      </div>
      <div className="flex-1 px-10 py-2">
        <p style={{ color: "#999" }}>1 March 2026</p>
        <div className="mt-3 mb-3"><p>J. van der Merwe</p><p style={{ color: "#777" }}>Cape Town</p></div>
        <p className="font-semibold mb-2" style={{ color: a }}>RE: Lease renewal notice</p>
        <p style={{ lineHeight: 1.7, color: "#555" }}>Your lease expires on 30 April 2026. Please contact us within 30 days to discuss renewal.</p>
        <div className="mt-5"><p style={{ color: "#777" }}>Yours faithfully,</p>
          <div className="mt-3 mb-1 w-16 border-b" style={{ borderColor: "#ccc" }} />
          <p className="font-medium">{n}</p>
        </div>
      </div>
      <div className="px-10 py-3" style={{ borderTop: `1px solid ${a}30`, color: "#aaa" }}>
        <p>{identity.address || "[Address]"}</p>
      </div>
    </div>
  )
}

function LetterBold({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      <div className="px-10 py-5" style={{ background: a }}>
        <div className="flex items-center justify-between">
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt="" className="max-w-[80px] max-h-[28px] object-contain brightness-0 invert" />
            : <span className="font-bold text-white" style={{ fontSize: "11px" }}>{n}</span>
          }
          <div className="text-right text-white" style={{ opacity: 0.85 }}>
            <p>{identity.address || "[Address]"}</p>
            <p>{identity.phone || ""}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 px-10 py-5">
        <p style={{ color: "#999" }}>1 March 2026</p>
        <div className="mt-3 mb-3"><p>J. van der Merwe</p><p style={{ color: "#777" }}>Cape Town</p></div>
        <p className="font-bold mb-2" style={{ color: a }}>RE: Lease renewal notice</p>
        <p style={{ lineHeight: 1.7, color: "#555" }}>Your lease expires on 30 April 2026. Please contact us within 30 days to discuss renewal.</p>
        <div className="mt-5"><p style={{ color: "#777" }}>Yours faithfully,</p>
          <div className="mt-3 mb-1 w-16 border-b" style={{ borderColor: "#ccc" }} />
          <p className="font-medium">{n}</p>
        </div>
      </div>
      <div className="h-[4px]" style={{ background: a }} />
    </div>
  )
}

function LetterMinimal({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const a = branding.accentColor
  const n = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8" style={{ color: "#333", fontSize: "9px" }}>
      <div className="flex items-end justify-between mb-6" style={{ borderBottom: "1px solid #eee", paddingBottom: "12px" }}>
        <div>
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt="" className="max-w-[60px] max-h-[24px] object-contain mb-1" />
            : <p className="font-medium" style={{ fontSize: "10px" }}>{n}</p>
          }
          <div className="w-6 h-[2px] rounded mt-1" style={{ background: a }} />
        </div>
        <p style={{ color: "#aaa" }}>{identity.address || ""}</p>
      </div>
      <p style={{ color: "#999" }}>1 March 2026</p>
      <div className="mt-3 mb-3"><p>J. van der Merwe</p></div>
      <p className="font-medium mb-2">RE: Lease renewal notice</p>
      <p style={{ lineHeight: 1.8, color: "#555" }}>Your lease expires on 30 April 2026. Please contact us within 30 days.</p>
      <div className="mt-auto pt-4" style={{ color: "#777", borderTop: "1px solid #f0f0f0" }}>
        <p>Yours faithfully,</p>
        <div className="mt-3 mb-1 w-16 border-b" style={{ borderColor: "#ddd" }} />
        <p className="font-medium" style={{ color: "#333" }}>{n}</p>
      </div>
    </div>
  )
}

// ── Shared data ───────────────────────────────────────────────────────────────

const sampleClauses = [
  { num: "1.", title: "DEFINITIONS", body: "In this agreement, unless the context indicates otherwise, the following words bear the meanings assigned hereunder…" },
  { num: "2.", title: "COMMENCEMENT", body: "This lease commences on [start date] and endures for [lease duration] months, terminating on [end date]…" },
  { num: "3.", title: "RENTAL", body: "The Lessee shall pay the Lessor a monthly rental of [monthly rent], due on the [payment due day] of each month…" },
]

const invoiceRows = [
  ["Monthly rental — March 2026", "R 9,500.00"],
  ["Admin levy", "R 250.00"],
  ["Water & electricity", "R 680.00"],
  ["Total", "R 10,430.00"],
]

// Template component maps
type DocProps = { identity: CoverIdentity; branding: CoverBranding }
const LEASE_VARIANTS: Record<Template, (p: Readonly<DocProps>) => React.ReactElement> = {
  classic: LeasePageClassic, modern: LeasePageModern, bold: LeasePageBold, minimal: LeasePageMinimal,
}
const INVOICE_VARIANTS: Record<Template, (p: Readonly<DocProps>) => React.ReactElement> = {
  classic: InvoiceClassic, modern: InvoiceModern, bold: InvoiceBold, minimal: InvoiceMinimal,
}
const EMAIL_VARIANTS: Record<Template, (p: Readonly<DocProps>) => React.ReactElement> = {
  classic: EmailClassic, modern: EmailModern, bold: EmailBold, minimal: EmailMinimal,
}
const LETTER_VARIANTS: Record<Template, (p: Readonly<DocProps>) => React.ReactElement> = {
  classic: LetterClassic, modern: LetterModern, bold: LetterBold, minimal: LetterMinimal,
}
const COVER_COMPONENTS: Record<Template, (p: Readonly<{ identity: CoverIdentity; branding: CoverBranding; leaseType?: string }>) => React.ReactElement> = {
  classic: ClassicCover, modern: ModernCover, bold: BoldCover, minimal: MinimalCover,
}

// ── Main component ────────────────────────────────────────────────────────────

export function DocumentPreview({ logoUrl, accentColor, layout, font = "inter" }: Readonly<DocumentPreviewProps>) {
  const [identity, setIdentity] = useState<CoverIdentity>({
    name: "", tradingAs: null, registration: null, eaab: null,
    address: "", phone: "", email: "", website: null,
  })

  useEffect(() => {
    fetch("/api/org/details")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        const addrParts = [data.addr_line1, data.addr_suburb, data.addr_city].filter(Boolean)
        setIdentity({
          name: data.name ?? "",
          tradingAs: data.trading_as ?? null,
          registration: data.reg_number ?? null,
          eaab: data.eaab_number ?? null,
          address: addrParts.join(", "),
          phone: data.phone ?? data.mobile ?? "",
          email: data.email ?? "",
          website: data.website ?? null,
        })
      })
      .catch(() => {})
  }, [])

  const branding: CoverBranding = { logoUrl, accentColor }
  const fontStack = FONT_STACKS[font]

  const CoverComp = COVER_COMPONENTS[layout]
  const LeaseComp = LEASE_VARIANTS[layout]
  const InvoiceComp = INVOICE_VARIANTS[layout]
  const EmailComp = EMAIL_VARIANTS[layout]
  const LetterComp = LETTER_VARIANTS[layout]

  return (
    <>
      {/* Load Google Fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={GOOGLE_FONTS_URL} />

      <Tabs defaultValue="cover">
        <TabsList className="mb-4">
          <TabsTrigger value="cover">Cover page</TabsTrigger>
          <TabsTrigger value="lease">Lease page</TabsTrigger>
          <TabsTrigger value="invoice">Invoice</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="letter">Letter</TabsTrigger>
        </TabsList>

        <TabsContent value="cover">
          <Paper fontStack={fontStack}>
            <CoverComp identity={identity} branding={branding} />
          </Paper>
        </TabsContent>

        <TabsContent value="lease">
          <Paper fontStack={fontStack}>
            <LeaseComp identity={identity} branding={branding} />
          </Paper>
          <MockupNote type="Lease documents" />
        </TabsContent>

        <TabsContent value="invoice">
          <Paper fontStack={fontStack}>
            <InvoiceComp identity={identity} branding={branding} />
          </Paper>
          <MockupNote type="Invoices" />
        </TabsContent>

        <TabsContent value="email">
          <Paper fontStack={fontStack}>
            <EmailComp identity={identity} branding={branding} />
          </Paper>
          <MockupNote type="Emails" />
        </TabsContent>

        <TabsContent value="letter">
          <Paper fontStack={fontStack}>
            <LetterComp identity={identity} branding={branding} />
          </Paper>
          <MockupNote type="Letters" />
        </TabsContent>
      </Tabs>
    </>
  )
}
