import { MobileSettingsBackLink } from "@/components/mobile/MobileSettingsBackLink"

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <MobileSettingsBackLink />
      {children}
    </>
  )
}
