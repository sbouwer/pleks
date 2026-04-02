"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Download } from "lucide-react"
import { ClassicCover } from "@/components/branding/templates/ClassicCover"
import { ModernCover } from "@/components/branding/templates/ModernCover"
import { BoldCover } from "@/components/branding/templates/BoldCover"
import { MinimalCover } from "@/components/branding/templates/MinimalCover"

interface PreviewClause {
  number: number
  key: string
  title: string
  body: string
  is_required: boolean
}

interface PreviewBranding {
  displayName: string | null
  tradingAs: string | null
  registration: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  accentColor: string | null
  layout: string
  logoUrl: string | null
}

interface PreviewBanking {
  accountHolder: string
  bankName: string
  accountNumber: string
  branchCode: string
  configured: boolean
}

interface PreviewData {
  clauses: PreviewClause[]
  leaseType: string
  totalClauses: number
  branding: PreviewBranding
  banking: PreviewBanking
}

interface LeasePreviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leaseType: string
}

function dividerStyle(color: string | null) {
  const valid = color && /^#[0-9a-fA-F]{6}$/.test(color)
  return { borderColor: valid ? color : undefined }
}

const TOTAL_PAGES = 7

function PageHeader({ branding, page }: Readonly<{ branding: PreviewBranding; page: number }>) {
  const ds = dividerStyle(branding.accentColor)
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-2">
        {branding.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="h-8 w-auto object-contain shrink-0" />
        )}
        <span className="flex-1 text-xs font-medium text-foreground/70 text-center truncate">
          {branding.displayName ?? ""}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">Page {page} of {TOTAL_PAGES}</span>
      </div>
      <hr className="border-t" style={ds} />
    </div>
  )
}

function InitialsBar() {
  return (
    <div className="flex gap-8 justify-end mt-3">
      <span className="text-[10px] text-muted-foreground">
        Lessor initials: <span className="inline-block w-16 border-b border-foreground/25 align-bottom" />
      </span>
      <span className="text-[10px] text-muted-foreground">
        Lessee initials: <span className="inline-block w-16 border-b border-foreground/25 align-bottom" />
      </span>
    </div>
  )
}

function PageFooter({ branding, showInitials = false }: Readonly<{ branding: PreviewBranding; showInitials?: boolean }>) {
  const ds = dividerStyle(branding.accentColor)
  const line = [branding.address, branding.phone, branding.email]
    .filter(Boolean)
    .join(" · ")
  return (
    <div className="mt-6">
      {showInitials && <InitialsBar />}
      <hr className="border-t mt-3 mb-2" style={ds} />
      {line && <p className="text-[11px] text-muted-foreground text-center">{line}</p>}
    </div>
  )
}

function PageBreak({ branding, page, showInitials = false }: Readonly<{ branding: PreviewBranding; page: number; showInitials?: boolean }>) {
  const ds = dividerStyle(branding.accentColor)
  const line = [branding.address, branding.phone, branding.email]
    .filter(Boolean)
    .join(" · ")
  return (
    <div className="my-8">
      {showInitials && <InitialsBar />}
      <hr className="border-t mt-3 mb-2" style={ds} />
      {line && <p className="text-[11px] text-muted-foreground text-center mb-6">{line}</p>}
      <div className="border-t border-border/20 mb-6" />
      <PageHeader branding={branding} page={page} />
    </div>
  )
}

const COVER_COMPONENTS = {
  classic: ClassicCover,
  modern:  ModernCover,
  bold:    BoldCover,
  minimal: MinimalCover,
} as const

function CoverPage({ branding, leaseType }: Readonly<{ branding: PreviewBranding; leaseType: string }>) {
  const Component = COVER_COMPONENTS[branding.layout as keyof typeof COVER_COMPONENTS] ?? ClassicCover
  const identity = {
    name: branding.displayName ?? "",
    tradingAs: branding.tradingAs ?? null,
    registration: branding.registration ?? null,
    eaab: null,
    address: branding.address ?? "",
    phone: branding.phone ?? "",
    email: branding.email ?? "",
    website: branding.website ?? null,
  }
  const coverBranding = {
    logoUrl: branding.logoUrl,
    accentColor: branding.accentColor ?? "#1a3a5c",
  }
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden mb-4" style={{ aspectRatio: "1/1.414", maxWidth: "100%" }}>
      <Component identity={identity} branding={coverBranding} leaseType={leaseType} />
    </div>
  )
}

const TOKEN_CLASSES = `
  [&_.token-ref]:inline-block [&_.token-ref]:px-1.5 [&_.token-ref]:py-0.5
  [&_.token-ref]:rounded [&_.token-ref]:border [&_.token-ref]:border-brand/40
  [&_.token-ref]:bg-brand/10 [&_.token-ref]:text-brand [&_.token-ref]:text-[11px] [&_.token-ref]:mx-0.5
  [&_.token-self]:inline-block [&_.token-self]:px-1.5 [&_.token-self]:py-0.5
  [&_.token-self]:rounded [&_.token-self]:border [&_.token-self]:border-blue-400/40
  [&_.token-self]:bg-blue-400/10 [&_.token-self]:text-blue-400 [&_.token-self]:text-[11px] [&_.token-self]:mx-0.5
  [&_.token-var]:inline-block [&_.token-var]:px-1.5 [&_.token-var]:py-0.5
  [&_.token-var]:rounded [&_.token-var]:border [&_.token-var]:border-green-400/40
  [&_.token-var]:bg-green-400/10 [&_.token-var]:text-green-400 [&_.token-var]:text-[11px] [&_.token-var]:mx-0.5
`.trim()

function AnnexureHeading({ label }: Readonly<{ label: string }>) {
  return (
    <p className="text-sm font-semibold text-center uppercase tracking-wide pt-6 pb-4 border-t border-border/30 mt-2">
      ANNEXURE {label}
    </p>
  )
}

function chip(label: string, color: "green" | "amber" | "blue") {
  const classes = {
    green: "border-green-400/40 bg-green-400/10 text-green-400",
    amber: "border-brand/40 bg-brand/10 text-brand",
    blue: "border-blue-400/40 bg-blue-400/10 text-blue-400",
  }[color]
  return `<span class="inline-block px-1.5 py-0.5 rounded border ${classes} text-[11px] mx-0.5">[${label}]</span>`
}

function AnnexureA() {
  return (
    <div className="space-y-2 text-sm text-foreground/90 leading-relaxed">
      <div className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-1.5 text-sm">
        {[
          ["Monthly rental", chip("monthly rent", "green")],
          ["Security deposit", chip("deposit amount", "green")],
          ["Escalation", `${chip("escalation percent", "green")}% per annum (${chip("escalation type", "green")})`],
          ["Payment due", `${chip("payment due day", "green")} of each month`],
          ["Lease commencement", chip("start date", "green")],
          ["Lease expiry", chip("end date", "green")],
          ["Additional charges", chip("charges list", "green")],
        ].map(([label, val]) => (
          <div key={label} className="contents">
            <span className="text-muted-foreground text-xs self-start pt-0.5">{label}</span>
            <span
              className={TOKEN_CLASSES}
              dangerouslySetInnerHTML={{ __html: val }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function AnnexureB({ banking }: Readonly<{ banking: PreviewBanking }>) {
  const rows = banking.configured
    ? [
        ["Account name", banking.accountHolder],
        ["Bank", banking.bankName],
        ["Account number", banking.accountNumber],
        ["Branch code", banking.branchCode],
      ]
    : [
        ["Account name", chip("trust account name", "green")],
        ["Bank", chip("bank name", "green")],
        ["Account number", chip("account number", "green")],
        ["Branch code", chip("branch code", "green")],
      ]

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        Payment of rental and deposit must be made into the following trust account:
      </p>
      <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, val]) => (
          <div key={label} className="contents">
            <span className="text-muted-foreground text-xs self-start pt-0.5">{label}</span>
            {banking.configured ? (
              <span className="text-sm">{val}</span>
            ) : (
              <span
                className={TOKEN_CLASSES}
                dangerouslySetInnerHTML={{ __html: val }}
              />
            )}
          </div>
        ))}
      </div>
      {!banking.configured && (
        <p className="text-xs text-amber-500/80 mt-3">
          Banking details not configured — <a href="/settings/compliance" className="underline">Configure now</a>
        </p>
      )}
    </div>
  )
}

function AnnexureC() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>The following rules apply to the leased premises and common areas:</p>
      <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 mt-3">
        {["Pets", "Smoking", "Parking", "Noise", "Common areas"].map((rule) => (
          <div key={rule} className="contents">
            <span className="text-xs text-muted-foreground self-start pt-0.5">{rule}</span>
            <span
              className={TOKEN_CLASSES}
              dangerouslySetInnerHTML={{ __html: chip(`as per property rules`, "green") }}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground/70 mt-3 italic">
        Property rules are configured per property in your portfolio.
      </p>
    </div>
  )
}

function AnnexureD() {
  return (
    <div className="text-sm text-muted-foreground space-y-2">
      <p>The following special agreements apply between the parties:</p>
      <div className="mt-3 rounded border border-border/40 bg-muted/30 px-4 py-3 text-xs text-muted-foreground/70 italic">
        Special agreements are added during lease creation — pet permissions, parking allocations,
        and any custom terms negotiated with the tenant.
      </div>
    </div>
  )
}


function SignatureBlock({ role, optional }: Readonly<{ role: string; optional?: boolean }>) {
  return (
    <div className="border border-border/50 rounded-lg p-4 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
        {role}{optional && <span className="normal-case font-normal text-muted-foreground"> (if applicable)</span>}
      </p>
      <div>
        <p className="text-[10px] text-muted-foreground mb-1">Full name</p>
        <div className="h-6 border-b border-foreground/20" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Signature</p>
          <div className="h-10 border border-border/40 rounded" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Date</p>
          <div className="h-10 border border-border/40 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Witness</p>
          <div className="h-10 border border-border/40 rounded" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Witness name</p>
          <div className="h-6 border-b border-foreground/20 mt-4" />
        </div>
      </div>
    </div>
  )
}

function SignatureBlocks({ label }: Readonly<{ label?: string }>) {
  return (
    <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="grid grid-cols-2 gap-3">
        <SignatureBlock role="Lessor" />
        <SignatureBlock role="Agent" optional />
        <SignatureBlock role="Lessee 1" />
        <SignatureBlock role="Lessee 2" optional />
      </div>
    </div>
  )
}

export function LeasePreview({ open, onOpenChange, leaseType: initialLeaseType }: Readonly<LeasePreviewProps>) {
  const [localLeaseType, setLocalLeaseType] = useState(initialLeaseType)
  const [data, setData] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true) // eslint-disable-line react-hooks/set-state-in-effect
    setError(false)
    fetch(`/api/leases/preview-template?leaseType=${localLeaseType}`)
      .then((r) => r.json())
      .then((d: PreviewData) => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [open, localLeaseType])

  const branding = data?.branding ?? {
    displayName: null, tradingAs: null, registration: null, address: null,
    phone: null, email: null, website: null, accentColor: null, layout: "classic", logoUrl: null,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-5xl sm:max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>Lease preview</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Full document as generated — tokens are filled from lease data at creation time.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Tabs value={localLeaseType} onValueChange={setLocalLeaseType}>
                <TabsList className="h-8">
                  <TabsTrigger value="residential" className="text-xs px-3 h-7">Residential</TabsTrigger>
                  <TabsTrigger value="commercial" className="text-xs px-3 h-7">Commercial</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => toast.info("Sample DOCX download coming soon")}
              >
                <Download className="size-3.5 mr-1" /> Sample
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          <style>{`
            .clause-para { display: table; width: 100%; font-size: 13px; line-height: 1.8; margin: 0 0 8px; border-spacing: 0; }
            .clause-para[data-depth="0"] { padding-left: 0; }
            .clause-para[data-depth="1"] { padding-left: 28px; }
            .clause-para[data-depth="2"] { padding-left: 56px; }
            .clause-para[data-depth="3"] { padding-left: 84px; }
            .clause-para[data-depth="4"] { padding-left: 112px; }
            .clause-number { display: table-cell; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: top; padding-right: 10px; width: 1px; }
            .clause-text { display: table-cell; text-align: justify; text-justify: inter-word; vertical-align: top; width: auto; }
            .clause-intro { display: block; font-size: 13px; line-height: 1.8; margin: 0 0 8px; text-align: justify; }
          `}</style>

          {loading && <p className="text-sm text-muted-foreground">Loading preview…</p>}
          {error && <p className="text-sm text-muted-foreground">Failed to load preview. Please try again.</p>}

          {!loading && !error && data && (
            <div>
              {/* Token legend */}
              <div className="flex flex-wrap gap-3 text-xs mb-6 pb-4 border-b border-border/30">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-brand/40 bg-brand/10 text-brand text-[10px]">clause N</span>
                  {" "}Clause reference
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-blue-400/40 bg-blue-400/10 text-blue-400 text-[10px]">[N]</span>
                  {" "}Sub-clause
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-green-400/40 bg-green-400/10 text-green-400 text-[10px]">[field]</span>
                  {" "}Filled from lease data
                </span>
              </div>

              {/* Cover page */}
              <CoverPage branding={branding} leaseType={localLeaseType} />

              {/* Page 2: first clause page */}
              <div className="rounded-lg border border-border/60 bg-card px-14 py-10 mb-4">
                <PageHeader branding={branding} page={2} />

                <div className="space-y-6">
                  {data.clauses.map((clause) => (
                    <div key={clause.key}>
                      <p className="text-sm font-semibold mb-2 uppercase tracking-wide">
                        {clause.number}. {clause.title}
                      </p>
                      {clause.key === "signatures" ? (
                        <SignatureBlocks />
                      ) : (
                        <div
                          className={TOKEN_CLASSES}
                          dangerouslySetInnerHTML={{ __html: clause.body }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <PageBreak branding={branding} page={3} showInitials />

                {/* Annexure A */}
                <AnnexureHeading label="A: Rental Calculation" />
                <AnnexureA />
                <SignatureBlocks label="Signed in acknowledgement of Annexure A" />

                <PageBreak branding={branding} page={4} />

                {/* Annexure B */}
                <AnnexureHeading label="B: Banking Details" />
                <AnnexureB banking={data.banking} />
                <SignatureBlocks label="Signed in acknowledgement of Annexure B" />

                <PageBreak branding={branding} page={5} />

                {/* Annexure C */}
                <AnnexureHeading label="C: Property Rules" />
                <AnnexureC />
                <SignatureBlocks label="Signed in acknowledgement of Annexure C" />

                <PageBreak branding={branding} page={6} />

                {/* Annexure D */}
                <AnnexureHeading label="D: Special Agreements" />
                <AnnexureD />
                <SignatureBlocks label="Signed in acknowledgement of Annexure D" />

                <PageFooter branding={branding} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
