import type { CoverTemplateProps } from "./types"
import { PartiesSection } from "./PartiesSection"

export function ClassicCover({ identity, branding, leaseType = "residential", parties }: Readonly<CoverTemplateProps>) {
  const title = `${leaseType === "commercial" ? "Commercial" : "Residential"} Lease Agreement`
  const displayName = identity.tradingAs || identity.name || null
  const contactLine = [identity.phone, identity.email, identity.website].filter(Boolean).join("  ·  ")
  const accent = branding.accentColor

  return (
    <div className="h-full flex flex-col items-center justify-between px-10 py-12 text-center bg-white">

      {/* Top: logo + title + prepared-by */}
      <div className="flex flex-col items-center w-full">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="max-w-[180px] max-h-[70px] object-contain mb-6" />
        ) : (
          <div className="w-28 h-12 border-2 border-dashed rounded flex items-center justify-center text-[10px] text-gray-400 mb-6"
            style={{ borderColor: `${accent}40` }}>
            Upload logo
          </div>
        )}

        <div className="w-full border-t mb-6" style={{ borderColor: accent }} />

        <p className="font-bold uppercase tracking-widest text-sm mb-4"
          style={{ color: accent, letterSpacing: "0.15em" }}>
          {title}
        </p>
        <p className="text-[10px] text-gray-400 mb-1">prepared by</p>
        <p className="font-semibold text-sm text-gray-800">
          {displayName ?? <span className="text-gray-400 italic">[Agency name]</span>}
        </p>
        {identity.registration && (
          <p className="text-[10px] text-gray-400 mt-0.5">{identity.registration}</p>
        )}
        {identity.eaab && (
          <p className="text-[10px] text-gray-400">FFC: {identity.eaab}</p>
        )}
      </div>

      {/* Parties block — only when lease data is available */}
      {parties && (
        <div className="w-full my-4">
          <div className="w-full border-t mb-4" style={{ borderColor: accent }} />
          <PartiesSection parties={parties} />
        </div>
      )}

      {/* Bottom: contact line */}
      <div className="w-full">
        <div className="w-full border-t mb-3" style={{ borderColor: `${accent}40` }} />
        {contactLine ? (
          <p className="text-[10px] text-gray-400">{contactLine}</p>
        ) : (
          <p className="text-[10px] text-gray-400 italic">[Contact details]</p>
        )}
      </div>

    </div>
  )
}
