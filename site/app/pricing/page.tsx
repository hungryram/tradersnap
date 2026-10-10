import type { Metadata } from "next"
import Pricing from "../components/Pricing"
import { FAQ, FaqList } from "../components/Faq"
import { PageHeader } from "../components/Section"

export const metadata: Metadata = {
  title: "Pricing",
  description: "Pip is free to start. Pro gives you about 10 times more chart checks and coach messages every day for $19 a month.",
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
