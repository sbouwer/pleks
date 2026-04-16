"use client"

import { useState, useEffect, useRef } from "react"

export interface AvatarTenant {
  id: string
  name: string
  role: string
}

const AVATAR_VARIANT: Record<string, "brand" | "blue"> = {
  Primary: "brand",
}

const AVATAR_MAX = 4

export function CoTenantAvatars({
  tenants,
  activeIdx,
  onSelect,
}: {
  readonly tenants: AvatarTenant[]
  readonly activeIdx: number
  readonly onSelect: (i: number) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const visible = tenants.slice(0, AVATAR_MAX)
  const overflow = tenants.slice(AVATAR_MAX)

  return (
    <div ref={ref} className="flex items-center gap-1 relative">
      {visible.map((t, i) => {
        const isActive = activeIdx === i
        const avatarCls = AVATAR_VARIANT[t.role] === "brand" ? "bg-brand/20 text-brand" : "bg-blue-100 text-blue-700"
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(i)}
            title={`${t.name} · ${t.role}`}
            className={`h-6 w-6 rounded-full text-[9px] font-bold flex items-center justify-center transition-all ${avatarCls} ${
              isActive ? "ring-2 ring-brand ring-offset-1 ring-offset-card" : "opacity-50 hover:opacity-80"
            }`}
          >
            {t.name.slice(0, 2).toUpperCase()}
          </button>
        )
      })}
      {overflow.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className={`h-6 w-6 rounded-full text-[9px] font-bold flex items-center justify-center transition-all bg-muted text-muted-foreground hover:bg-muted/80 ${
              activeIdx >= AVATAR_MAX ? "ring-2 ring-brand ring-offset-1 ring-offset-card" : ""
            }`}
          >
            +{overflow.length}
          </button>
          {open && (
            <div className="absolute right-0 top-7 z-20 min-w-[160px] rounded-lg border border-border bg-card shadow-md py-1">
              {overflow.map((t, i) => {
                const realIdx = AVATAR_MAX + i
                const isActive = activeIdx === realIdx
                const avatarCls = AVATAR_VARIANT[t.role] === "brand" ? "bg-brand/20 text-brand" : "bg-blue-100 text-blue-700"
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onSelect(realIdx); setOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted transition-colors ${isActive ? "text-brand font-semibold" : ""}`}
                  >
                    <span className={`h-5 w-5 shrink-0 rounded-full text-[9px] font-bold flex items-center justify-center ${avatarCls}`}>
                      {t.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground/70 shrink-0">{t.role}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
