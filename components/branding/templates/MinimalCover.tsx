import type { CoverTemplateProps } from "./types"

export function MinimalCover({ identity, branding, leaseType = "residential" }: Readonly<CoverTemplateProps>) {
  const title = `${leaseType === "commercial" ? "Commercial" : "Residential"} Lease Agreement`
  const displayName = identity.tradingAs || identity.name || null
  const contactLine = [identity.address, identity.phone, identity.email].filter(Boolean).join("  ·  ")
  const accent = branding.accentColor

  return (
    <div className="h-full flex flex-col items-center justify-between px-12 py-16 text-center bg-white">
      {/* Main content block */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold text-gray-900 leading-snug mb-4">{title}</p>

        <p className="text-sm font-medium text-gray-700">
          {displayName ?? <span className="text-gray-400 italic">[Agency name]</span>}
        </p>
        {identity.registration && (
          <p className="text-xs text-gray-400 mt-1">{identity.registration}</p>
        )}

        {/* Thin accent line */}
        <div className="mt-6 h-[2px] w-10 rounded" style={{ background: accent }} />
      </div>

      {/* Logo at bottom */}
      <div className="mb-2">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="max-w-[80px] max-h-[40px] object-contain mx-auto mb-3" />
        ) : (
          <div className="w-16 h-8 border border-dashed rounded flex items-center justify-center text-[9px] text-gray-400 mx-auto mb-3"
            style={{ borderColor: `${accent}40` }}>
            Logo
          </div>
        )}
        {contactLine && (
          <p className="text-[11px] text-gray-400">{contactLine}</p>
        )}
      </div>
    </div>
  )
}
