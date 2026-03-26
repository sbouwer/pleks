"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClauseConfigurator } from "@/components/leases/ClauseConfigurator"

export default function LeaseTemplatesPage() {
  const [clauseSubTab, setClauseSubTab] = useState("residential")

  return (
    <div>
      <h1 className="font-heading text-3xl mb-2">Lease Templates</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Configure default clause settings for new leases. You can override these for each individual lease.
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

      {/* Custom lease configuration CTA */}
      <Card className="border-brand/30 mt-8">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-sm">
                Need a fully custom lease?
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-sm">
                If your organisation uses a bespoke lease agreement,
                we can configure it for you. We&apos;ll set up your
                custom clause wording so it generates correctly
                with all your tenant and property details pre-filled.
              </p>
              <p className="text-xs text-brand mt-2 font-medium">
                Once-off configuration fee: R 1,000 excl. VAT
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => window.open(
                "mailto:support@pleks.co.za?subject=Custom lease configuration request",
                "_blank"
              )}
            >
              Request configuration
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
