/**
 * components/admin/RoleBadge.tsx — Uppercase context pill for role/context signalling
 *
 * Notes:  Used in AdminSidebar to signal PLATFORM context. Reusable for other roles.
 */

interface RoleBadgeProps {
  label: string
}

export function RoleBadge({ label }: RoleBadgeProps) {
  return (
    <span style={{
      fontFamily: "var(--mono)",
      fontSize: 9,
      letterSpacing: "0.12em",
      padding: "2px 6px",
      border: "1px solid oklch(0.78 0.16 70 / 0.5)",
      color: "oklch(0.85 0.10 70)",
      borderRadius: 3,
      textTransform: "uppercase",
      lineHeight: 1.4,
    }}>
      {label}
    </span>
  )
}
