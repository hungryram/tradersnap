import type { Metadata } from "next"
import Pricing from "../components/Pricing"
import { FAQ, FaqList } from "../components/Faq"
import { PageHeader } from "../components/Section"

export const metadata: Metadata = {
  title: "Pricing",
  description: "Pip is free to start, with a 7-day Pro trial. Pro is $29 a month and Pro+ $99, with two months free on yearly plans.",
}

export default function PricingPage() {
  return (
    <>
      <PageHeader title="Simple pricing" intro="Start free with everything that keeps you disciplined. Upgrade when you trade more." />
      <div className="px-4 sm:px-6">
        <Pricing />
      </div>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-20">
        <FaqList groups={FAQ.filter((g) => g.title === "Plans and usage")} />
      </div>
    </>
  )
}
