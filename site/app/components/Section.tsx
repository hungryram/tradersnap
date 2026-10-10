export function Section({ id, eyebrow, title, intro, children }: {
  id?: string; eyebrow?: string; title: string; intro?: string; children: React.ReactNode
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 sm:px-6 pt-24">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        {eyebrow && <p className="mb-3 text-sm font-medium text-brand-300">{eyebrow}</p>}
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">{title}</h2>
        {intro && <p className="mt-4 text-ink-text leading-relaxed">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

export function PageHeader({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-16 sm:pt-20 pb-12 text-center">
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">{title}</h1>
      {intro && <p className="mt-4 text-lg text-ink-text leading-relaxed">{intro}</p>}
    </div>
  )
}
