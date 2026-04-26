"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

type Theme = "light" | "dark"

interface PortalThemeCtx {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<PortalThemeCtx>({ theme: "light", toggle: () => {} })

export function usePortalTheme() { return useContext(ThemeContext) }

export function PortalThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [theme, setTheme] = useState<Theme>("light")

  useEffect(() => {
    const saved = localStorage.getItem("pleks-portal-theme") as Theme | null
    if (saved === "dark" || saved === "light") setTheme(saved) // eslint-disable-line react-hooks/set-state-in-effect
  }, [])

  function toggle() {
    setTheme(current => {
      const next = current === "light" ? "dark" : "light"
      localStorage.setItem("pleks-portal-theme", next)
      return next
    })
  }

  const ctx = useMemo<PortalThemeCtx>(() => ({ theme, toggle }), [theme])

  return (
    <ThemeContext.Provider value={ctx}>
      <div className="pleks-portal flex h-screen overflow-hidden" data-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
