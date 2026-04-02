import type { CoverTemplateProps } from "./types"

export function ClassicCover({ identity, branding, leaseType = "residential" }: Readonly<CoverTemplateProps>) {
  const title = `${leaseType === "commercial" ? "Commercial" : "Residential"} Lease Agreement`
  const displayName = identity.tradingAs || identity.name || null
  const contactLine = [identity.phone, identity.email, identity.website].filter(Boolean).join("  ·  ")
  const accent = branding.accentColor

  return (
    <div className="h-full flex flex-col items-center justify-center px-12 py-16 text-center bg-white">
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoUrl} alt="" className="max-w-[200px] max-h-[90px] object-contain mb-8" />
      ) : (
        <div className="w-32 h-14 border-2 border-dashed rounded flex items-center justify-center text-[10px] text-gray-400 mb-8"
          style={{ borderColor: `${accent}40` }}>
          Upload logo
        </div>
      )}

      <div className="w-full border-t mb-8" style={{ borderColor: accent }} />

      <p className="font-bold uppercase tracking-widest text-sm mb-6"
        style={{ color: accent, letterSpacing: "0.15em" }}>
        {title}
      </p>
      <p className="text-xs text-gray-400 mb-3">prepared by</p>

      <p className="font-semibold text-sm text-gray-800">
        {displayName ?? <span className="text-gray-400 italic">[Agency name]</span>}
      </p>
      {identity.registration && (
        <p className="text-xs text-gray-400 mt-1">{identity.registration}</p>
      )}
      {identity.eaab && (
        <p className="text-xs text-gray-400">FFC: {identity.eaab}</p>
      )}

      <div className="w-full border-t mt-8 mb-6" style={{ borderColor: accent }} />

      {identity.address && (
        <p className="text-xs text-gray-400 mb-1">{identity.address}</p>
      )}
      {contactLine && (
        <p className="text-xs text-gray-400">{contactLine}</p>
      )}
    </div>
  )
}
