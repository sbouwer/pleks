import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <Image src="/logo.svg" alt="Pleks" width={200} height={80} className="mb-4" />
      <p className="text-muted-foreground text-lg md:text-xl max-w-2xl text-center mb-8">
        South African property management, built from the ground up.
        Smarter inspections, automated collections, legal-grade compliance.
      </p>
      <div className="flex gap-4">
        <Button size="lg" render={<Link href="/login" />}>
          Get Started
        </Button>
        <Button variant="outline" size="lg" render={<Link href="/pricing" />}>
          View Pricing
        </Button>
      </div>
    </div>
  )
}
