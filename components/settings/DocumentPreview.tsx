"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ClassicCover } from "@/components/branding/templates/ClassicCover"
import { ModernCover } from "@/components/branding/templates/ModernCover"
import { BoldCover } from "@/components/branding/templates/BoldCover"
import { MinimalCover } from "@/components/branding/templates/MinimalCover"
import type { CoverIdentity, CoverBranding } from "@/components/branding/templates/types"

interface DocumentPreviewProps {
  logoUrl: string | null
  accentColor: string
  coverTemplate: "classic" | "modern" | "bold" | "minimal"
}

// A4 paper container
function Paper({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className="bg-white border border-border/60 rounded-lg overflow-hidden mx-auto shadow-sm"
      style={{ aspectRatio: "1/1.414", maxWidth: "480px" }}
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

// ── Lease page mock ───────────────────────────────────────────────────────────
function LeasePagePreview({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const line = [identity.address, identity.phone, identity.email].filter(Boolean).join(" · ")
  const accent = branding.accentColor
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8 text-[10px]" style={{ color: "#333" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        {branding.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="h-6 w-auto object-contain shrink-0" />
        )}
        <span className="flex-1 text-center font-medium truncate" style={{ color: "#555" }}>
          {identity.tradingAs || identity.name || "Agency"}
        </span>
        <span style={{ color: "#999" }}>Page 2 of 7</span>
      </div>
      <div className="border-t mb-5" style={{ borderColor: accent }} />

      {/* Sample clauses */}
      {[
        { num: "1.", title: "DEFINITIONS", body: "In this agreement, unless the context indicates otherwise, the following words and expressions bear the meanings assigned to them hereunder…" },
        { num: "2.", title: "COMMENCEMENT AND DURATION", body: "This lease shall commence on [start date] and shall endure for a period of [lease duration] months, terminating on [end date], unless cancelled in accordance with the provisions hereof…" },
        { num: "3.", title: "RENTAL", body: "The Lessee shall pay to the Lessor a monthly rental of [monthly rent], payable in advance on or before the [payment due day] day of each and every month…" },
      ].map((c) => (
        <div key={c.num} className="mb-4">
          <p className="font-semibold uppercase tracking-wide mb-1" style={{ fontSize: "9px" }}>
            {c.num} {c.title}
          </p>
          <p style={{ lineHeight: 1.7, color: "#444", fontSize: "9px" }}>{c.body}</p>
        </div>
      ))}

      <div className="flex gap-8 justify-end mt-3">
        <span style={{ color: "#999", fontSize: "9px" }}>Lessor initials: <span className="inline-block w-10 border-b" style={{ borderColor: "#ccc" }} /></span>
        <span style={{ color: "#999", fontSize: "9px" }}>Lessee initials: <span className="inline-block w-10 border-b" style={{ borderColor: "#ccc" }} /></span>
      </div>

      {/* Footer */}
      <div className="mt-auto">
        <div className="border-t mt-3 mb-2" style={{ borderColor: accent }} />
        {line && <p className="text-center" style={{ color: "#aaa", fontSize: "9px" }}>{line}</p>}
      </div>
    </div>
  )
}

// ── Invoice mock ──────────────────────────────────────────────────────────────
function InvoicePreview({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const accent = branding.accentColor
  const displayName = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8" style={{ color: "#333", fontSize: "9px" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="max-w-[100px] max-h-[40px] object-contain mb-1" />
          ) : (
            <div className="w-16 h-8 border border-dashed rounded flex items-center justify-center mb-1"
              style={{ borderColor: `${accent}40`, color: "#bbb" }}>Logo</div>
          )}
          <p style={{ color: "#999" }}>{identity.address || "[Address]"}</p>
          <p style={{ color: "#999" }}>{identity.phone || "[Phone]"} · {identity.email || "[Email]"}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-xs mb-1" style={{ color: accent }}>TAX INVOICE</p>
          <p style={{ color: "#555" }}>Invoice #: INV-2026-0042</p>
          <p style={{ color: "#555" }}>Date: 1 March 2026</p>
        </div>
      </div>
      <div className="border-t mb-3" style={{ borderColor: accent }} />

      {/* Bill to */}
      <div className="mb-4">
        <p className="font-medium mb-1">{displayName}</p>
        <p style={{ color: "#777" }}>Re: 14 Rose Street, Unit 3, Cape Town</p>
        <p style={{ color: "#777" }}>Tenant: J. Van der Merwe</p>
      </div>

      {/* Line items */}
      <table className="w-full mb-3" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: `${accent}15` }}>
            {["Description", "Amount"].map((h) => (
              <th key={h} className="text-left py-1 px-2 font-semibold" style={{ fontSize: "8px", color: accent }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[["Monthly rental — March 2026", "R 9,500.00"], ["Admin levy", "R 250.00"], ["Water & electricity", "R 680.00"]].map(([d, a]) => (
            <tr key={d} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td className="py-1 px-2" style={{ color: "#555" }}>{d}</td>
              <td className="py-1 px-2 text-right">{a}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1 px-2">Total (excl. VAT)</td>
            <td className="py-1 px-2 text-right">R 10,430.00</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-auto">
        <p className="font-medium mb-1" style={{ color: accent }}>Banking details</p>
        <p style={{ color: "#777" }}>Account: {displayName} · Bank: FNB · Acc: 62xxxxxxxx · Branch: 250655</p>
      </div>
    </div>
  )
}

// ── Email mock ────────────────────────────────────────────────────────────────
function EmailPreview({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const accent = branding.accentColor
  const displayName = identity.tradingAs || identity.name || "Agency"
  return (
    <div className="h-full flex flex-col bg-white" style={{ color: "#333", fontSize: "9px" }}>
      {/* Email header */}
      <div className="px-10 py-6 text-center" style={{ background: "#fafafa" }}>
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="max-w-[100px] max-h-[40px] object-contain mx-auto" />
        ) : (
          <div className="w-20 h-8 border border-dashed rounded flex items-center justify-center mx-auto"
            style={{ borderColor: `${accent}40`, color: "#bbb" }}>Logo</div>
        )}
      </div>
      <div className="h-[2px]" style={{ background: accent }} />

      {/* Body */}
      <div className="flex-1 px-10 py-6">
        <p className="mb-3">Dear J. Van der Merwe,</p>
        <p style={{ lineHeight: 1.7, color: "#555" }}>
          Please find attached your monthly invoice for March 2026 for the property at
          14 Rose Street, Unit 3. Payment is due by 1 March 2026.
        </p>
        <p className="mt-3" style={{ lineHeight: 1.7, color: "#555" }}>
          Should you have any queries, please don&apos;t hesitate to contact us.
        </p>
        <div className="mt-6 pt-4 border-t" style={{ borderColor: "#eee" }}>
          <p className="font-medium">{displayName}</p>
          <p style={{ color: "#777" }}>{identity.phone || "[Phone]"}</p>
          <p style={{ color: "#777" }}>{identity.email || "[Email]"}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-10 py-4 text-center" style={{ background: "#fafafa", borderTop: "1px solid #eee" }}>
        <p style={{ color: "#aaa" }}>{identity.address || "[Address]"}</p>
        <p style={{ color: "#bbb", marginTop: 2 }}>Unsubscribe · View in browser</p>
      </div>
    </div>
  )
}

// ── Letter mock ───────────────────────────────────────────────────────────────
function LetterPreview({ identity, branding }: Readonly<{ identity: CoverIdentity; branding: CoverBranding }>) {
  const accent = branding.accentColor
  const displayName = identity.tradingAs || identity.name || "Agency"
  const regLine = identity.registration ? `Reg: ${identity.registration}` : null
  return (
    <div className="h-full flex flex-col bg-white px-10 py-8" style={{ color: "#333", fontSize: "9px" }}>
      {/* Letterhead */}
      <div className="flex items-start justify-between mb-4">
        <div>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="max-w-[100px] max-h-[40px] object-contain mb-1" />
          ) : (
            <div className="w-16 h-8 border border-dashed rounded flex items-center justify-center mb-1"
              style={{ borderColor: `${accent}40`, color: "#bbb" }}>Logo</div>
          )}
        </div>
        <div className="text-right" style={{ color: "#666" }}>
          <p className="font-semibold" style={{ color: "#333" }}>{displayName}</p>
          <p>{identity.address || "[Address]"}</p>
          {regLine && <p>{regLine}</p>}
          <p>{identity.phone || ""} · {identity.email || ""}</p>
        </div>
      </div>
      <div className="border-t mb-5" style={{ borderColor: accent }} />

      {/* Letter body */}
      <p style={{ color: "#999" }}>1 March 2026</p>
      <div className="mt-3 mb-3">
        <p>J. Van der Merwe</p>
        <p style={{ color: "#777" }}>14 Rose Street, Unit 3</p>
        <p style={{ color: "#777" }}>Cape Town, 8001</p>
      </div>
      <p className="font-medium mb-3"><strong>RE: 14 Rose Street, Unit 3 — Lease Renewal Notice</strong></p>
      <p style={{ lineHeight: 1.7, color: "#555" }}>
        We wish to advise you that your current lease agreement expires on 30 April 2026.
        Please contact our office within 30 days to discuss renewal terms.
      </p>
      <div className="mt-auto pt-6">
        <p style={{ color: "#777" }}>Yours faithfully,</p>
        <div className="mt-4 mb-1 border-b w-24" style={{ borderColor: "#ccc" }} />
        <p className="font-medium">{displayName}</p>
        <p style={{ color: "#777" }}>Property Manager</p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function DocumentPreview({ logoUrl, accentColor, coverTemplate }: Readonly<DocumentPreviewProps>) {
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

  const CoverComponent = {
    classic: ClassicCover,
    modern: ModernCover,
    bold: BoldCover,
    minimal: MinimalCover,
  }[coverTemplate] ?? ClassicCover

  return (
    <Tabs defaultValue="cover">
      <TabsList className="mb-4">
        <TabsTrigger value="cover">Cover page</TabsTrigger>
        <TabsTrigger value="lease">Lease page</TabsTrigger>
        <TabsTrigger value="invoice">Invoice</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
        <TabsTrigger value="letter">Letter</TabsTrigger>
      </TabsList>

      <TabsContent value="cover">
        <Paper><CoverComponent identity={identity} branding={branding} /></Paper>
      </TabsContent>

      <TabsContent value="lease">
        <Paper><LeasePagePreview identity={identity} branding={branding} /></Paper>
        <MockupNote type="Lease documents" />
      </TabsContent>

      <TabsContent value="invoice">
        <Paper><InvoicePreview identity={identity} branding={branding} /></Paper>
        <MockupNote type="Invoices" />
      </TabsContent>

      <TabsContent value="email">
        <Paper><EmailPreview identity={identity} branding={branding} /></Paper>
        <MockupNote type="Emails" />
      </TabsContent>

      <TabsContent value="letter">
        <Paper><LetterPreview identity={identity} branding={branding} /></Paper>
        <MockupNote type="Letters" />
      </TabsContent>
    </Tabs>
  )
}
