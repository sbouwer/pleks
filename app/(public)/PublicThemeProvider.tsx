"use client"

/**
 * app/(public)/PublicThemeProvider.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { createContext, useContext, useSyncExternalStore } from "react"

type Theme = "light" | "dark"

const STORAGE_KEY = "pleks-pub-theme"

function subscribe(cb: () => void) {
  globalThis.addEventListener("storage", cb)
  return () => globalThis.removeEventListener("storage", cb)
}

function getSnapshot(): Theme {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === "dark" ? "dark" : "light"
}

function getServerSnapshot(): Theme {
  return "light"
}

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: "light", toggle: () => {} })

export function usePublicTheme() {
  return useContext(Ctx)
}

export function PublicThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  // useSyncExternalStore — server renders "light", client syncs from localStorage.
  // suppressHydrationWarning on the wrapper div silences the expected data-theme diff.
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  function toggle() {
    const next = theme === "light" ? "dark" : "light"
    localStorage.setItem(STORAGE_KEY, next)
    // localStorage.setItem doesn't fire a storage event within the same tab, so dispatch manually.
    globalThis.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: next }))
  }

  return (
    <Ctx.Provider value={{ theme, toggle }}>
      <div className="pleks-public" data-theme={theme} suppressHydrationWarning>
        {children}
      </div>
    </Ctx.Provider>
  )
}
