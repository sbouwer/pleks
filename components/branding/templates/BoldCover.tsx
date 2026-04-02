import type { CoverTemplateProps } from "./types"
import { PartiesSection } from "./PartiesSection"

export function BoldCover({ identity, branding, leaseType = "residential", parties }: Readonly<CoverTemplateProps>) {
  const title = `${leaseType === "commercial" ? "COMMERCIAL" : "RESIDENTIAL"} LEASE AGREEMENT`
  const displayName = identity.tradingAs || identity.name || null
  const regLine = [identity.registration, identity.eaab ? `FFC: ${identity.eaab}` : null].filter(Boolean).join("  ·  ")
  const contactLine = [identity.phone, identity.email].filter(Boolean).join("  ·  ")
  const accent = branding.accentColor

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top accent band */}
      <div className="h-[4px] w-full" style={{ background: accent }} />

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-10 py-8 text-center">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="max-w-[220px] max-h-[90px] object-contain mb-8" />
        ) : (
          <div className="w-36 h-14 border-2 border-dashed rounded flex items-center justify-center text-[10px] text-gray-400 mb-8"
            style={{ borderColor: `${accent}40` }}>
            Upload logo
          </div>
        )}

        <p className="font-bold tracking-widest text-base mb-3"
          style={{ color: accent, letterSpacing: "0.12em" }}>
          {title}
        </p>

        <p className="text-sm text-gray-500 mb-6">
          {displayName ?? <span className="italic">[Agency name]</span>}
        </p>

        {/* Parties block */}
        {parties && (
          <div className="w-full border-t pt-5" style={{ borderColor: `${accent}30` }}>
            <PartiesSection parties={parties} />
          </div>
        )}
      </div>

      {/* Bottom accent band */}
      <div className="h-[4px] w-full" style={{ background: accent }} />

      {/* Footer */}
      <div className="px-10 py-3 text-center">
        {regLine && <p className="text-[10px] text-gray-400 mb-0.5">{regLine}</p>}
        {contactLine && <p className="text-[10px] text-gray-400">{contactLine}</p>}
      </div>
    </div>
  )
}
