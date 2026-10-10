// Shared building blocks for dashboard pages (dark "ink" theme)

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-text">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, action, children, className = "" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-ink-border bg-ink-surface p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-green-400" : tone === "bad" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-ink-body"
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-surface p-4 sm:p-5">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-text">{hint}</div>}
    </div>
  )
}

export function Notice({ tone, children }: { tone: "good" | "bad" | "info" | "warn"; children: React.ReactNode }) {
  const styles = {
    good: "border-green-500/30 bg-green-500/10 text-green-300",
    bad: "border-red-500/30 bg-red-500/10 text-red-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    info: "border-brand-500/30 bg-brand-500/10 text-brand-200",
  }[tone]
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>
}

export function Loading() {
  return (
    <div className="flex justify-center py-24">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-ink-border border-t-brand-500" />
    </div>
  )
}

export const buttonPrimary = "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 px-4 py-2 text-sm font-medium text-ink-bg transition-colors"
export const buttonSecondary = "inline-flex items-center justify-center gap-2 rounded-lg border border-ink-border bg-ink-elevated hover:border-ink-muted disabled:opacity-50 px-4 py-2 text-sm font-medium text-ink-body transition-colors"
export const buttonDanger = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 hover:bg-red-500/10 disabled:opacity-50 px-4 py-2 text-sm font-medium text-red-300 transition-colors"
export const inputClass = "w-full rounded-lg border border-ink-border bg-ink-bg px-3 py-2.5 text-sm text-ink-body placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500/60"

export function money(value: number) {
  return `${value < 0 ? "−" : value > 0 ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
