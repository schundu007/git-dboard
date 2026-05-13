import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'default' | 'elevated' | 'interactive' | 'inset' | 'highlight'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  children: ReactNode
  noPad?: boolean
}

const variants: Record<Variant, string> = {
  default:     'bg-surface-1 border border-border rounded-xl shadow-card',
  elevated:    'bg-surface-1 border border-border rounded-xl shadow-lg',
  interactive: 'bg-surface-1 border border-border rounded-xl shadow-card hover:border-border-strong hover:shadow-card-hover hover:bg-surface-2 transition-all duration-200 cursor-pointer',
  inset:       'bg-surface-2 border border-border-subtle rounded-lg',
  highlight:   'bg-surface-1 border border-accent-blue/20 rounded-xl shadow-glow-blue',
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
    <h2 className={cn('text-sm font-semibold text-white', className)} {...props}>
      {children}
    </h2>
  )
}

export function CardDescription({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-xs text-gray-500 mt-0.5', className)} {...props}>
      {children}
    </p>
  )
}

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
  accentColor?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange'
}) {
  const accent: Record<string, string> = {
    blue:   'text-accent-blue',
    green:  'text-accent-green',
    red:    'text-accent-red',
    yellow: 'text-accent-yellow',
    purple: 'text-accent-purple',
    orange: 'text-accent-orange',
  }
  const iconBg: Record<string, string> = {
    blue:   'bg-accent-blue/10',
    green:  'bg-accent-green/10',
    red:    'bg-accent-red/10',
    yellow: 'bg-accent-yellow/10',
    purple: 'bg-accent-purple/10',
    orange: 'bg-accent-orange/10',
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 shadow-card hover:border-border-strong transition-colors">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        {icon && (
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconBg[accentColor])}>
            <span className={accent[accentColor]}>{icon}</span>
          </div>
        )}
      </div>
      <p className={cn('text-2xl font-semibold tracking-tight', accent[accentColor])}>{value}</p>
      {(sub || trend) && (
        <div className="flex items-center gap-2 mt-1.5">
          {sub && <p className="text-[11px] text-gray-600">{sub}</p>}
          {trend && (
            <span className={cn('text-[11px] font-medium', trendUp ? 'text-accent-green' : 'text-accent-red')}>
              {trendUp ? '↑' : '↓'} {trend}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
