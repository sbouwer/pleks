/**
 * app/(dashboard)/leases/[leaseId]/contact-info.ts — the tenant and landlord shapes a lease's tabs render
 *
 * Data:   assembled in app/(dashboard)/leases/[leaseId]/page.tsx from leases, tenants, contacts and
 *         portal state; this module declares the shapes only and reads nothing itself.
 * Notes:  Lives apart from ContactsTab so LeasePortalActions can import TenantContactInfo without
 *         importing its own parent. ContactsTab declared both and rendered LeasePortalActions,
 *         which imported one back — a circular import that compiled only because the edge is
 *         type-only. idOrRegNumber is already masked by the time it reaches these shapes; nothing
 *         here should ever carry a raw decrypted identifier.
 */
import type { PortalStatus } from "@/components/contacts/ContactCard"

export interface TenantContactInfo {
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
  address?: string | null
  entityType: string | null
  tenantId: string
  ficaVerified: boolean | null
  idOrRegNumber: string | null
  idOrRegLabel: string
  portalStatus: "none" | "invited" | "active" | null
  welcomePackSentAt: string | null
}

export interface LandlordContactInfo {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  address?: string | null
  entityType: string | null
  ficaVerified: boolean | null
  idOrRegNumber: string | null
  idOrRegLabel: string
  portalStatus: PortalStatus
}
