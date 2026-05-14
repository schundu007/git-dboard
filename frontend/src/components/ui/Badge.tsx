import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'muted' | 'outline' | 'indigo' | 'nvidia'
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
  default:  'bg-neutral-800/60 text-neutral-300 ring-1 ring-neutral-700/40',
  success:  'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25',
  warning:  'bg-amber-500/[.07]   text-amber-400   ring-1 ring-amber-500/25',
  danger:   'bg-red-500/[.07]     text-red-400     ring-1 ring-red-500/25',
  info:     'bg-neutral-500/[.07] text-neutral-400  ring-1 ring-neutral-500/25',
  purple:   'bg-neutral-500/[.07] text-neutral-400  ring-1 ring-neutral-500/25',
  indigo:   'bg-[#76b900]/[.07]   text-nvidia      ring-1 ring-[#76b900]/25',
  nvidia:   'bg-[#76b900]/[.07]   text-nvidia      ring-1 ring-[#76b900]/25',
  muted:    'bg-surface-2 text-neutral-500 ring-1 ring-border-subtle',
  outline:  'text-neutral-400 ring-1 ring-border bg-transparent',
}

const dotColors: Record<Variant, string> = {
  default:  'bg-neutral-400',
  success:  'bg-emerald-400',
  warning:  'bg-amber-400',
  danger:   'bg-red-400',
  info:     'bg-neutral-400',
  purple:   'bg-neutral-400',
  indigo:   'bg-nvidia',
  nvidia:   'bg-nvidia',
  muted:    'bg-neutral-600',
  outline:  'bg-neutral-500',
}

const sizes: Record<Size, string> = {
  xs: 'text-[10px] px-1.5 py-0.5 gap-1 rounded',
  sm: 'text-[11px] px-2 py-0.5 gap-1.5 rounded-md',
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
        <span
          className={cn(
            'inline-block rounded-full flex-shrink-0',
            size === 'xs' ? 'w-1 h-1' : 'w-1.5 h-1.5',
            dotColors[variant],
            pulse && 'animate-pulse',
          )}
        />
      )}
      {children}
    </span>
  )
}

export function StatusDot({ status, size = 6 }: { status: string; size?: number }) {
  const color: Record<string, string> = {
    success:     'bg-emerald-400',
    completed:   'bg-emerald-400',
    passing:     'bg-emerald-400',
    online:      'bg-emerald-400',
    active:      'bg-emerald-400',
    failure:     'bg-red-400',
    failed:      'bg-red-400',
    error:       'bg-red-400',
    offline:     'bg-red-400',
    in_progress: 'bg-nvidia animate-pulse',
    running:     'bg-nvidia animate-pulse',
    queued:      'bg-neutral-400 animate-pulse',
    pending:     'bg-neutral-400 animate-pulse',
    cancelled:   'bg-neutral-500',
    skipped:     'bg-neutral-600',
    idle:        'bg-neutral-500',
  }

  return (
    <span
      className={cn('rounded-full inline-block flex-shrink-0', color[status] ?? 'bg-neutral-600')}
      style={{ width: size, height: size }}
    />
  )
}
