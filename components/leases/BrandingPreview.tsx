"use client"

const CLAUSE_1 =
  "In this agreement and its annexes — clause headings shall not be used in its interpretation; unless the context clearly indicates a contrary intention, words importing one gender include the others; the singular includes the plural and vice versa."

const CLAUSE_2 =
  "The lessor hereby lets to the lessee, which hereby hires the leased premises on the terms and conditions set out in this agreement."

interface BrandingPreviewProps {
  logoUrl: string | null
  displayName: string
  registration: string
  address: string
  phone: string
  email: string
  website: string
  accentColor: string
  leaseType?: "residential" | "commercial"
}

function dividerStyle(color: string) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(color)
  return { backgroundColor: valid ? color : "#d4d4d8" }
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-[260px] shrink-0 bg-white border border-zinc-200 rounded-sm shadow-sm overflow-hidden flex flex-col"
      style={{ height: "368px" }}
    >
      {children}
    </div>
  )
}

function LogoOrPlaceholder({
  logoUrl,
  size,
}: {
  logoUrl: string | null
  size: "large" | "small"
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt="Agency logo"
        className={size === "large" ? "max-w-[120px] max-h-[56px] object-contain" : "h-[18px] w-auto object-contain shrink-0"}
      />
    )
  }
  if (size === "large") {
    return (
      <div className="w-[80px] h-[44px] border border-dashed border-zinc-300 rounded flex items-center justify-center">
        <span className="text-[7.5px] text-zinc-400 text-center leading-tight">Upload<br />logo</span>
      </div>
    )
  }
  return <div className="w-[28px] h-[16px] border border-dashed border-zinc-300 rounded shrink-0" />
}

function Muted({ text }: { text: string }) {
  return <span className="text-zinc-400 italic font-normal">{text}</span>
}

export function BrandingPreview({
  logoUrl,
  displayName,
  registration,
  address,
  phone,
  email,
  website,
  accentColor,
  leaseType = "residential",
}: BrandingPreviewProps) {
  const ds = dividerStyle(accentColor)
  const contactLine = [address, phone, email, website].filter(Boolean).join(" · ")
  const title = `${leaseType === "commercial" ? "Commercial" : "Residential"} Lease Agreement`

  return (
    <div className="flex gap-4 justify-center flex-wrap">
      {/* Page 1: Cover page */}
      <PageShell>
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-5 py-4 text-center text-zinc-800">
          <LogoOrPlaceholder logoUrl={logoUrl} size="large" />

          <div className="w-full h-px" style={ds} />

          <div>
            <p className="text-[8.5px] font-bold uppercase tracking-wide leading-snug">{title}</p>
            <p className="text-[7.5px] text-zinc-500 mt-1">prepared by</p>
          </div>

          <div>
            <p className="text-[9px] font-semibold leading-snug">
              {displayName ? displayName : <Muted text="[Agency name]" />}
            </p>
            {registration ? (
              <p className="text-[7.5px] text-zinc-500 mt-0.5">{registration}</p>
            ) : (
              <p className="text-[7.5px] mt-0.5"><Muted text="[Registration number]" /></p>
            )}
          </div>

          <div className="w-full h-px" style={ds} />

          <div className="space-y-0.5">
            {address ? (
              <p className="text-[7.5px] text-zinc-600">{address}</p>
            ) : (
              <p className="text-[7.5px]"><Muted text="[Address]" /></p>
            )}
            <p className="text-[7.5px] text-zinc-600">
              {[phone, email, website].filter(Boolean).join(" · ") || <Muted text="[Phone · Email · Website]" />}
            </p>
          </div>
        </div>
        <p className="text-[6.5px] text-zinc-400 text-center pb-2">Page 1</p>
      </PageShell>

      {/* Page 2: Regular clause page */}
      <PageShell>
        {/* Header */}
        <div className="px-3 pt-2 pb-1.5 shrink-0">
          <div className="flex items-center gap-1">
            <LogoOrPlaceholder logoUrl={logoUrl} size="small" />
            <p className="flex-1 text-[7px] font-medium text-zinc-600 text-center truncate">
              {displayName ? displayName : <Muted text="[Agency name]" />}
            </p>
            <p className="text-[6.5px] text-zinc-400 shrink-0">Page 2</p>
          </div>
          <div className="mt-1.5 h-px" style={ds} />
        </div>

        {/* Clause body */}
        <div className="flex-1 overflow-hidden px-3 py-1 space-y-2">
          <div>
            <p className="text-[8px] font-semibold text-zinc-800">1. Interpretation</p>
            <p className="text-[7px] text-zinc-600 leading-relaxed mt-0.5 line-clamp-4">{CLAUSE_1}</p>
          </div>
          <div>
            <p className="text-[8px] font-semibold text-zinc-800">2. Lease</p>
            <p className="text-[7px] text-zinc-600 leading-relaxed mt-0.5 line-clamp-3">{CLAUSE_2}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 pb-2 shrink-0">
          <div className="h-px mb-1.5" style={ds} />
          <p className="text-[6.5px] text-zinc-400 text-center truncate">
            {contactLine || <Muted text="[Address · Phone · Email]" />}
          </p>
        </div>
      </PageShell>
    </div>
  )
}
