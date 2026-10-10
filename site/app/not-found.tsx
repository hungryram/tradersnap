export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-28 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-4 text-ink-text">That page doesn't exist. It may have moved.</p>
      <a href="/" className="mt-8 inline-block rounded-lg bg-brand-500 px-6 py-3 font-medium text-ink-bg hover:bg-brand-400">Back to home</a>
    </div>
  )
}
