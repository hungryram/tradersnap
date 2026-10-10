// Plain document layout for the privacy policy and terms
export default function Legal({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 pt-16 text-ink-text leading-relaxed
      [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink-body
      [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-semibold [&_h3]:text-ink-body
      [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6
      [&_strong]:text-ink-body [&_a]:text-brand-300 [&_a:hover]:underline">
      <h1 className="text-4xl font-semibold tracking-tight text-ink-body">{title}</h1>
      <p className="!mt-3 text-sm text-ink-muted">Last updated: {updated}</p>
      {children}
    </article>
  )
}
