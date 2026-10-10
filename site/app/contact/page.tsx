import type { Metadata } from "next"
import { DISCORD_URL, FEATURE_REQUESTS_URL, SUPPORT_EMAIL } from "../links"
import { PageHeader } from "../components/Section"

export const metadata: Metadata = { title: "Contact" }

export default function ContactPage() {
  return (
    <>
      <PageHeader title="Contact us" intro="Questions, feedback or need a hand? We'd love to hear from you." />
      <div className="mx-auto grid max-w-4xl gap-5 px-4 sm:px-6 md:grid-cols-3">
        <Card title="Email" text="We usually reply within 24 to 48 hours." href={`mailto:${SUPPORT_EMAIL}`} link={SUPPORT_EMAIL} />
        <Card title="Discord" text="Chat with other traders and the team." href={DISCORD_URL} link="Join the Discord" />
        <Card title="Have an idea?" text="Suggest a feature or vote on others." href={FEATURE_REQUESTS_URL} link="Feature requests" />
      </div>
    </>
  )
}

function Card({ title, text, href, link }: { title: string; text: string; href: string; link: string }) {
  const external = href.startsWith("http")
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-surface p-7">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-ink-text">{text}</p>
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="mt-5 inline-block text-sm font-medium text-brand-300 hover:underline break-all">
        {link}
      </a>
    </div>
  )
}
