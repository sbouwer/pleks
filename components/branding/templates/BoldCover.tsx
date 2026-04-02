import type { CoverTemplateProps } from "./types"

export function BoldCover({ identity, branding, leaseType = "residential" }: Readonly<CoverTemplateProps>) {
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
      <div className="flex-1 flex flex-col items-center justify-center px-12 py-10 text-center">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="max-w-[250px] max-h-[110px] object-contain mb-10" />
        ) : (
          <div className="w-40 h-16 border-2 border-dashed rounded flex items-center justify-center text-[10px] text-gray-400 mb-10"
            style={{ borderColor: `${accent}40` }}>
            Upload logo
          </div>
        )}

        <p className="font-bold tracking-widest text-base mb-4"
          style={{ color: accent, letterSpacing: "0.12em" }}>
          {title}
        </p>

        <p className="text-sm text-gray-500">
          {displayName ?? <span className="italic">[Agency name]</span>}
        </p>
      </div>

      {/* Bottom accent band */}
      <div className="h-[4px] w-full" style={{ background: accent }} />

      {/* Footer */}
      <div className="px-12 py-4 text-center">
        {regLine && <p className="text-[11px] text-gray-400 mb-1">{regLine}</p>}
        {contactLine && <p className="text-[11px] text-gray-400">{contactLine}</p>}
      </div>
    </div>
  )
}
