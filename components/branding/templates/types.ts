export interface CoverIdentity {
  name: string
  tradingAs: string | null
  registration: string | null
  eaab: string | null
  address: string
  phone: string
  email: string
  website: string | null
}

export interface CoverBranding {
  logoUrl: string | null
  accentColor: string
}

export interface CoverTemplateProps {
  identity: CoverIdentity
  branding: CoverBranding
  leaseType?: string
}
