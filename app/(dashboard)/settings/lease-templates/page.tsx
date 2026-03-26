"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClauseConfigurator } from "@/components/leases/ClauseConfigurator"
import { Download, Trash2, Star } from "lucide-react"

interface Template {
  id: string
  name: string
  lease_type: string
  is_default: boolean
  created_at: string
}

export default function LeaseTemplatesPage() {
  const [activeTab, setActiveTab] = useState("defaults")
  const [clauseSubTab, setClauseSubTab] = useState("residential")
  const [templates, setTemplates] = useState<Template[]>([])

  useEffect(() => {
    async function loadTemplates() {
      const res = await fetch("/api/leases/templates")
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates ?? [])
      }
    }
    loadTemplates()
  }, [])

  return (
    <div>
      <h1 className="font-heading text-3xl mb-2">Lease Templates</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Configure default clause settings and manage custom templates.
      </p>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="defaults">Clause defaults</TabsTrigger>
          <TabsTrigger value="templates">My templates</TabsTrigger>
        </TabsList>

        <TabsContent value="defaults" className="mt-6">
          <p className="text-sm text-muted-foreground mb-4">
            Set your default clause configuration for new leases.
            You can override these for each individual lease.
          </p>

          <Tabs value={clauseSubTab} onValueChange={setClauseSubTab}>
            <TabsList>
              <TabsTrigger value="residential">Residential</TabsTrigger>
              <TabsTrigger value="commercial">Commercial</TabsTrigger>
            </TabsList>

            <TabsContent value="residential" className="mt-4">
              <ClauseConfigurator
                leaseType="residential"
                onSelectionsChange={() => {}}
              />
            </TabsContent>

            <TabsContent value="commercial" className="mt-4">
              <ClauseConfigurator
                leaseType="commercial"
                onSelectionsChange={() => {}}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Upload your own .docx lease templates with variable placeholders.
            </p>
            <Button size="sm" variant="outline" disabled>
              Upload new template
            </Button>
          </div>

          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground text-sm">No custom templates uploaded yet.</p>
                <p className="text-muted-foreground text-xs mt-1">
                  You can use the Pleks standard template for now.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {t.lease_type} · Uploaded {new Date(t.created_at).toLocaleDateString("en-ZA")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.is_default && (
                        <span className="text-xs text-brand flex items-center gap-1">
                          <Star className="size-3" /> Default
                        </span>
                      )}
                      <Button size="icon" variant="ghost" className="size-8">
                        <Download className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-8 text-danger">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Variable reference */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-sm">Variable placeholders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Your template can use these placeholders. They will be replaced with actual values when generating the lease.
              </p>
              <div className="bg-surface rounded-lg p-3 font-mono text-xs space-y-1 max-h-60 overflow-y-auto">
                {[
                  ["{{var:lessor_name}}", "Lessor's registered name"],
                  ["{{var:lessee_name}}", "Tenant's full name"],
                  ["{{var:property_address}}", "Property street address"],
                  ["{{var:unit_number}}", "Unit or flat number"],
                  ["{{var:commencement_date}}", "Lease start date"],
                  ["{{var:end_date}}", "Lease end date"],
                  ["{{var:monthly_rent_formatted}}", "e.g. R 6,500.00"],
                  ["{{var:deposit_formatted}}", "e.g. R 13,000.00"],
                  ["{{var:escalation_percent}}", "e.g. 8"],
                  ["{{var:notice_period_days}}", "e.g. 20"],
                  ["{{var:lessor_bank_name}}", "Bank name"],
                  ["{{var:lessor_account_number}}", "Account number"],
                  ["{{var:lessor_branch_code}}", "Branch code"],
                  ["{{var:signature_date}}", "Today's date"],
                  ["{{var:lessee_id_reg}}", "Tenant ID or registration"],
                  ["{{var:arrears_interest_margin}}", "e.g. 2"],
                  ["{{var:deposit_interest_rate}}", "e.g. 5"],
                  ["{{var:vat_rate}}", "e.g. 15"],
                ].map(([token, desc]) => (
                  <div key={token} className="flex gap-3">
                    <span className="text-brand shrink-0">{token}</span>
                    <span className="text-muted-foreground">— {desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
