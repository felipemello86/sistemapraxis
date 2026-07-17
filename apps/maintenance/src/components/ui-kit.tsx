import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary'
}) {
  const toneClasses: Record<string, string> = {
    default: 'bg-accent text-foreground',
    success: 'bg-[var(--success)]/12 text-[var(--success)]',
    warning: 'bg-[var(--warning)]/12 text-[var(--warning)]',
    danger: 'bg-destructive/12 text-destructive',
    primary: 'bg-primary/12 text-primary',
  }
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              toneClasses[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:p-6',
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
