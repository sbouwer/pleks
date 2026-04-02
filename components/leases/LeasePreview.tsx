"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Download } from "lucide-react"

interface PreviewClause {
  number: number
  key: string
  title: string
  body: string
  is_required: boolean
}

interface PreviewBranding {
  displayName: string | null
  registration: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  accentColor: string | null
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

function PageHeader({ branding, page }: { branding: PreviewBranding; page: number }) {
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
        <span className="text-xs text-muted-foreground shrink-0">Page {page}</span>
      </div>
      <hr className="border-t" style={ds} />
    </div>
  )
}

function PageFooter({ branding }: { branding: PreviewBranding }) {
  const ds = dividerStyle(branding.accentColor)
  const line = [branding.address, branding.phone, branding.email]
    .filter(Boolean)
    .join(" · ")
  if (!line) return null
  return (
    <div className="mt-6">
      <hr className="border-t mb-2" style={ds} />
      <p className="text-[11px] text-muted-foreground text-center">{line}</p>
    </div>
  )
}

function PageBreak({ branding, page }: { branding: PreviewBranding; page: number }) {
  const ds = dividerStyle(branding.accentColor)
  const line = [branding.address, branding.phone, branding.email]
    .filter(Boolean)
    .join(" · ")
  return (
    <div className="my-8">
      {line && (
        <>
          <hr className="border-t mb-2" style={ds} />
          <p className="text-[11px] text-muted-foreground text-center mb-6">{line}</p>
        </>
      )}
      <div className="border-t border-border/20 mb-6" />
      <PageHeader branding={branding} page={page} />
    </div>
  )
}

function CoverPage({ branding, leaseType }: { branding: PreviewBranding; leaseType: string }) {
  const ds = dividerStyle(branding.accentColor)
  const contactLine = [branding.phone, branding.email, branding.website].filter(Boolean).join("  ·  ")
  const title = `${leaseType === "commercial" ? "Commercial" : "Residential"} Lease Agreement`

  return (
    <div className="rounded-lg border border-border/60 bg-card px-12 py-16 text-center mb-4">
      {branding.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt="Agency logo"
          className="max-w-[200px] max-h-[100px] object-contain mx-auto mb-8"
        />
      )}

      <hr className="border-t mb-8" style={ds} />

      <p className="text-base font-bold uppercase tracking-widest mb-6">{title}</p>
      <p className="text-xs text-muted-foreground mb-4">prepared by</p>

      <p className="text-sm font-semibold">
        {branding.displayName ?? <span className="text-muted-foreground italic">[Agency name]</span>}
      </p>
      {branding.registration && (
        <p className="text-xs text-muted-foreground mt-1">{branding.registration}</p>
      )}

      <hr className="border-t mt-8 mb-6" style={ds} />

      {branding.address && (
        <p className="text-xs text-muted-foreground mb-1">{branding.address}</p>
      )}
      {contactLine && (
        <p className="text-xs text-muted-foreground">{contactLine}</p>
      )}

      <p className="text-xs text-muted-foreground/50 mt-12">Page 1</p>
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

function AnnexureHeading({ label }: { label: string }) {
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

function AnnexureB({ banking }: { banking: PreviewBanking }) {
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

function SignaturePage() {
  const block = (role: string, nameVar: string) => (
    <div key={role} className="space-y-4">
      <p className="text-sm font-semibold uppercase tracking-wide">{role}</p>
      <div
        className={TOKEN_CLASSES}
        dangerouslySetInnerHTML={{ __html: `Name: ${chip(nameVar, "green")}` }}
      />
      <div className="grid grid-cols-2 gap-8">
        <div>
          <div className="border-b border-foreground/30 pb-0.5 mb-1" />
          <p className="text-xs text-muted-foreground">Signature</p>
        </div>
        <div>
          <div className="border-b border-foreground/30 pb-0.5 mb-1" />
          <p className="text-xs text-muted-foreground">Date</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-8">
      {block("Lessor", "lessor name")}
      {block("Lessee", "lessee name")}
      <div className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide">Witness</p>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="border-b border-foreground/30 pb-0.5 mb-1" />
            <p className="text-xs text-muted-foreground">Signature</p>
          </div>
          <div>
            <div className="border-b border-foreground/30 pb-0.5 mb-1" />
            <p className="text-xs text-muted-foreground">Date</p>
          </div>
        </div>
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
    setLoading(true)
    setError(false)
    fetch(`/api/leases/preview-template?leaseType=${localLeaseType}`)
      .then((r) => r.json())
      .then((d: PreviewData) => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [open, localLeaseType])

  const branding = data?.branding ?? {
    displayName: null, registration: null, address: null,
    phone: null, email: null, website: null, accentColor: null, logoUrl: null,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
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
            .clause-para { text-align: justify; text-justify: inter-word; font-size: 13px; line-height: 1.8; margin: 0 0 8px; }
            .clause-para[data-depth="0"] { padding-left: 40px; text-indent: -40px; }
            .clause-para[data-depth="1"] { padding-left: 80px; text-indent: -40px; }
            .clause-para[data-depth="2"] { padding-left: 120px; text-indent: -40px; }
            .clause-number { display: inline; font-variant-numeric: tabular-nums; min-width: 40px; }
            .clause-intro { text-align: justify; text-justify: inter-word; font-size: 13px; line-height: 1.8; margin: 0 0 8px; }
          `}</style>

          {loading && <p className="text-sm text-muted-foreground">Loading preview…</p>}
          {error && <p className="text-sm text-muted-foreground">Failed to load preview. Please try again.</p>}

          {!loading && !error && data && (
            <div>
              {/* Token legend */}
              <div className="flex flex-wrap gap-3 text-xs mb-6 pb-4 border-b border-border/30">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-brand/40 bg-brand/10 text-brand text-[10px]">clause N</span>
                  Clause reference
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-blue-400/40 bg-blue-400/10 text-blue-400 text-[10px]">[N]</span>
                  Sub-clause
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block px-1.5 py-0.5 rounded border border-green-400/40 bg-green-400/10 text-green-400 text-[10px]">[field]</span>
                  Filled from lease data
                </span>
              </div>

              {/* Cover page */}
              <CoverPage branding={branding} leaseType={localLeaseType} />

              {/* Page 2: first clause page */}
              <div className="rounded-lg border border-border/60 bg-card px-10 py-8 mb-4">
                <PageHeader branding={branding} page={2} />

                <div className="space-y-6">
                  {data.clauses.map((clause) => (
                    <div key={clause.key}>
                      <p className="text-sm font-semibold mb-2 uppercase tracking-wide">
                        {clause.number}. {clause.title}
                      </p>
                      <div
                        className={TOKEN_CLASSES}
                        dangerouslySetInnerHTML={{ __html: clause.body }}
                      />
                    </div>
                  ))}
                </div>

                <PageBreak branding={branding} page={3} />

                {/* Annexure A */}
                <AnnexureHeading label="A: Rental Calculation" />
                <AnnexureA />

                <PageBreak branding={branding} page={4} />

                {/* Annexure B */}
                <AnnexureHeading label="B: Banking Details" />
                <AnnexureB banking={data.banking} />

                <PageBreak branding={branding} page={5} />

                {/* Annexure C */}
                <AnnexureHeading label="C: Property Rules" />
                <AnnexureC />

                <PageBreak branding={branding} page={6} />

                {/* Annexure D */}
                <AnnexureHeading label="D: Special Agreements" />
                <AnnexureD />

                <PageBreak branding={branding} page={7} />

                {/* Signature page */}
                <AnnexureHeading label="— Signature Page —" />
                <SignaturePage />

                <PageFooter branding={branding} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
