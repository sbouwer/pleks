import type { CoverTemplateProps } from "./types"
import { PartiesSection } from "./PartiesSection"

export function MinimalCover({ identity, branding, leaseType = "residential", parties }: Readonly<CoverTemplateProps>) {
  const title = `${leaseType === "commercial" ? "Commercial" : "Residential"} Lease Agreement`
  const displayName = identity.tradingAs || identity.name || null
  const contactLine = [identity.address, identity.phone, identity.email].filter(Boolean).join("  ·  ")
  const accent = branding.accentColor

  return (
    <div className="h-full flex flex-col px-10 py-12 bg-white">

      {/* Top branding block */}
      <div className="flex flex-col items-center text-center mb-auto">
        <p className="text-xl font-bold text-gray-900 leading-snug mb-3">{title}</p>

        <p className="text-sm font-medium text-gray-700">
          {displayName ?? <span className="text-gray-400 italic">[Agency name]</span>}
        </p>
        {identity.registration && (
          <p className="text-[10px] text-gray-400 mt-0.5">{identity.registration}</p>
        )}

        <div className="mt-5 h-[2px] w-10 rounded" style={{ background: accent }} />
      </div>

      {/* Parties block — expands to fill space between title and footer */}
      {parties && (
        <div className="my-6">
          <div className="border-t mb-4" style={{ borderColor: `${accent}40` }} />
          <PartiesSection parties={parties} />
        </div>
      )}

      {/* Bottom: logo + contact */}
      <div className="mt-auto text-center">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="max-w-[70px] max-h-[36px] object-contain mx-auto mb-2" />
        ) : (
          <div className="w-14 h-8 border border-dashed rounded flex items-center justify-center text-[9px] text-gray-400 mx-auto mb-2"
            style={{ borderColor: `${accent}40` }}>
            Logo
          </div>
        )}
        {contactLine && (
          <p className="text-[10px] text-gray-400">{contactLine}</p>
        )}
      </div>

    </div>
  )
}
