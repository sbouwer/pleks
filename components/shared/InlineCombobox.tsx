"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props<T extends { id: string }> {
  id?: string
  value: string
  placeholder: string
  displayValue: string
  items: T[]
  getSearchText: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  onSelect: (item: T) => void
  loading?: boolean
  disabled?: boolean
}

/** Clicking the trigger turns it into a live search input; the list renders below at z-50. */
export function InlineCombobox<T extends { id: string }>({
  id,
  value,
  placeholder,
  displayValue,
  items,
  getSearchText,
  renderItem,
  onSelect,
  loading,
  disabled,
}: Readonly<Props<T>>) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function openCombobox() {
    if (disabled) return
    setSearch("")
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const filtered = items.filter((item) =>
    getSearchText(item).toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="h-9 rounded-lg bg-muted animate-pulse" />

  return (
    <div ref={containerRef} className="relative" id={id}>
      {open ? (
        <div className="flex items-center gap-2 w-full rounded-lg border border-brand bg-background px-3 py-2 ring-1 ring-brand">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={openCombobox}
          disabled={disabled}
          className={cn(
            "flex items-center gap-2 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-left transition-colors",
            disabled ? "opacity-50 cursor-not-allowed" : "hover:border-brand/50"
          )}
        >
          <span className="flex-1 text-sm truncate">
            {value ? displayValue : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        </button>
      )}

      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No results</li>
          ) : (
            filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onSelect(item); setOpen(false) }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
                    item.id === value && "bg-brand/10 font-medium"
                  )}
                >
                  {renderItem(item)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
