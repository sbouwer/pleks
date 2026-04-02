import type { CoverTemplateProps } from "./types"

export function ModernCover({ identity, branding, leaseType = "residential" }: Readonly<CoverTemplateProps>) {
  const typeLabel = leaseType === "commercial" ? "COMMERCIAL" : "RESIDENTIAL"
  const displayName = identity.tradingAs || identity.name || null
  const contactLine = [identity.address, identity.phone, identity.email].filter(Boolean).join("  ·  ")
  const accent = branding.accentColor

  return (
    <div className="h-full flex flex-col bg-white px-12 py-14">
      {/* Logo + accent bar */}
      <div className="mb-10">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="max-w-[150px] max-h-[70px] object-contain mb-3" />
        ) : (
          <div className="w-24 h-10 border-2 border-dashed rounded flex items-center justify-center text-[9px] text-gray-400 mb-3"
            style={{ borderColor: `${accent}40` }}>
            Upload logo
          </div>
        )}
        <div className="h-[3px] w-10 rounded" style={{ background: accent }} />
      </div>

      {/* Stacked title */}
      <div className="flex-1">
        <p className="text-3xl font-bold tracking-tight text-gray-800 leading-none">{typeLabel}</p>
        <p className="text-3xl font-bold tracking-tight text-gray-800 leading-none mt-1">LEASE</p>
        <p className="text-3xl font-bold tracking-tight text-gray-800 leading-none mt-1">AGREEMENT</p>

        <div className="mt-8">
          <p className="text-sm font-semibold text-gray-800">
            {displayName ?? <span className="text-gray-400 italic">[Agency name]</span>}
          </p>
          {identity.registration && (
            <p className="text-xs text-gray-400 mt-1">{identity.registration}</p>
          )}
        </div>
      </div>

      {/* Bottom contact bar */}
      <div className="border-t pt-4" style={{ borderColor: accent }}>
        {contactLine ? (
          <p className="text-[11px] text-gray-400">{contactLine}</p>
        ) : (
          <p className="text-[11px] text-gray-400 italic">[Contact details]</p>
        )}
      </div>
    </div>
  )
}
