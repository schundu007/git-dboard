import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'default' | 'elevated' | 'interactive' | 'inset' | 'flush'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  children: ReactNode
  noPad?: boolean
}

const variants: Record<Variant, string> = {
  // Standard card: top-edge inner highlight gives subtle dimensionality
  default:     'bg-surface-1 ring-1 ring-border rounded-xl shadow-card',
  elevated:    'bg-surface-1 ring-1 ring-border rounded-xl shadow-md',
  interactive: 'bg-surface-1 ring-1 ring-border rounded-xl shadow-card card-interactive cursor-pointer',
  inset:       'bg-surface-2 ring-1 ring-border-subtle rounded-lg',
  flush:       'bg-surface-1',
}

export function Card({ variant = 'default', children, noPad = false, className, ...props }: CardProps) {
  return (
    <div className={cn(variants[variant], !noPad && 'p-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-[13px] font-semibold text-white tracking-[-0.01em]', className)} {...props}>
      {children}
    </h2>
  )
}

export function CardDescription({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-[11px] text-neutral-600 mt-0.5', className)} {...props}>
      {children}
    </p>
  )
}

export function CardSection({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('border-t border-border px-4 py-3', className)} {...props}>
      {children}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
// Number is always white — no colored hero metrics.
// Icon uses accent color for quick categorical identification.
export function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
  trendUp,
  accentColor = 'blue',
}: {
  label: string
  value: string | number
  sub?: string
  icon?: ReactNode
  trend?: string
  trendUp?: boolean
  accentColor?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange' | 'indigo' | 'nvidia'
}) {
  const iconColors: Record<string, string> = {
    blue:   'text-blue-400',
    green:  'text-emerald-400',
    red:    'text-red-400',
    yellow: 'text-amber-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
    indigo: 'text-nvidia',
    nvidia: 'text-nvidia',
  }

  return (
    <div className="bg-surface-1 ring-1 ring-border rounded-xl p-4 shadow-card card-interactive">
      <div className="flex items-start justify-between mb-3">
        <p className="section-label">{label}</p>
        {icon && (
          <span className={cn('flex-shrink-0', iconColors[accentColor])}>
            {icon}
          </span>
        )}
      </div>
      <p className="stat-value">{value}</p>
      {(sub || trend) && (
        <div className="flex items-center gap-2 mt-2">
          {sub && <p className="text-[11px] text-neutral-600">{sub}</p>}
          {trend && (
            <span className={cn(
              'text-[11px] font-medium tabular-nums',
              trendUp ? 'text-emerald-400' : 'text-red-400',
            )}>
              {trendUp ? '+' : ''}{trend}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
