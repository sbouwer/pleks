"use client"

import { createContext, useContext, useEffect, useState, startTransition } from "react"

type Theme = "light" | "dark"

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: "light", toggle: () => {} })

export function usePublicTheme() {
  return useContext(Ctx)
}

export function PublicThemeProvider({ children }: { children: React.ReactNode }) {
  // Always "light" on server and initial client render — both agree, no hydration mismatch.
  // After mount, startTransition syncs from localStorage as a non-urgent update.
  // suppressHydrationWarning on the wrapper div silences the expected data-theme diff.
  const [theme, setTheme] = useState<Theme>("light")

  useEffect(() => {
    const stored = localStorage.getItem("pleks-pub-theme")
    if (stored === "dark" || stored === "light") {
      startTransition(() => setTheme(stored))
    }
  }, [])

  function toggle() {
    setTheme(prev => {
      const next = prev === "light" ? "dark" : "light"
      localStorage.setItem("pleks-pub-theme", next)
      return next
    })
  }

  return (
    <Ctx.Provider value={{ theme, toggle }}>
      <div className="pleks-public" data-theme={theme} suppressHydrationWarning>
        {children}
      </div>
    </Ctx.Provider>
  )
}
