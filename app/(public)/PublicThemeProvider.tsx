"use client"

/**
 * app/(public)/PublicThemeProvider.tsx — Light/dark theme context for public and onboarding routes
 *
 * Notes:  Wraps children in div.pleks-public, applies data-theme, exposes usePublicTheme().
 *         Server renders "light"; client hydrates from localStorage. suppressHydrationWarning
 *         silences the expected data-theme mismatch on first paint.
 */

import { createContext, useContext, useMemo, useSyncExternalStore } from "react"

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => ({ theme, toggle }), [theme])

  return (
    <Ctx.Provider value={ctx}>
      <div className="pleks-public" data-theme={theme} suppressHydrationWarning>
        {children}
      </div>
    </Ctx.Provider>
  )
}
