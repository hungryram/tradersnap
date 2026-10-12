import type { Metadata } from "next"
import { PageHeader } from "../components/Section"
import FeedbackForm from "./FeedbackForm"

export const metadata: Metadata = { title: "Send feedback or report a bug" }

type Kind = "bug" | "idea" | "other"

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  const type = one(params.type)
  const initialKind: Kind = type === "bug" || type === "other" ? type : "idea"
  // The extension menu sends ?from=extension&v=<version>
  const source = one(params.from)?.slice(0, 40)
  const version = one(params.v)?.slice(0, 20)

  return (
    <>
      <PageHeader title="Send feedback or report a bug" intro="Tell us what happened or what you'd like to see. A real person reads every message." />
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <FeedbackForm initialKind={initialKind} source={source} version={version} />
      </div>
    </>
  )
}
