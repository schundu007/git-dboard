import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'muted' | 'outline'
type Size    = 'xs' | 'sm' | 'md'

interface BadgeProps {
  children: ReactNode
  variant?: Variant
  size?: Size
  dot?: boolean
  pulse?: boolean
  className?: string
}

const variants: Record<Variant, string> = {
  default:  'bg-surface-3 text-gray-300 border border-border',
  success:  'bg-accent-green/10 text-accent-green border border-accent-green/25',
  warning:  'bg-accent-yellow/10 text-accent-yellow border border-accent-yellow/25',
  danger:   'bg-accent-red/10 text-accent-red border border-accent-red/25',
  info:     'bg-accent-blue/10 text-accent-blue border border-accent-blue/25',
  purple:   'bg-accent-purple/10 text-accent-purple border border-accent-purple/25',
  muted:    'bg-surface-2 text-gray-500 border border-border-subtle',
  outline:  'text-gray-400 border border-border bg-transparent',
}

const dotColors: Record<Variant, string> = {
  default: 'bg-gray-400',
  success: 'bg-accent-green',
  warning: 'bg-accent-yellow',
  danger:  'bg-accent-red',
  info:    'bg-accent-blue',
  purple:  'bg-accent-purple',
  muted:   'bg-gray-600',
  outline: 'bg-gray-500',
}

const sizes: Record<Size, string> = {
  xs: 'text-[10px] px-1.5 py-0.5 gap-1 rounded',
  sm: 'text-[11px] px-2 py-0.5 gap-1.5 rounded',
  md: 'text-xs px-2.5 py-1 gap-2 rounded-md',
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  dot = false,
  pulse = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {dot && (
        <span className={cn('inline-block rounded-full flex-shrink-0', size === 'xs' ? 'w-1 h-1' : 'w-1.5 h-1.5', dotColors[variant], pulse && 'animate-pulse')} />
      )}
      {children}
    </span>
  )
}

export function StatusDot({ status, size = 6 }: { status: string; size?: number }) {
  const color = {
    success:    'bg-accent-green',
    completed:  'bg-accent-green',
    passing:    'bg-accent-green',
    online:     'bg-accent-green',
    active:     'bg-accent-green',
    failure:    'bg-accent-red',
    failed:     'bg-accent-red',
    error:      'bg-accent-red',
    offline:    'bg-accent-red',
    in_progress:'bg-accent-blue animate-pulse',
    running:    'bg-accent-blue animate-pulse',
    queued:     'bg-accent-yellow animate-pulse',
    pending:    'bg-accent-yellow animate-pulse',
    cancelled:  'bg-gray-500',
    skipped:    'bg-gray-600',
    idle:       'bg-gray-500',
  }[status] ?? 'bg-gray-600'

  return (
    <span
      className={cn('rounded-full inline-block flex-shrink-0', color)}
      style={{ width: size, height: size }}
    />
  )
}
