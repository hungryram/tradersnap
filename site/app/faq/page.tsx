import type { Metadata } from "next"
import { FaqList } from "../components/Faq"
import { PageHeader } from "../components/Section"

export const metadata: Metadata = { title: "FAQ", description: "Answers about Snapchart: how it works, trade tracking, privacy, plans and usage." }

export default function FaqPage() {
  return (
    <>
      <PageHeader title="Frequently asked questions" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <FaqList />
      </div>
    </>
  )
}
