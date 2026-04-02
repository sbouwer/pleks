import type { CoverParties } from "./types"

/**
 * Compact party-details block rendered at the bottom of each cover template.
 * Uses a two-column label/value grid so all four template styles share identical
 * party layout — only outer wrapper styling differs per template.
 */
export function PartiesSection({ parties }: Readonly<{ parties: CoverParties }>) {
  return (
    <div className="grid grid-cols-[52px_1fr] gap-x-3 gap-y-0 text-left">

      {/* Lessor */}
      <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 pt-0.5 leading-tight">
        Lessor
      </span>
      <div className="leading-snug">
        <p className="text-[10px] font-medium text-gray-700">{parties.lessorName}</p>
        {parties.lessorAddress && (
          <p className="text-[10px] text-gray-400">{parties.lessorAddress}</p>
        )}
      </div>

      {/* Managing agent — only if applicable */}
      {parties.agentName && (
        <>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 pt-1.5 leading-tight">
            Agent
          </span>
          <div className="leading-snug pt-1.5">
            <p className="text-[10px] font-medium text-gray-700">{parties.agentName}</p>
            {parties.agentContact && (
              <p className="text-[10px] text-gray-400">{parties.agentContact}</p>
            )}
          </div>
        </>
      )}

      {/* Lessee(s) */}
      <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 pt-1.5 leading-tight">
        Lessee
      </span>
      <div className="leading-snug pt-1.5">
        <p className="text-[10px] font-medium text-gray-700">{parties.lesseeName}</p>
        {parties.lessee2Name && (
          <p className="text-[10px] font-medium text-gray-700">{parties.lessee2Name}</p>
        )}
        {parties.lesseeAddress && (
          <p className="text-[10px] text-gray-400">{parties.lesseeAddress}</p>
        )}
        {parties.lesseeContact && (
          <p className="text-[10px] text-gray-400">{parties.lesseeContact}</p>
        )}
      </div>

    </div>
  )
}
