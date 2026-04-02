import type { CoverTemplateProps } from "./types"
import { PartiesSection } from "./PartiesSection"

export function ModernCover({ identity, branding, leaseType = "residential", parties }: Readonly<CoverTemplateProps>) {
  const typeLabel = leaseType === "commercial" ? "COMMERCIAL" : "RESIDENTIAL"
  const displayName = identity.tradingAs || identity.name || null
  const contactLine = [identity.address, identity.phone, identity.email].filter(Boolean).join("  ·  ")
  const accent = branding.accentColor

  return (
    <div className="h-full flex flex-col bg-white px-10 py-12">

      {/* Logo + accent bar */}
      <div className="mb-8">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="max-w-[140px] max-h-[60px] object-contain mb-3" />
        ) : (
          <div className="w-24 h-10 border-2 border-dashed rounded flex items-center justify-center text-[9px] text-gray-400 mb-3"
            style={{ borderColor: `${accent}40` }}>
            Upload logo
          </div>
        )}
        <div className="h-[3px] w-10 rounded" style={{ background: accent }} />
      </div>

      {/* Title block */}
      <div className="mb-6">
        <p className="text-2xl font-bold tracking-tight text-gray-800 leading-none">{typeLabel}</p>
        <p className="text-2xl font-bold tracking-tight text-gray-800 leading-none mt-0.5">LEASE</p>
        <p className="text-2xl font-bold tracking-tight text-gray-800 leading-none mt-0.5">AGREEMENT</p>

        <div className="mt-5">
          <p className="text-sm font-semibold text-gray-800">
            {displayName ?? <span className="text-gray-400 italic">[Agency name]</span>}
          </p>
          {identity.registration && (
            <p className="text-[10px] text-gray-400 mt-0.5">{identity.registration}</p>
          )}
        </div>
      </div>

      {/* Parties block */}
      {parties && (
        <div className="flex-1 flex flex-col justify-end mb-4">
          <div className="border-t mb-4" style={{ borderColor: accent }} />
          <PartiesSection parties={parties} />
        </div>
      )}

      {/* Bottom contact bar */}
      <div className="border-t pt-3 mt-auto" style={{ borderColor: `${accent}40` }}>
        {contactLine ? (
          <p className="text-[10px] text-gray-400">{contactLine}</p>
        ) : (
          <p className="text-[10px] text-gray-400 italic">[Contact details]</p>
        )}
      </div>

    </div>
  )
}
